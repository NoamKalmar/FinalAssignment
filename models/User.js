const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'users';

/**
 * Agreed document shape. Changing this means telling the other two.
 * {
 *   _id, username, passwordHash, fullName, email, avatarUrl, bio,
 *   address: { street, city, lat, lng },
 *   friends: [ObjectId],
 *   createdAt
 * }
 */

function collection() {
    return getDB().collection(COLLECTION);
}

// A unique INDEX is what actually guarantees no two users share a username.
// Checking "does this username exist?" in a controller can be raced by two
// simultaneous registrations; the index cannot.
async function createIndexes() {
    await collection().createIndex({ username: 1 }, { unique: true });
    await collection().createIndex({ fullName: 1 });
}

async function create(user) {
    // Guard against a controller accidentally passing a plaintext password.
    // A bcrypt hash always starts with $2a$, $2b$ or $2y$.
    if (!/^\$2[aby]\$/.test(user.passwordHash || '')) {
        throw new Error('User.create expects a bcrypt hash, not a plaintext password.');
    }

    const doc = {
        username: user.username,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        bio: user.bio || '',
        address: user.address || { street: '', city: '', lat: null, lng: null },
        friends: [],
        createdAt: new Date()
    };
    const result = await collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

async function findByUsername(username) {
    return collection().findOne({ username });
}

async function findAll() {
    return collection().find({}).sort({ createdAt: -1 }).toArray();
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
    createIndexes,
    create,
    findById,
    findByUsername,
    findAll,
    update,
    remove
};
