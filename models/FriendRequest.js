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