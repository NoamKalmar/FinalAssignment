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

/**
 * User input is text to search for, not a regular expression.
 *
 * Passing it straight to $regex means "(" throws "missing closing
 * parenthesis" and the user gets a 500, while "." silently matches every
 * user. Escaping the metacharacters makes the search literal, which is what
 * a search box is supposed to do (§29).
 */
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * MongoDB's own schema validation. This is a native database feature, not
 * Mongoose — the database itself rejects documents that do not match, no
 * matter what wrote them: a controller, the seed script, or someone typing
 * directly into Compass.
 *
 * minLength 60 on passwordHash is deliberate: a bcrypt hash is exactly 60
 * characters, so a plaintext password can never be stored here.
 */
const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['username', 'passwordHash', 'fullName', 'email', 'friends', 'createdAt'],
        properties: {
            username:     { bsonType: 'string', minLength: 3, maxLength: 20 },
            passwordHash: { bsonType: 'string', minLength: 60, maxLength: 60 },
            fullName:     { bsonType: 'string', minLength: 2, maxLength: 60 },
            email:        { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
            avatarUrl:    { bsonType: ['string', 'null'] },
            bio:          { bsonType: 'string', maxLength: 300 },
            address:      { bsonType: 'object' },
            friends:      { bsonType: 'array' },
            createdAt:    { bsonType: 'date' }
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

// A unique INDEX is what actually guarantees no two users share a username.
// Checking "does this username exist?" in a controller can be raced by two
// simultaneous registrations; the index cannot.
async function createIndexes() {
    await collection().createIndex({ username: 1 }, { unique: true });
    await collection().createIndex({ fullName: 1 });
    await collection().createIndex({ friends: 1 });
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
    const userObjId = new ObjectId(id);
    // Remove this user from all other users' friends arrays so no dangling IDs remain.
    await collection().updateMany(
        { friends: userObjId },
        { $pull: { friends: userObjId } }
    );
    const result = await collection().deleteOne({ _id: userObjId });
    return result.deletedCount === 1;
}

async function countAll() {
    return collection().countDocuments();
}

// Mutual friendship: each user gets the other in their friends array.
// NOT atomic — two separate writes, so a crash in between would leave a
// one-way friendship. A transaction would close that but needs a replica set
// and was not covered in the course. $addToSet at least makes each write
// idempotent, so a retry can never create a duplicate.
async function addFriend(userId, friendId) {
    const uId = new ObjectId(userId);
    const fId = new ObjectId(friendId);

    if (uId.equals(fId)) {
        throw new Error('Cannot add yourself as a friend.');
    }

    await collection().updateOne(
        { _id: uId },
        { $addToSet: { friends: fId } }
    );
    await collection().updateOne(
        { _id: fId },
        { $addToSet: { friends: uId } }
    );

    return findById(userId);
}

// Mutual friendship removal: pull from both users' friends array.
async function removeFriend(userId, friendId) {
    const uId = new ObjectId(userId);
    const fId = new ObjectId(friendId);

    await collection().updateOne(
        { _id: uId },
        { $pull: { friends: fId } }
    );
    await collection().updateOne(
        { _id: fId },
        { $pull: { friends: uId } }
    );

    return findById(userId);
}

async function isFriend(userId, targetUserId) {
    const user = await findById(userId);
    if (!user || !user.friends) return false;
    const targetStr = String(targetUserId);
    return user.friends.some(f => String(f) === targetStr);
}

// Returns the populated friend documents for a given user.
async function getFriends(userId, search = '') {
    const user = await findById(userId);
    if (!user || !user.friends || user.friends.length === 0) return [];

    const query = {
        _id: { $in: user.friends }
    };

    if (search && search.trim()) {
        const term = search.trim();
        query.$or = [
            { username: { $regex: escapeRegex(term), $options: 'i' } },
            { fullName: { $regex: escapeRegex(term), $options: 'i' } }
        ];
    }

    return collection()
        .find(query)
        .project({ username: 1, fullName: 1, avatarUrl: 1, bio: 1, address: 1, createdAt: 1 })
        .sort({ fullName: 1 })
        .toArray();
}

// Finds other registered users that the user is NOT yet friends with (excluding self).
async function findDiscoverable(currentUserId, search = '', limit = 30) {
    const user = await findById(currentUserId);
    const excludeIds = [new ObjectId(currentUserId), ...((user && user.friends) || [])];

    const query = {
        _id: { $nin: excludeIds }
    };

    if (search && search.trim()) {
        const term = search.trim();
        query.$or = [
            { username: { $regex: escapeRegex(term), $options: 'i' } },
            { fullName: { $regex: escapeRegex(term), $options: 'i' } }
        ];
    }

    return collection()
        .find(query)
        .project({ username: 1, fullName: 1, avatarUrl: 1, bio: 1, address: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
}

// Fetches user with populated friends list.
async function findByIdWithFriends(userId) {
    const user = await findById(userId);
    if (!user) return null;

    let friendsList = [];
    if (user.friends && user.friends.length > 0) {
        friendsList = await collection()
            .find({ _id: { $in: user.friends } })
            .project({ username: 1, fullName: 1, avatarUrl: 1, bio: 1, address: 1 })
            .sort({ fullName: 1 })
            .toArray();
    }

    return { ...user, friendsList };
}

module.exports = {
    COLLECTION,
    applySchema,
    createIndexes,
    create,
    findById,
    findByUsername,
    findAll,
    update,
    remove,
    countAll,
    addFriend,
    removeFriend,
    isFriend,
    getFriends,
    findDiscoverable,
    findByIdWithFriends
};
