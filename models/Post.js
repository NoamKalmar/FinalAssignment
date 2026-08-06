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
    TYPES,
    createIndexes,
    create,
    findById,
    findAll,
    findByAuthor,
    findByGroup,
    update,
    remove
};
