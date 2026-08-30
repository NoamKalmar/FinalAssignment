const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const isOwner = require('../middleware/isOwner');
const Post = require('../models/Post');
const twitterController = require('../controllers/twitterController');

// Every Twitter route requires a session (§25).
router.use(isAuth);

// isOwner loads the post into req.doc and 403s anyone who is not its author.
// Without it, any logged-in user could publish someone else's post to X —
// the hidden button in the view is cosmetic, the server has to check too.
router.post('/:id/share', isOwner(Post, 'author'), twitterController.share);
router.post('/:id/unshare', isOwner(Post, 'author'), twitterController.unshare);

// Read-only, and it returns metrics of an already-public tweet, so it is
// open to any logged-in user — same rule as the Facebook engagement route.
router.get('/:id/engagement', twitterController.engagement);

module.exports = router;
