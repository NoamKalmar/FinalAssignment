const { ObjectId } = require('mongodb');
const User = require('../models/User');
const Post = require('../models/Post');

// GET /users/:id — view any user's profile
const showUser = async (req, res, next) => {
    try {
        const targetId = req.params.id;
        if (!ObjectId.isValid(targetId)) {
            const err = new Error('User not found');
            err.status = 404;
            return next(err);
        }

        // If viewing own profile, redirect to /profile
        if (String(req.session.user._id) === String(targetId)) {
            return res.redirect('/profile');
        }

        const user = await User.findByIdWithFriends(targetId);
        if (!user) {
            const err = new Error('User not found');
            err.status = 404;
            return next(err);
        }

        const [isFriend, posts] = await Promise.all([
            User.isFriend(req.session.user._id, user._id),
            Post.findByAuthorWithAuthor(user._id)
        ]);

        res.render('pages/user-show', {
            title: `${user.fullName} (@${user.username}) — SocialNet`,
            user,
            isFriend,
            posts
        });
    } catch (err) {
        next(err);
    }
};

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

        // The canvas hands us a data: URI. Accept only a PNG one, and cap the
        // size — a hidden field is user input like any other (§29).
        const avatar = (req.body.avatarData || '').trim();
        const avatarUrl = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(avatar) && avatar.length < 200000
            ? avatar
            : undefined;

        const updated = await User.update(req.session.user._id, {
            ...(avatarUrl ? { avatarUrl } : {}),
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

module.exports = { showUser, showEdit, update, remove };
