const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const isOwner = require('../middleware/isOwner');
const { upload, handleUploadErrors } = require('../middleware/upload');
const Post = require('../models/Post');
const postController = require('../controllers/postController');

// Every post route requires a session (§25).
router.use(isAuth);

// Static path first: '/mine' must be matched before '/:id', otherwise
// Express would treat "mine" as an id and try to look it up.
router.get('/mine', postController.mine);

router.get('/new', postController.showNew);

// upload.single() parses the multipart body and populates req.file.
// handleUploadErrors turns multer's errors into readable messages before
// they reach the generic error handler.
router.post('/',
    upload.single('mediaFile'),
    handleUploadErrors,
    postController.create);

router.get('/:id', postController.show);

// isOwner runs after isAuth and loads the post into req.doc, so the
// controller does not query for it again (§25 — only the author may edit).
router.get('/:id/edit', isOwner(Post, 'author'), postController.showEdit);

router.post('/:id/edit',
    isOwner(Post, 'author'),
    upload.single('mediaFile'),
    handleUploadErrors,
    postController.update);

router.post('/:id/like', postController.toggleLike);

// §33.iv — Facebook. Only the author may publish their own post.
router.post('/:id/share', isOwner(Post, 'author'), postController.shareToFacebook);
router.post('/:id/unshare', isOwner(Post, 'author'), postController.unshareFromFacebook);

// The read-back half, fetched by the browser once the page has rendered.
router.get('/:id/engagement', postController.facebookEngagement);

router.post('/:id/delete', isOwner(Post, 'author'), postController.remove);

module.exports = router;
