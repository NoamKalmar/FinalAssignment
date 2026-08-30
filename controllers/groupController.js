const Group = require('../models/Group');
const Post = require('../models/Post');

function notFound() {
    const err = new Error('Group not found');
    err.status = 404;
    return err;
}

function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

function validate(body) {
    const errors = [];
    const name = (body.name || '').trim();
    if (name.length < 2 || name.length > 60) errors.push('Group name must be 2–60 characters.');
    if ((body.description || '').length > 500) errors.push('Description is limited to 500 characters.');
    return errors;
}

// GET /groups — browse everything, marking which ones you are already in
const list = async (req, res, next) => {
    try {
        const [groups, mine] = await Promise.all([
            Group.findAllSummary(),
            Group.findByMember(req.session.user._id)
        ]);
        const mineIds = new Set(mine.map(g => String(g._id)));

        res.render('pages/group-list', {
            title: 'Groups — SocialNet',
            groups: groups.map(g => ({ ...g, joined: mineIds.has(String(g._id)) }))
        });
    } catch (err) {
        next(err);
    }
};

// GET /groups/new
const showNew = (req, res) => {
    res.render('pages/group-form', {
        title: 'New group — SocialNet',
        mode: 'new',
        group: { name: '', description: '', category: 'general' }
    });
};

// POST /groups — the creator becomes the first admin (handled in the model)
const create = async (req, res, next) => {
    try {
        const errors = validate(req.body);
        if (errors.length) {
            return res.status(400).render('pages/group-form', {
                title: 'New group — SocialNet', mode: 'new', error: errors[0],
                group: req.body
            });
        }

        const group = await Group.create({
            name: req.body.name.trim(),
            description: (req.body.description || '').trim(),
            category: (req.body.category || 'general').trim(),
            owner: req.session.user._id
        });

        res.redirect('/groups/' + group._id);
    } catch (err) {
        next(err);
    }
};

// GET /groups/:id — the group page: details, members, statistics and its posts
const show = async (req, res, next) => {
    try {
        const [group, posts, groupPostStats, topContributors] = await Promise.all([
            Group.findByIdWithMembers(req.params.id),
            Post.findByGroupWithAuthor(req.params.id),
            Post.getGroupPostTypeStats(req.params.id),
            Post.getGroupTopContributors(req.params.id, 5)
        ]);

        if (!group) return next(notFound());

        const membership = Group.membershipOf(group, req.session.user._id);

        res.render('pages/group-show', {
            title: group.name + ' — SocialNet',
            group,
            posts,
            groupPostStats,
            topContributors,
            isMember: Boolean(membership),
            isAdmin: Boolean(membership && membership.role === 'admin')
        });
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /groups/:id/join  (§26 — open joining, anyone may join)
const join = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return next(notFound());

        // addMember uses $addToSet with a guard, so joining twice is a no-op.
        await Group.addMember(req.params.id, req.session.user._id, 'member');
        res.redirect('/groups/' + req.params.id);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /groups/:id/leave
const leave = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return next(notFound());

        const me = group.members.find(m => String(m.user) === String(req.session.user._id));

        // The last admin leaving would strand the group with nobody able to
        // manage it. Make them hand over or delete it instead.
        if (me && me.role === 'admin' && (await Group.adminCount(req.params.id)) === 1) {
            const err = new Error(
                'You are the only admin. Promote someone else or delete the group first.'
            );
            err.status = 400;
            return next(err);
        }

        await Group.removeMember(req.params.id, req.session.user._id);
        res.redirect('/groups');
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// ---------------------------------------------------------------------------
// Admin-only below. isGroupAdmin has already run and put the group on req.
// ---------------------------------------------------------------------------

// GET /groups/:id/edit
const showEdit = (req, res) => {
    res.render('pages/group-form', {
        title: 'Edit group — SocialNet',
        mode: 'edit',
        group: req.group
    });
};

// POST /groups/:id/edit
const update = async (req, res, next) => {
    try {
        const errors = validate(req.body);
        if (errors.length) {
            return res.status(400).render('pages/group-form', {
                title: 'Edit group — SocialNet', mode: 'edit', error: errors[0],
                group: { ...req.group, ...req.body }
            });
        }

        await Group.update(req.params.id, {
            name: req.body.name.trim(),
            description: (req.body.description || '').trim(),
            category: (req.body.category || 'general').trim()
        });

        res.redirect('/groups/' + req.params.id);
    } catch (err) {
        next(err);
    }
};

// POST /groups/:id/delete
const remove = async (req, res, next) => {
    try {
        // Posts belonging to the group would otherwise point at nothing.
        await Post.detachFromGroup(req.params.id);
        await Group.remove(req.params.id);
        res.redirect('/groups');
    } catch (err) {
        next(err);
    }
};

// POST /groups/:id/members/:userId/remove
const removeMember = async (req, res, next) => {
    try {
        const target = req.params.userId;

        if (String(target) === String(req.session.user._id)) {
            const err = new Error('Use "Leave group" to remove yourself.');
            err.status = 400;
            return next(err);
        }

        await Group.removeMember(req.params.id, target);
        res.redirect('/groups/' + req.params.id);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /groups/:id/members/:userId/promote   — §26, several admins allowed
const promoteMember = async (req, res, next) => {
    try {
        await Group.setRole(req.params.id, req.params.userId, 'admin');
        res.redirect('/groups/' + req.params.id);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

module.exports = {
    list, showNew, create, show, join, leave,
    showEdit, update, remove, removeMember, promoteMember
};
