const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');

// Routes map a URL to a controller function. No logic lives here.
router.get('/', homeController.index);

module.exports = router;
