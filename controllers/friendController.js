const { ObjectId } = require('mongodb');
const User = require('../models/User');

// GET /friends
const list = async (req, res, next) => {
    try {
        const currentUserId = req.session.user._id;
        const search = (req.query.q || '').trim();
        const activeTab = req.query.tab === 'discover' ? 'discover' : 'friends';

        const [friends, discoverable] = await Promise.all([
            User.getFriends(currentUserId, search),
            User.findDiscoverable(currentUserId, search, 30)
        ]);

        res.render('pages/friends', {
            title: 'Friends — SocialNet',
            friends,
            discoverable,
            search,
            activeTab,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        next(err);
    }
};

// POST /friends/:id/add
const add = async (req, res, next) => {
    try {
        const currentUserId = req.session.user._id;
        const targetUserId = req.params.id;

        if (!ObjectId.isValid(targetUserId)) {
            const err = new Error('Invalid user ID');
            err.status = 400;
            return next(err);
        }

        if (String(currentUserId) === String(targetUserId)) {
            return res.redirect('/friends?error=' + encodeURIComponent('You cannot add yourself as a friend.'));
        }

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            const err = new Error('User not found');
            err.status = 404;
            return next(err);
        }

        await User.addFriend(currentUserId, targetUserId);

        const referrer = req.get('Referrer');
        if (referrer && referrer.includes(req.headers.host)) {
            return res.redirect(referrer);
        }
        res.redirect('/friends?success=' + encodeURIComponent(`You and ${targetUser.fullName} are now friends!`));
    } catch (err) {
        next(err);
    }
};

// POST /friends/:id/remove
const remove = async (req, res, next) => {
    try {
        const currentUserId = req.session.user._id;
        const targetUserId = req.params.id;

        if (!ObjectId.isValid(targetUserId)) {
            const err = new Error('Invalid user ID');
            err.status = 400;
            return next(err);
        }

        const targetUser = await User.findById(targetUserId);
        await User.removeFriend(currentUserId, targetUserId);

        const referrer = req.get('Referrer');
        if (referrer && referrer.includes(req.headers.host)) {
            return res.redirect(referrer);
        }
        res.redirect('/friends?success=' + encodeURIComponent(`Removed ${targetUser ? targetUser.fullName : 'friend'} from your friends list.`));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    list,
    add,
    remove
};
