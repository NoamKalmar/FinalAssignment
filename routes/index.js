const express = require('express');
const router = express.Router();

const { isAuth, isGuest } = require('../middleware/isAuth');
const authController = require('../controllers/authController');
const pageController = require('../controllers/pageController');
const userController = require('../controllers/userController');

// Public. isGuest bounces an already-logged-in user straight to the feed.
router.get('/', isGuest, authController.showLanding);

// Everything below requires a session (§25).
router.get('/feed', isAuth, pageController.feed);
router.get('/stats', isAuth, pageController.stats);
router.get('/api/stats', isAuth, pageController.statsApi);

// Full CRUD on User (§22): Create is /register, Read is /profile,
// Update and Delete are below.
router.get('/profile', isAuth, pageController.profile);
router.get('/profile/edit', isAuth, userController.showEdit);
router.post('/profile/edit', isAuth, userController.update);
router.post('/profile/delete', isAuth, userController.remove);

module.exports = router;
