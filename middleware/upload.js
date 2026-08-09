const multer = require('multer');

/**
 * File uploads for post media.
 *
 * NOT taught in the course — §13 self-learning, like sessions and bcrypt.
 *
 * memoryStorage, not diskStorage: the file is held in RAM as a Buffer and
 * then written to MongoDB (see models/Media.js). Writing to disk would mean
 * the file only exists on the uploader's machine, and the other two team
 * members would see a broken image.
 */

// Well below MongoDB's 16 MB per-document ceiling, and small enough that a
// few dozen demo posts stay comfortable inside a 512 MB Atlas cluster.
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

const ALLOWED = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm'
];

// Runs before the file is accepted, so a rejected type never occupies memory.
function fileFilter(req, file, cb) {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPG, PNG, GIF, WEBP, MP4 and WEBM files are allowed.');
    err.code = 'BAD_FILE_TYPE';
    cb(err);
}

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: MAX_BYTES }
});

/**
 * Turns multer's errors into readable messages (§29). Without this an
 * oversized file produces an unhandled MulterError and a blank 500 page.
 */
function handleUploadErrors(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        err.userMessage = err.code === 'LIMIT_FILE_SIZE'
            ? 'That file is larger than 3 MB.'
            : 'Upload failed: ' + err.message;
        err.status = 400;
    } else if (err && err.code === 'BAD_FILE_TYPE') {
        err.userMessage = err.message;
        err.status = 400;
    }
    next(err);
}

module.exports = { upload, handleUploadErrors, MAX_BYTES };
