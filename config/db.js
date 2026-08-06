const { MongoClient } = require('mongodb');

// Single shared connection for the whole app.
let db = null;

// Called once at startup, before the server starts listening.
async function connectDB() {
    try {
        const client = await MongoClient.connect(process.env.MONGODB_URI);
        db = client.db(process.env.DB_NAME);
        console.log('MongoDB connected ->', process.env.DB_NAME);
        return db;
    } catch (err) {
        // Fail loudly. A server that runs without a database is worse than no server.
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    }
}

// Every model calls this to reach the database.
function getDB() {
    if (!db) {
        throw new Error('Database not connected. connectDB() must run first.');
    }
    return db;
}

module.exports = { connectDB, getDB };
