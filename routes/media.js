const express = require('express');
const router = express.Router();
const Media = require('../models/Media');

/**
 * Serves an uploaded file back out of MongoDB.
 *
 * This is the counterpart to express.static: static serves files from disk,
 * this serves them from the database, so every team member sees the same
 * image regardless of which machine uploaded it.
 *
 * Deliberately NOT behind isAuth — a browser requests <img src="/media/..">
 * without any special handling, and these are post images, not private data.
 */
router.get('/:id', async (req, res, next) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) {
            const err = new Error('File not found');
            err.status = 404;
            return next(err);
        }

        res.set('Content-Type', media.contentType);
        res.set('Content-Length', media.size);
        // Contents never change once written, so let the browser keep it.
        res.set('Cache-Control', 'public, max-age=31536000, immutable');

        // The driver returns BSON Binary; .buffer is the raw Node Buffer.
        res.send(media.data.buffer ? Buffer.from(media.data.buffer) : media.data);
    } catch (err) {
        // A malformed id makes ObjectId throw. That is a 404, not a 500.
        if (err.name === 'BSONError' || /24 hex|hex string/i.test(err.message)) {
            const e = new Error('File not found');
            e.status = 404;
            return next(e);
        }
        next(err);
    }
});

module.exports = router;
