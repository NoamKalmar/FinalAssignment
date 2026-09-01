const { ObjectId } = require('mongodb');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');

function notFound() {
    const err = new Error('Not found');
    err.status = 404;
    return err;
}

// A malformed :id makes ObjectId throw — that is a 404, not a 500. Same
// helper as postController, so a typed URL never looks like a crash (§29).
function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

// GET /friends
const list = async (req, res, next) => {
    try {
        const currentUserId = req.session.user._id;
        const search = (req.query.q || '').trim();
        const activeTab = req.query.tab === 'discover' ? 'discover' : 'friends';

        const [friends, discoverable, pendingCount, pendingOutgoing] = await Promise.all([
            User.getFriends(currentUserId, search),
            User.findDiscoverable(currentUserId, search, 30),
            FriendRequest.countPendingForUser(currentUserId),
            FriendRequest.findPendingOutgoingTargets(currentUserId)
        ]);

        res.render('pages/friends', {
            title: 'Friends — SocialNet',
            friends,
            discoverable,
            pendingCount,
            pendingOutgoing,
            search,
            activeTab,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /friends/:id/add — sends a friend REQUEST, does not friend instantly.
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

        const alreadyFriends = await User.isFriend(currentUserId, targetUserId);
        if (alreadyFriends) {
            return res.redirect('/friends?error=' + encodeURIComponent('You are already friends.'));
        }

        const existing = await FriendRequest.findPendingBetween(currentUserId, targetUserId);
        if (existing) {
            return res.redirect('/friends?error=' + encodeURIComponent('A friend request is already pending.'));
        }

        await FriendRequest.create(currentUserId, targetUserId);

        const referrer = req.get('Referrer');
        if (referrer && referrer.includes(req.headers.host)) {
            return res.redirect(referrer);
        }
        res.redirect('/friends?success=' + encodeURIComponent(`Friend request sent to ${targetUser.fullName}.`));
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// GET /friends/requests — pending requests sent TO the current user.
const requests = async (req, res, next) => {
    try {
        const userId = req.session.user._id;

        // Any search parameter switches the page from "pending requests I can
        // act on" to search results across my whole request history — sent and
        // received, any status (§22).
        const params = {
            keyword: (req.query.q || '').trim(),
            status: req.query.status || '',
            from: req.query.from || '',
            to: req.query.to || ''
        };
        const searching = Boolean(params.keyword || params.status || params.from || params.to);

        const [pending, results] = await Promise.all([
            FriendRequest.findPendingForUser(userId),
            searching ? FriendRequest.search(userId, params) : Promise.resolve(null)
        ]);

        res.render('pages/friend-requests', {
            title: 'Friend requests — SocialNet',
            pending,
            results,
            searching,
            params,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /friends/requests/:id/accept
const accept = async (req, res, next) => {
    try {
        const request = await FriendRequest.findById(req.params.id);
        if (!request || request.status !== 'pending') {
            return res.redirect('/friends/requests?error=' + encodeURIComponent('That request is no longer pending.'));
        }
        // Only the recipient may accept it.
        if (String(request.to) !== String(req.session.user._id)) {
            const err = new Error('You cannot accept a request that was not sent to you.');
            err.status = 403;
            return next(err);
        }

        await User.addFriend(request.from, request.to);
        await FriendRequest.setStatus(request._id, 'accepted');

        res.redirect('/friends/requests?success=' + encodeURIComponent('Friend request accepted.'));
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /friends/requests/:id/reject
const reject = async (req, res, next) => {
    try {
        const request = await FriendRequest.findById(req.params.id);
        if (!request || request.status !== 'pending') {
            return res.redirect('/friends/requests?error=' + encodeURIComponent('That request is no longer pending.'));
        }
        if (String(request.to) !== String(req.session.user._id)) {
            const err = new Error('You cannot reject a request that was not sent to you.');
            err.status = 403;
            return next(err);
        }

        await FriendRequest.setStatus(request._id, 'rejected');

        res.redirect('/friends/requests?success=' + encodeURIComponent('Friend request declined.'));
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
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
        next(isBadId(err) ? notFound() : err);
    }
};

module.exports = {
    list,
    add,
    requests,
    accept,
    reject,
    remove
};