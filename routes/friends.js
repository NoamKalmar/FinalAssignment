const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const friendController = require('../controllers/friendController');

// All friend routes require being logged in.
router.use(isAuth);

// Static paths before '/:id', so '/requests' is never mistaken for a user id.
router.get('/requests', friendController.requests);
router.post('/requests/:id/accept', friendController.accept);
router.post('/requests/:id/reject', friendController.reject);

router.get('/', friendController.list);
router.post('/:id/add', friendController.add);
router.post('/:id/remove', friendController.remove);

module.exports = router;