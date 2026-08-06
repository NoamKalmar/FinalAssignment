const express = require('express');
const router = express.Router();

const { isAuth, isGuest } = require('../middleware/isAuth');
const authController = require('../controllers/authController');

// The login form itself lives on the landing page (GET /), so only the
// submission needs a route here.
router.post('/login', isGuest, authController.login);

router.get('/register', isGuest, authController.showRegister);
router.post('/register', isGuest, authController.register);

router.get('/logout', isAuth, authController.logout);

module.exports = router;
