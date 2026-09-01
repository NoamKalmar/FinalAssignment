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

/**
 * Search input is text to look for, not a regular expression.
 * Without this, searching for "(" throws "missing closing parenthesis" and
 * returns a 500, while "." quietly matches every comment (§29).
 */
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/**
 * Comment search — §22, which asks for Search on every model, not only Post.
 *
 * Four optional parameters: keyword, author, from, to. Each supplied one
 * narrows the result; omitted ones are left out of the filter entirely, so an
 * empty form returns everything rather than matching against a wildcard.
 *
 * $match runs before the $lookup, so author documents are only joined for
 * comments that already survived the filter. Same shape as Post.search.
 */
async function search(params = {}) {
    const filter = {};

    if (params.keyword && params.keyword.trim()) {
        filter.content = {
            $regex: escapeRegex(params.keyword.trim()),
            $options: 'i'
        };
    }

    if (params.author) {
        try {
            filter.author = new ObjectId(params.author);
        } catch {
            // A malformed author id should return nothing, not throw (§29).
            return [];
        }
    }

    const range = {};
    if (params.from) {
        const d = new Date(params.from);
        if (!isNaN(d)) range.$gte = d;
    }
    if (params.to) {
        const d = new Date(params.to);
        // "Up to and including this day" — a bare date parses as midnight,
        // which would exclude everything written during that day.
        if (!isNaN(d)) {
            d.setHours(23, 59, 59, 999);
            range.$lte = d;
        }
    }
    if (Object.keys(range).length) filter.createdAt = range;

    return collection()
        .aggregate([
            { $match: filter },
            { $sort: { createdAt: -1 } },
            { $limit: 100 },
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
                        fullName: '$authorDoc.fullName'
                    }
                }
            },
            // The post a comment belongs to, so a result can link back to it
            // and show what was being replied to.
            {
                $lookup: {
                    from: 'posts',
                    localField: 'post',
                    foreignField: '_id',
                    as: 'postDoc'
                }
            },
            { $unwind: { path: '$postDoc', preserveNullAndEmptyArrays: true } },
            { $addFields: { postContent: '$postDoc.content' } },
            { $project: { authorDoc: 0, postDoc: 0 } }
        ])
        .toArray();
}

/**
 * The people who have actually written a comment, for the author dropdown on
 * the search form. Listing every registered user would offer names that can
 * only ever return nothing.
 */
async function distinctAuthors() {
    return collection()
        .aggregate([
            { $group: { _id: '$author' } },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'u'
                }
            },
            { $unwind: '$u' },
            { $project: { _id: '$u._id', fullName: '$u.fullName', username: '$u.username' } },
            { $sort: { fullName: 1 } }
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
    search,
    distinctAuthors,
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