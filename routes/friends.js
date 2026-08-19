const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const friendController = require('../controllers/friendController');

// All friend routes require being logged in.
router.use(isAuth);

router.get('/', friendController.list);
router.post('/:id/add', friendController.add);
router.post('/:id/remove', friendController.remove);

module.exports = router;
