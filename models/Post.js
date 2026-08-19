const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'posts';

// The three post types required by §21.
const TYPES = ['text', 'image', 'video'];

/**
 * Agreed document shape:
 * {
 *   _id, author: ObjectId(User), group: ObjectId(Group) | null,
 *   type: 'text' | 'image' | 'video',
 *   content, mediaUrl, tags: [String],
 *   place: ObjectId(Place) | null,
 *   likes: [ObjectId(User)],
 *   sharedToSocial: Boolean,
 *   createdAt
 * }
 *
 * group === null means the post went to the author's personal wall
 * rather than into a group.
 */

function collection() {
    return getDB().collection(COLLECTION);
}

const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['author', 'type', 'likes', 'createdAt'],
        properties: {
            author:         { bsonType: 'objectId' },
            group:          { bsonType: ['objectId', 'null'] },
            // enum is what actually guarantees only the three types in §21.
            type:           { enum: TYPES },
            content:        { bsonType: 'string', maxLength: 2000 },
            mediaUrl:       { bsonType: ['string', 'null'] },
            tags:           { bsonType: 'array' },
            place:          { bsonType: ['objectId', 'null'] },
            likes:          { bsonType: 'array' },
            sharedToSocial: { bsonType: 'bool' },
            createdAt:      { bsonType: 'date' }
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
    await collection().createIndex({ author: 1 });
    await collection().createIndex({ group: 1 });
    await collection().createIndex({ createdAt: -1 });
    await collection().createIndex({ tags: 1 });
    // Compound index for the feed query: filter by group, sort by date.
    await collection().createIndex({ group: 1, createdAt: -1 });
}

async function create(post) {
    if (!TYPES.includes(post.type)) {
        throw new Error('Invalid post type: ' + post.type);
    }
    const doc = {
        author: new ObjectId(post.author),
        group: post.group ? new ObjectId(post.group) : null,
        type: post.type,
        content: post.content || '',
        mediaUrl: post.mediaUrl || null,
        tags: post.tags || [],
        place: post.place ? new ObjectId(post.place) : null,
        likes: [],
        sharedToSocial: false,
        createdAt: new Date()
    };
    const result = await collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

async function findAll() {
    return collection().find({}).sort({ createdAt: -1 }).toArray();
}

/**
 * A post stores only `author: ObjectId`. To display it we need the author's
 * name and username, which live in another collection.
 *
 * The MongoDB deck (slide 35) called ObjectId references "MongoDB's
 * alternative to Join". $lookup is how you follow such a reference inside a
 * single query, instead of fetching posts and then querying users N times.
 */
const WITH_AUTHOR = [
    {
        $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'authorDoc'
        }
    },
    { $unwind: '$authorDoc' },
    {
        // Replace the raw ObjectId with the few author fields a view needs.
        // passwordHash and email are deliberately left out.
        $addFields: {
            author: {
                _id: '$authorDoc._id',
                username: '$authorDoc.username',
                fullName: '$authorDoc.fullName',
                avatarUrl: '$authorDoc.avatarUrl'
            }
        }
    },
    // Second lookup: the group's name, so a card can say "in Web Dev 2026".
    // preserveNullAndEmptyArrays keeps personal posts (group === null), which
    // would otherwise be dropped entirely by $unwind.
    {
        $lookup: {
            from: 'groups',
            localField: 'group',
            foreignField: '_id',
            as: 'groupDoc'
        }
    },
    { $unwind: { path: '$groupDoc', preserveNullAndEmptyArrays: true } },
    { $addFields: { groupName: '$groupDoc.name' } },
    { $project: { authorDoc: 0, groupDoc: 0 } }
];

async function findByIdWithAuthor(id) {
    const rows = await collection()
        .aggregate([{ $match: { _id: new ObjectId(id) } }, ...WITH_AUTHOR])
        .toArray();
    return rows[0] || null;
}

// Everything posted into one group, for the group page.
async function findByGroupWithAuthor(groupId) {
    return collection()
        .aggregate([
            { $match: { group: new ObjectId(groupId) } },
            { $sort: { createdAt: -1 } },
            ...WITH_AUTHOR
        ])
        .toArray();
}

/**
 * Deleting a group must not orphan its posts — they would keep a `group`
 * reference pointing at a document that no longer exists, and the feed would
 * try to resolve it. Setting group back to null turns them into ordinary
 * personal posts, which is kinder than deleting other people's content.
 */
async function detachFromGroup(groupId) {
    const result = await collection().updateMany(
        { group: new ObjectId(groupId) },
        { $set: { group: null } }
    );
    return result.modifiedCount;
}

