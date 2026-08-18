const User = require('../models/User');
const Group = require('../models/Group');
const Post = require('../models/Post');

// GET /feed — Main activity feed (§27)
const feed = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const [user, joinedGroups] = await Promise.all([
            User.findById(userId),
            Group.findByMember(userId)
        ]);

        const friendIds = (user && user.friends) || [];
        const groupIds = joinedGroups.map(g => g._id);

        const posts = await Post.findFeedPosts({
            userId,
            friendIds,
            groupIds
        });

        res.render('pages/feed', {
            title: 'Feed — SocialNet',
            posts,
            friendCount: friendIds.length,
            groupCount: groupIds.length
        });
    } catch (err) {
        next(err);
    }
};

// GET /profile
const profile = async (req, res, next) => {
    try {
        const user = await User.findByIdWithFriends(req.session.user._id);
        if (!user) {
            // Session points at a user who no longer exists — e.g. the account
            // was deleted while they were logged in. Clear it and start over.
            return req.session.destroy(() => res.redirect('/'));
        }
        res.render('pages/profile', { title: 'Profile — SocialNet', user });
    } catch (err) {
        next(err);
    }
};

module.exports = { feed, profile };
