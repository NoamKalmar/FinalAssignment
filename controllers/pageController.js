const User = require('../models/User');
const Group = require('../models/Group');
const Post = require('../models/Post');
const Place = require('../models/Place');

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

// GET /stats — platform-wide analytics & D3 graphs
const stats = async (req, res, next) => {
    try {
        const [
            userCount,
            groupCount,
            postCount,
            placeCount,
            totalLikes,
            postTypes,
            categoryStats,
            activityTimeline
        ] = await Promise.all([
            User.countAll(),
            Group.countAll(),
            Post.countAll(),
            Place.countAll(),
            Post.getTotalLikesCount(),
            Post.getPostTypeStats(),
            Group.getCategoryStats(),
            Post.getPostActivityTimeline()
        ]);

        const statsData = {
            counts: {
                users: userCount,
                groups: groupCount,
                posts: postCount,
                places: placeCount,
                likes: totalLikes
            },
            postTypes,
            categoryStats,
            activityTimeline
        };

        res.render('pages/stats', {
            title: 'Platform Statistics & Analytics — SocialNet',
            statsData
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/stats — JSON endpoint for stats
const statsApi = async (req, res, next) => {
    try {
        const [
            userCount,
            groupCount,
            postCount,
            placeCount,
            totalLikes,
            postTypes,
            categoryStats,
            activityTimeline
        ] = await Promise.all([
            User.countAll(),
            Group.countAll(),
            Post.countAll(),
            Place.countAll(),
            Post.getTotalLikesCount(),
            Post.getPostTypeStats(),
            Group.getCategoryStats(),
            Post.getPostActivityTimeline()
        ]);

        res.json({
            counts: {
                users: userCount,
                groups: groupCount,
                posts: postCount,
                places: placeCount,
                likes: totalLikes
            },
            postTypes,
            categoryStats,
            activityTimeline
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

        const userStats = await Post.getUserStats(req.session.user._id);

        res.render('pages/profile', {
            title: 'Profile — SocialNet',
            user,
            userStats
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { feed, stats, statsApi, profile };

