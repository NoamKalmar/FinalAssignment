const User = require('../models/User');

// GET /profile/edit
const showEdit = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) return req.session.destroy(() => res.redirect('/'));
        res.render('pages/profile-edit', { title: 'Edit profile — SocialNet', user });
    } catch (err) {
        next(err);
    }
};

// POST /profile/edit
//
// No isOwner needed here: the id comes from the session, never from the URL,
// so a user can only ever reach their own document.
const update = async (req, res, next) => {
    try {
        const errors = [];
        const fullName = (req.body.fullName || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const bio = (req.body.bio || '').trim();

        if (fullName.length < 2) errors.push('Please enter your full name.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Please enter a valid email address.');
        if (bio.length > 300) errors.push('Bio must be 300 characters or fewer.');

        if (errors.length) {
            const user = await User.findById(req.session.user._id);
            return res.status(400).render('pages/profile-edit', {
                title: 'Edit profile — SocialNet', user, error: errors[0]
            });
        }

        const updated = await User.update(req.session.user._id, {
            fullName,
            email,
            bio,
            address: {
                street: (req.body.street || '').trim(),
                city: (req.body.city || '').trim(),
                lat: null,
                lng: null
            }
        });

        // The navbar reads the session, so it has to reflect the new name too.
        req.session.user.fullName = updated.fullName;

        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
};

// POST /profile/delete  — the Delete half of §22's CRUD on User
const remove = async (req, res, next) => {
    try {
        await User.remove(req.session.user._id);
        req.session.destroy(err => {
            if (err) return next(err);
            res.redirect('/');
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { showEdit, update, remove };
