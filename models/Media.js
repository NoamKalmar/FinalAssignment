const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const COLLECTION = 'media';

/**
 * Uploaded files, stored as bytes in MongoDB.
 *
 * Why the database and not the disk: each of us runs the app locally, so a
 * file written to one machine's public/uploads/ does not exist on the other
 * two. The Atlas cluster is the only storage all three share, so an image
 * uploaded by one person is immediately visible to everyone.
 *
 * The trade-off: databases are not optimised for binary blobs. In production
 * you would use object storage (S3, Cloudinary) and keep only the URL here.
 * At this scale — a few dozen demo posts inside a 512 MB cluster — it is fine.
 *
 * MongoDB caps a single document at 16 MB, so uploads are limited well below
 * that in middleware/upload.js.
 *
 * Shape: { _id, data: Binary, contentType, size, uploadedBy, createdAt }
 */

function collection() {
    return getDB().collection(COLLECTION);
}

const SCHEMA = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['data', 'contentType', 'size', 'uploadedBy', 'createdAt'],
        properties: {
            data:        { bsonType: 'binData' },
            contentType: { bsonType: 'string' },
            size:        { bsonType: 'int', minimum: 1 },
            uploadedBy:  { bsonType: 'objectId' },
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
    await collection().createIndex({ uploadedBy: 1 });
}

// Takes the in-memory buffer multer produced and stores it.
async function create({ buffer, mimetype, uploadedBy }) {
    const result = await collection().insertOne({
        data: buffer,
        contentType: mimetype,
        size: buffer.length,
        uploadedBy: new ObjectId(uploadedBy),
        createdAt: new Date()
    });
    return result.insertedId;
}

async function findById(id) {
    return collection().findOne({ _id: new ObjectId(id) });
}

async function remove(id) {
    const result = await collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
}

module.exports = { COLLECTION, applySchema, createIndexes, create, findById, remove };
