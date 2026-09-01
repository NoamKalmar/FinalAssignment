const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'friendRequests';

/**
 * Agreed document shape:
 * {
 *   _id, from: ObjectId(User), to: ObjectId(User),
 *   status: 'pending' | 'accepted' | 'rejected',
 *   createdAt
 * }
 *
 * A separate collection, same reasoning as Comment.js: this is its own kind
 * of record with its own lifecycle, not just a flag on User.
 *
 * Rejected requests are kept (not deleted) as a history record, but do not
 * block sending a new request later — old rejected/accepted rows are simply
 * ignored when checking for an existing pending request.
 */

function collection() {
    return getDB().collection(COLLECTION);
}

/**
 * Search input is text to look for, not a regular expression.
 * Without this, searching for "(" throws and returns a 500, while "."
 * quietly matches everyone (§29).
 */
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['from', 'to', 'status', 'createdAt'],
        properties: {
            from:      { bsonType: 'objectId' },
            to:        { bsonType: 'objectId' },
            status:    { enum: ['pending', 'accepted', 'rejected'] },
            createdAt: { bsonType: 'date' }
        }
    }
};

async function applySchema() {
    const db = getDB();
    const exists = await db.listCollections({ name: COLLECTION }).hasNext();
    if (exists) {
        await db.command({ collMod: COLLECTION, validator: SCHEMA, validationLevel: 'strict' });
    } else {
        await db.createCollection(COLLECTION, { validator: SCHEMA, validationLevel: 'strict' });
    }
}

async function createIndexes() {
    // "Do I already have a pending request to/from this person?" is checked
    // on every profile view, so both directions need to be fast.
    await collection().createIndex({ from: 1, to: 1 });
    await collection().createIndex({ to: 1, status: 1 });
}

// Only one *pending* request should exist between two people at a time —
// old accepted/rejected rows are irrelevant history, not a block.
async function findPendingBetween(userAId, userBId) {
    return collection().findOne({
        status: 'pending',
        $or: [
            { from: new ObjectId(userAId), to: new ObjectId(userBId) },
            { from: new ObjectId(userBId), to: new ObjectId(userAId) }
        ]
    });
}
// All user-IDs the current user has a PENDING outgoing request to,
// as a Set of strings — used to grey out "Send Request" in bulk lists
// without querying once per user.
async function findPendingOutgoingTargets(userId) {
    const rows = await collection()
        .find({ from: new ObjectId(userId), status: 'pending' })
        .project({ to: 1 })
        .toArray();
    return new Set(rows.map(r => String(r.to)));
}

async function create(fromId, toId) {
    const doc = {
        from: new ObjectId(fromId),
        to: new ObjectId(toId),
        status: 'pending',
        createdAt: new Date()
    };
    const result = await collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

/**
 * Friend request search — §22, which asks for Search on every model.
 *
 * Four optional parameters: keyword (the other person's name or username),
 * status, from, to. Always scoped to the current user, in both directions:
 * requests they sent and requests they received. Without that scope one user
 * could read another user's requests, which §25 forbids.
 *
 * The name filter has to run after the $lookup, because the name lives on the
 * user document rather than on the request — so there are two $match stages,
 * the cheap one first.
 */
async function search(userId, params = {}) {
    const me = new ObjectId(userId);
    const match = { $or: [{ from: me }, { to: me }] };

    if (params.status && ['pending', 'accepted', 'rejected'].includes(params.status)) {
        match.status = params.status;
    }

    const range = {};
    if (params.from) {
        const d = new Date(params.from);
        if (!isNaN(d)) range.$gte = d;
    }
    if (params.to) {
        const d = new Date(params.to);
        if (!isNaN(d)) {
            d.setHours(23, 59, 59, 999);
            range.$lte = d;
        }
    }
    if (Object.keys(range).length) match.createdAt = range;

    const pipeline = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $lookup: { from: 'users', localField: 'from', foreignField: '_id', as: 'fromDoc' } },
        { $unwind: '$fromDoc' },
        { $lookup: { from: 'users', localField: 'to', foreignField: '_id', as: 'toDoc' } },
        { $unwind: '$toDoc' }
    ];

    if (params.keyword && params.keyword.trim()) {
        const rx = { $regex: escapeRegex(params.keyword.trim()), $options: 'i' };
        pipeline.push({
            $match: {
                $or: [
                    { 'fromDoc.fullName': rx }, { 'fromDoc.username': rx },
                    { 'toDoc.fullName': rx }, { 'toDoc.username': rx }
                ]
            }
        });
    }

    pipeline.push(
        {
            $addFields: {
                // "did I send this one?" — the view needs it to label the row
                outgoing: { $eq: ['$from', me] },
                from: { _id: '$fromDoc._id', username: '$fromDoc.username', fullName: '$fromDoc.fullName' },
                to: { _id: '$toDoc._id', username: '$toDoc.username', fullName: '$toDoc.fullName' }
            }
        },
        { $project: { fromDoc: 0, toDoc: 0 } },
        { $limit: 100 }
    );

    return collection().aggregate(pipeline).toArray();
}

// Pending requests sent TO this user, with the sender's name/avatar attached
// — same $lookup pattern used throughout the project (Post.js, Comment.js).
async function findPendingForUser(userId) {
    return collection()
        .aggregate([
            { $match: { to: new ObjectId(userId), status: 'pending' } },
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'from',
                    foreignField: '_id',
                    as: 'fromDoc'
                }
            },
            { $unwind: '$fromDoc' },
            {
                $addFields: {
                    from: {
                        _id: '$fromDoc._id',
                        username: '$fromDoc.username',
                        fullName: '$fromDoc.fullName',
                        avatarUrl: '$fromDoc.avatarUrl'
                    }
                }
            },
            { $project: { fromDoc: 0 } }
        ])
        .toArray();
}

async function setStatus(id, status) {
    await collection().updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
    );
    return findById(id);
}

async function countPendingForUser(userId) {
    return collection().countDocuments({ to: new ObjectId(userId), status: 'pending' });
}

module.exports = {
    search,
    COLLECTION,
    applySchema,
    createIndexes,
    findPendingBetween,
    create,
    findById,
    findPendingOutgoingTargets,
    findPendingForUser,
    setStatus,
    countPendingForUser
};