const express = require('express');
const router = express.Router();

const { isAuth, isGuest } = require('../middleware/isAuth');
const authController = require('../controllers/authController');
const pageController = require('../controllers/pageController');

// Public. isGuest bounces an already-logged-in user straight to the feed.
router.get('/', isGuest, authController.showLanding);

// Everything below requires a session (§25).
router.get('/feed', isAuth, pageController.feed);
router.get('/profile', isAuth, pageController.profile);

module.exports = router;
