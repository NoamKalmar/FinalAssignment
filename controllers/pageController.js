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

// GET /stats — Personalized user activity, engagement & D3 graphs
const stats = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const [
            user,
            joinedGroups,
            userStats,
            userCategoryStats,
            userActivityTimeline
        ] = await Promise.all([
            User.findById(userId),
            Group.findByMember(userId),
            Post.getUserStats(userId),
            Group.getUserGroupCategoryStats(userId),
            Post.getUserPostActivityTimeline(userId)
        ]);

        if (!user) {
            return req.session.destroy(() => res.redirect('/'));
        }

        const friendCount = (user.friends && user.friends.length) || 0;
        const groupCount = (joinedGroups && joinedGroups.length) || 0;

        const statsData = {
            user: {
                username: user.username,
                fullName: user.fullName
            },
            counts: {
                posts: userStats.totalPosts || 0,
                friends: friendCount,
                groups: groupCount,
                likes: userStats.totalLikes || 0
            },
            postTypes: userStats.types || [],
            categoryStats: userCategoryStats || [],
            activityTimeline: userActivityTimeline || []
        };

        res.render('pages/stats', {
            title: 'My Activity & Statistics — SocialNet',
            statsData
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/stats — JSON endpoint for user personalized stats
const statsApi = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const [
            user,
            joinedGroups,
            userStats,
            userCategoryStats,
            userActivityTimeline
        ] = await Promise.all([
            User.findById(userId),
            Group.findByMember(userId),
            Post.getUserStats(userId),
            Group.getUserGroupCategoryStats(userId),
            Post.getUserPostActivityTimeline(userId)
        ]);

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const friendCount = (user.friends && user.friends.length) || 0;
        const groupCount = (joinedGroups && joinedGroups.length) || 0;

        res.json({
            user: {
                username: user.username,
                fullName: user.fullName
            },
            counts: {
                posts: userStats.totalPosts || 0,
                friends: friendCount,
                groups: groupCount,
                likes: userStats.totalLikes || 0
            },
            postTypes: userStats.types || [],
            categoryStats: userCategoryStats || [],
            activityTimeline: userActivityTimeline || []
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