async function findByAuthorWithAuthor(userId) {
    return collection()
        .aggregate([
            { $match: { author: new ObjectId(userId) } },
            { $sort: { createdAt: -1 } },
            ...WITH_AUTHOR
        ])
        .toArray();
}

// "My posts" (§27).
async function findByAuthor(userId) {
    return collection()
        .find({ author: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .toArray();
}

async function findByGroup(groupId) {
    return collection()
        .find({ group: new ObjectId(groupId) })
        .sort({ createdAt: -1 })
        .toArray();
}

async function update(id, fields) {
    // Reference fields arrive from a form as strings. The $jsonSchema
    // validator demands real ObjectIds, so convert here — type handling is
    // the model's job, not the controller's.
    const doc = { ...fields };
    if ('group' in doc) doc.group = doc.group ? new ObjectId(doc.group) : null;
    if ('place' in doc) doc.place = doc.place ? new ObjectId(doc.place) : null;

    await collection().updateOne({ _id: new ObjectId(id) }, { $set: doc });
    return findById(id);
}

async function remove(id) {
    const result = await collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
}

async function countAll() {
    return collection().countDocuments();
}

async function getPostTypeStats() {
    const results = await collection().aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
    ]).toArray();
    const counts = { text: 0, image: 0, video: 0 };
    results.forEach(r => { if (r._id) counts[r._id] = r.count; });
    return Object.keys(counts).map(type => ({ type, count: counts[type] }));
}

async function getGroupPostTypeStats(groupId) {
    const results = await collection().aggregate([
        { $match: { group: new ObjectId(groupId) } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
    ]).toArray();
    const counts = { text: 0, image: 0, video: 0 };
    results.forEach(r => { if (r._id) counts[r._id] = r.count; });
    return Object.keys(counts).map(type => ({ type, count: counts[type] }));
}

async function getGroupTopContributors(groupId, limit = 5) {
    return collection().aggregate([
        { $match: { group: new ObjectId(groupId) } },
        { $group: { _id: '$author', postCount: { $sum: 1 } } },
        { $sort: { postCount: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userDoc'
            }
        },
        { $unwind: '$userDoc' },
        {
            $project: {
                userId: '$_id',
                username: '$userDoc.username',
                fullName: '$userDoc.fullName',
                postCount: 1
            }
        }
    ]).toArray();
}

async function getPostActivityTimeline() {
    return collection().aggregate([
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } }
    ]).toArray();
}

async function getUserStats(userId) {
    const typeResults = await collection().aggregate([
        { $match: { author: new ObjectId(userId) } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
    ]).toArray();
    const counts = { text: 0, image: 0, video: 0 };
    typeResults.forEach(r => { if (r._id) counts[r._id] = r.count; });

    const likesResult = await collection().aggregate([
        { $match: { author: new ObjectId(userId) } },
        { $group: { _id: null, totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } }, totalPosts: { $sum: 1 } } }
    ]).toArray();

    return {
        types: Object.keys(counts).map(type => ({ type, count: counts[type] })),
        totalPosts: likesResult[0] ? likesResult[0].totalPosts : 0,
        totalLikes: likesResult[0] ? likesResult[0].totalLikes : 0
    };
}

async function getTotalLikesCount() {
    const res = await collection().aggregate([
        { $group: { _id: null, totalLikes: { $sum: { $size: { $ifNull: ['$likes', []] } } } } }
    ]).toArray();
    return res[0] ? res[0].totalLikes : 0;
}

// Feed query (§27): Posts from friends, own posts, and groups the user belongs to.
// MongoDB's $match with $or guarantees every matching post is returned exactly once.
async function findFeedPosts({ userId, friendIds = [], groupIds = [] }) {
    const authors = [
        new ObjectId(userId),
        ...friendIds.map(id => new ObjectId(id))
    ];

    const orClauses = [
        { author: { $in: authors } }
    ];

    if (groupIds && groupIds.length > 0) {
        orClauses.push({
            group: { $in: groupIds.map(id => new ObjectId(id)) }
        });
    }

    return collection()
        .aggregate([
            { $match: { $or: orClauses } },
            { $sort: { createdAt: -1 } },
            ...WITH_AUTHOR
        ])
        .toArray();
}

module.exports = {
    COLLECTION,
    applySchema,
    TYPES,
    createIndexes,
    create,
    findById,
    findByIdWithAuthor,
    findAll,
    findByAuthor,
    findByAuthorWithAuthor,
    findByGroup,
    findByGroupWithAuthor,
    detachFromGroup,
    findFeedPosts,
    update,
    remove,
    countAll,
    getPostTypeStats,
    getGroupPostTypeStats,
    getGroupTopContributors,
    getPostActivityTimeline,
    getUserStats,
    getTotalLikesCount
};
