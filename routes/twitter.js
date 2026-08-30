const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const twitterController = require('../controllers/twitterController');

router.use(isAuth);

router.post('/:postId/share', twitterController.share);
router.get('/:postId/engagement', twitterController.engagement);

module.exports = router;