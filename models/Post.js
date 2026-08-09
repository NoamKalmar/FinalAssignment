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
    { $project: { authorDoc: 0 } }
];

async function findByIdWithAuthor(id) {
    const rows = await collection()
        .aggregate([{ $match: { _id: new ObjectId(id) } }, ...WITH_AUTHOR])
        .toArray();
    return rows[0] || null;
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
    await collection().updateOne({ _id: new ObjectId(id) }, { $set: fields });
    return findById(id);
}

async function remove(id) {
    const result = await collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
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
    update,
    remove
};
