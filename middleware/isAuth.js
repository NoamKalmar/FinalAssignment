/**
 * Access control (§25).
 *
 * Two opposite guards:
 *   isAuth  — the route requires a logged-in user
 *   isGuest — the route is only for logged-out visitors (landing, register)
 *
 * Both redirect rather than render, so a user is never left on a dead end.
 */

// Protects /feed, /profile, /groups, everything behind the login.
function isAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    // Not logged in -> send to the landing page, which holds the login form.
    // A redirect, not a 403: this page IS available to them, once they log in.
    return res.redirect('/');
}

// Keeps a logged-in user off the landing and register pages.
function isGuest(req, res, next) {
    if (req.session && req.session.user) {
        return res.redirect('/feed');
    }
    return next();
}

module.exports = { isAuth, isGuest };
