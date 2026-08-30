const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { validateRegistration, validateLogin } = require('../middleware/validate');

// Work factor for bcrypt. 10 means 2^10 internal rounds: fast enough that a
// real login is imperceptible, slow enough that brute-forcing is expensive.
const SALT_ROUNDS = 10;

// What we keep in the session. Deliberately minimal — never the password hash.
function sessionUser(user) {
    return { _id: user._id.toString(), username: user.username, fullName: user.fullName };
}

// GET /  — the landing page, which holds the login form
const showLanding = (req, res) => {
    res.render('pages/home', { title: 'SocialNet' });
};

// POST /login
const login = async (req, res, next) => {
    try {
        const errors = validateLogin(req.body);
        if (errors.length) {
            return res.status(400).render('pages/home', { title: 'SocialNet', error: errors[0] });
        }

        const user = await User.findByUsername(req.body.username.trim());

        // Deliberately the same message whether the username is unknown or the
        // password is wrong. Saying "no such user" would let anyone probe which
        // usernames exist.
        const invalid = () => res.status(401).render('pages/home', {
            title: 'SocialNet',
            error: 'Incorrect username or password.'
        });

        if (!user) return invalid();

        const ok = await bcrypt.compare(req.body.password, user.passwordHash);
        if (!ok) return invalid();

        req.session.user = sessionUser(user);
        return res.redirect('/feed');
    } catch (err) {
        return next(err);
    }
};

// GET /register
const showRegister = (req, res) => {
    res.render('pages/register', { title: 'Sign up — SocialNet', values: {} });
};

// POST /register
const register = async (req, res, next) => {
    // Echo back what they typed so a validation error doesn't wipe the form.
    const values = {
        username: req.body.username || '',
        fullName: req.body.fullName || '',
        email: req.body.email || ''
    };

    try {
        const errors = validateRegistration(req.body);
        if (errors.length) {
            return res.status(400).render('pages/register', {
                title: 'Sign up — SocialNet', values, error: errors[0]
            });
        }

        // Hash before the document ever reaches the database.
        const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);

        const user = await User.create({
            username: req.body.username.trim(),
            passwordHash,
            fullName: req.body.fullName.trim(),
            email: req.body.email.trim().toLowerCase()
        });

        // Log them straight in — no reason to make someone type it twice.
        req.session.user = sessionUser(user);
        return res.redirect('/feed');
    } catch (err) {
        // 11000 is MongoDB's duplicate-key error. It fires when two people
        // register the same username simultaneously and the unique index
        // rejects the second one — a race a controller check cannot catch.
        if (err.code === 11000) {
            return res.status(409).render('pages/register', {
                title: 'Sign up — SocialNet', values,
                error: 'That username is already taken.'
            });
        }
        return next(err);
    }
};

// GET /logout
const logout = (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.redirect('/');
    });
};

module.exports = { showLanding, login, showRegister, register, logout };
