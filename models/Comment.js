const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'comments';

/**
 * Agreed document shape:
 * {
 *   _id, post: ObjectId(Post), author: ObjectId(User),
 *   content: String,
 *   createdAt, updatedAt
 * }
 *
 * A separate collection (not embedded in Post) so a single post can never
 * hit MongoDB's 16MB document cap, and so a comment's author can be
 * resolved via $lookup the same way Post.js resolves post authors.
 */

function collection() {
    return getDB().collection(COLLECTION);
}

const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['post', 'author', 'content', 'createdAt'],
        properties: {
            post:      { bsonType: 'objectId' },
            author:    { bsonType: 'objectId' },
            content:   { bsonType: 'string', minLength: 1, maxLength: 500 },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: ['date', 'null'] },
            likes:     { bsonType: 'array' }
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
    // Every comment page fetches "all comments for this post, oldest first" —
    // this compound index serves that query directly.
    await collection().createIndex({ post: 1, createdAt: 1 });
    await collection().createIndex({ author: 1 });
}

async function create({ post, author, content }) {
    const doc = {
        post: new ObjectId(post),
        author: new ObjectId(author),
        content: content.trim(),
        likes: [],
        createdAt: new Date(),
        updatedAt: null
    };
    const result = await collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

/**
 * All comments for a post, with the author's name/avatar attached —
 * same $lookup pattern Post.js uses for post authors (WITH_AUTHOR).
 */
async function findByPostWithAuthor(postId) {
    return collection()
        .aggregate([
            { $match: { post: new ObjectId(postId) } },
            { $sort: { createdAt: 1 } },
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
        ])
        .toArray();
}

async function update(id, content) {
    await collection().updateOne(
        { _id: new ObjectId(id) },
        { $set: { content: content.trim(), updatedAt: new Date() } }
    );
    return findById(id);
}

async function remove(id) {
    const result = await collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
}
// Same single-round-trip pattern as Post.toggleLike — avoids a race between
// two fast clicks by letting the query itself decide $pull vs $addToSet.
async function toggleLike(commentId, userId) {
    const commentObjId = new ObjectId(commentId);
    const userObjId = new ObjectId(userId);

    const existing = await collection().findOne(
        { _id: commentObjId },
        { projection: { likes: 1 } }
    );
    if (!existing) throw new Error('Comment not found');

    const hasLiked = (existing.likes || []).some(id => userObjId.equals(id));

    const updated = await collection().findOneAndUpdate(
        hasLiked
            ? { _id: commentObjId, likes: userObjId }
            : { _id: commentObjId, likes: { $ne: userObjId } },
        hasLiked
            ? { $pull: { likes: userObjId } }
            : { $addToSet: { likes: userObjId } },
        { returnDocument: 'after', projection: { likes: 1 } }
    );

    const likes = (updated && updated.likes) || existing.likes || [];

    return {
        hasLiked: likes.some(id => userObjId.equals(id)),
        likesCount: likes.length
    };
}

// Used when a post is deleted, so its comments don't become orphaned data.
async function removeByPost(postId) {
    const result = await collection().deleteMany({ post: new ObjectId(postId) });
    return result.deletedCount;
}

async function countByPost(postId) {
    return collection().countDocuments({ post: new ObjectId(postId) });
}

module.exports = {
    COLLECTION,
    applySchema,
    createIndexes,
    create,
    findById,
    findByPostWithAuthor,
    update,
    remove,
    removeByPost,
    countByPost,
    toggleLike
};