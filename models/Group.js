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

const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'owner', 'members', 'createdAt'],
        properties: {
            name:        { bsonType: 'string', minLength: 2, maxLength: 60 },
            description: { bsonType: 'string', maxLength: 500 },
            category:    { bsonType: 'string' },
            coverUrl:    { bsonType: ['string', 'null'] },
            owner:       { bsonType: 'objectId' },
            members:     { bsonType: 'array' },
            place:       { bsonType: ['objectId', 'null'] },
            createdAt:   { bsonType: 'date' }
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

// Group list: add a member count without dragging the whole members array
// into the view.
async function findAllSummary() {
    return collection()
        .aggregate([
            { $addFields: { memberCount: { $size: '$members' } } },
            { $project: { members: 0 } },
            { $sort: { createdAt: -1 } }
        ])
        .toArray();
}

/**
 * A group stores members as ObjectId references, so the member list has no
 * names in it. Two queries resolve that:
 *   1. fetch the group
 *   2. fetch those users with $in, projecting only the fields a view needs
 *
 * Deliberately not one $lookup aggregation — two plain queries are easier to
 * read and to explain, and $in was covered in the MongoDB lecture.
 */
async function findByIdWithMembers(id) {
    const group = await findById(id);
    if (!group) return null;

    const users = await getDB()
        .collection('users')
        .find({ _id: { $in: group.members.map(m => m.user) } })
        .project({ username: 1, fullName: 1 })   // never passwordHash or email
        .toArray();

    const byId = new Map(users.map(u => [String(u._id), u]));

    group.members = group.members
        .map(m => ({ ...m, user: byId.get(String(m.user)) || null }))
        .filter(m => m.user)                              // skip deleted accounts
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));

    return group;
}

// Is this user a member at all, whatever their role?
function membershipOf(group, userId) {
    if (!group || !userId) return null;
    return group.members.find(m => String(m.user._id || m.user) === String(userId)) || null;
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

// §26 — admins may promote another member. A group can have several admins.
async function setRole(groupId, userId, role) {
    await collection().updateOne(
        { _id: new ObjectId(groupId), 'members.user': new ObjectId(userId) },
        { $set: { 'members.$.role': role } }   // $ is the matched array element
    );
    return findById(groupId);
}

// Count admins, so the last one cannot demote or remove themselves and leave
// the group unmanageable.
async function adminCount(groupId) {
    const g = await findById(groupId);
    if (!g) return 0;
    return g.members.filter(m => m.role === 'admin').length;
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
    applySchema,
    createIndexes,
    create,
    findById,
    findAll,
    findAllSummary,
    findByIdWithMembers,
    membershipOf,
    setRole,
    adminCount,
    findByMember,
    update,
    remove,
    addMember,
    removeMember,
    isAdmin
};
