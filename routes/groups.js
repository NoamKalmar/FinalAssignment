const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const isGroupAdmin = require('../middleware/isGroupAdmin');
const groupController = require('../controllers/groupController');

// Every group route needs a session (§25).
router.use(isAuth);

// Static paths before '/:id', or Express reads "new" as an id.
router.get('/', groupController.list);
router.get('/new', groupController.showNew);
router.post('/', groupController.create);

router.get('/:id', groupController.show);

// Open joining — any logged-in user may join or leave (§26).
router.post('/:id/join', groupController.join);
router.post('/:id/leave', groupController.leave);

// --- admin only (§26): the capabilities a plain member does not have -------
router.get('/:id/edit', isGroupAdmin, groupController.showEdit);
router.post('/:id/edit', isGroupAdmin, groupController.update);
router.post('/:id/delete', isGroupAdmin, groupController.remove);
router.post('/:id/members/:userId/remove', isGroupAdmin, groupController.removeMember);
router.post('/:id/members/:userId/promote', isGroupAdmin, groupController.promoteMember);

module.exports = router;
