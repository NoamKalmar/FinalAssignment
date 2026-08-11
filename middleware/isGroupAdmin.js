const Group = require('../models/Group');

/**
 * Group administration guard (§26).
 *
 * Different from isOwner, which compares a single field:
 *     post.author === session.user._id
 *
 * A group has ROLES, so membership lives in an array:
 *     members: [ { user, role: 'admin' | 'member', joinedAt } ]
 *
 * We therefore have to find the caller's entry and check its role — which
 * also means a group can have several admins, not only its creator.
 *
 * Runs after isAuth, which guarantees req.session.user exists.
 */
async function isGroupAdmin(req, res, next) {
    try {
        const group = await Group.findById(req.params.id);

        if (!group) {
            const err = new Error('Group not found');
            err.status = 404;
            return next(err);
        }

        const admin = await Group.isAdmin(req.params.id, req.session.user._id);
        if (!admin) {
            // 403, not a redirect: they are logged in and the answer is no.
            const err = new Error('Only a group admin can do that');
            err.status = 403;
            return next(err);
        }

        // Hand it on so the controller does not query for it again.
        req.group = group;
        next();
    } catch (err) {
        if (err.name === 'BSONError' || /24 hex|hex string/i.test(err.message)) {
            const e = new Error('Group not found');
            e.status = 404;
            return next(e);
        }
        next(err);
    }
}

module.exports = isGroupAdmin;
