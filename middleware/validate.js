/**
 * Server-side validation (§29).
 *
 * Written by hand rather than pulled from a package — nothing like this was
 * taught in the course, and the rules here are small enough not to justify a
 * dependency.
 *
 * IMPORTANT: the browser also validates (required, minlength, pattern), but
 * that is only a convenience. Anyone can bypass the browser with curl or
 * DevTools, so every rule below must exist on the server regardless.
 */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validateRegistration(body) {
    const errors = [];

    if (!body.username || !USERNAME_RE.test(body.username)) {
        errors.push('Username must be 3-20 characters: letters, digits or underscore.');
    }
    if (!body.fullName || body.fullName.trim().length < 2) {
        errors.push('Please enter your full name.');
    }
    if (!body.email || !EMAIL_RE.test(body.email)) {
        errors.push('Please enter a valid email address.');
    }
    if (!body.password || body.password.length < 6) {
        errors.push('Password must be at least 6 characters.');
    }
    if (body.password !== body.confirmPassword) {
        errors.push('The two passwords do not match.');
    }

    return errors;
}

function validateLogin(body) {
    const errors = [];
    if (!body.username || !body.username.trim()) errors.push('Please enter your username.');
    if (!body.password) errors.push('Please enter your password.');
    return errors;
}

module.exports = { validateRegistration, validateLogin };
