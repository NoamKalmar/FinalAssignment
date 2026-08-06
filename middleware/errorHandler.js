// Express recognises an error handler by its FOUR parameters. Removing `next`
// silently turns this back into a normal middleware and errors stop reaching it.
function errorHandler(err, req, res, next) {
    const status = err.status || 500;

    // Full detail to the server console, for us.
    console.error(`[${status}] ${err.message}`);

    // Never leak a stack trace to the user (§29).
    const page = (status === 404 || status === 403) ? String(status) : '500';

    res.status(status).render('errors/' + page, {
        title: 'שגיאה ' + status,
        message: err.message
    });
}

module.exports = errorHandler;
