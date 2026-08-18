const User = require('../models/User');

// GET /feed  — placeholder. The real feed is M4 (§27).
// It exists now so the login flow can be demonstrated end to end.
const feed = (req, res) => {
    res.render('pages/feed', { title: 'Feed — SocialNet' });
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
