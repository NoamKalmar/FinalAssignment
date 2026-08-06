const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'places';

/**
 * Agreed document shape:
 * {
 *   _id, name, category, address,
 *   lat: Number, lng: Number,
 *   createdBy: ObjectId(User),
 *   createdAt
 * }
 *
 * One model covering three requirements at once: the map (§33.iii),
 * managing addresses through the app rather than the DB, and supplying
 * coordinates to the weather Web Service (§33.ii).
 */

function collection() {
    return getDB().collection(COLLECTION);
}

async function createIndexes() {
    await collection().createIndex({ name: 1 });
    await collection().createIndex({ category: 1 });
    await collection().createIndex({ createdBy: 1 });
}

async function create(place) {
    const doc = {
        name: place.name,
        category: place.category || 'general',
        address: place.address || '',
        lat: Number(place.lat),
        lng: Number(place.lng),
        createdBy: new ObjectId(place.createdBy),
        createdAt: new Date()
    };
    const result = await collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

// Everything the map page draws (§33.iii).
async function findAll() {
    return collection().find({}).sort({ name: 1 }).toArray();
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
    findAll,
    update,
    remove
};
