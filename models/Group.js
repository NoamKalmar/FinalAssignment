const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'groups';

/**
 * Agreed document shape:
 * {
 *   _id, name, description, category, coverUrl,
 *   owner: ObjectId(User),
 *   members: [ { user: ObjectId(User), role: 'admin'|'member', joinedAt } ],
 *   place: ObjectId(Place) | null,
 *   createdAt
 * }
 *
 * Members are embedded rather than a separate collection: a group is always
 * read together with its members, so one document means one query.
 */

function collection() {
    return getDB().collection(COLLECTION);
}

async function createIndexes() {
    await collection().createIndex({ name: 1 });
    await collection().createIndex({ category: 1 });
    await collection().createIndex({ 'members.user': 1 });
}

async function create(group) {
    const ownerId = new ObjectId(group.owner);
    const doc = {
        name: group.name,
        description: group.description || '',
        category: group.category || 'general',
        coverUrl: group.coverUrl || null,
        owner: ownerId,
        // The creator is a member from the start, with the admin role.
        members: [{ user: ownerId, role: 'admin', joinedAt: new Date() }],
        place: group.place ? new ObjectId(group.place) : null,
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

// Every group a given user belongs to — used to build the feed (§27).
async function findByMember(userId) {
    return collection().find({ 'members.user': new ObjectId(userId) }).toArray();
}

async function update(id, fields) {
    await collection().updateOne({ _id: new ObjectId(id) }, { $set: fields });
    return findById(id);
}

async function remove(id) {
    const result = await collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
}

// $addToSet, not $push: joining twice must not create two membership entries.
async function addMember(groupId, userId, role = 'member') {
    await collection().updateOne(
        { _id: new ObjectId(groupId), 'members.user': { $ne: new ObjectId(userId) } },
        { $addToSet: { members: { user: new ObjectId(userId), role, joinedAt: new Date() } } }
    );
    return findById(groupId);
}

async function removeMember(groupId, userId) {
    await collection().updateOne(
        { _id: new ObjectId(groupId) },
        { $pull: { members: { user: new ObjectId(userId) } } }
    );
    return findById(groupId);
}

// Used by the isGroupAdmin middleware in M3 (§26).
async function isAdmin(groupId, userId) {
    const found = await collection().findOne({
        _id: new ObjectId(groupId),
        members: { $elemMatch: { user: new ObjectId(userId), role: 'admin' } }
    });
    return found !== null;
}

module.exports = {
    COLLECTION,
    createIndexes,
    create,
    findById,
    findAll,
    findByMember,
    update,
    remove,
    addMember,
    removeMember,
    isAdmin
};
