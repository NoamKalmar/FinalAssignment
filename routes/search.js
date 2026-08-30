const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const searchController = require('../controllers/searchController');

// Searching exposes other users' content, so a session is required (§25).
router.use(isAuth);

// The page.
router.get('/', searchController.showSearch);

// The JSON endpoints the browser calls with fetch() (§30).
// Under /api so it is obvious at a glance which routes render HTML and
// which return data.
router.get('/api/posts', searchController.searchPosts);
router.get('/api/groups', searchController.searchGroups);

module.exports = router;
