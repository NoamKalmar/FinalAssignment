// Express recognises an error handler by its FOUR parameters. Removing `next`
// silently turns this back into a normal middleware and errors stop reaching it.
function errorHandler(err, req, res, next) {
    const status = err.status || 500;

    // Full detail to the server console, for us.
    console.error(`[${status}] ${err.message}`);

    /**
     * Client errors (4xx) are things the user did — a bad id, no permission,
     * the last admin trying to leave. Their message is written for the user
     * and is safe to show.
     *
     * Server errors (5xx) are our bugs. Their message can leak file paths,
     * query fragments or worse, so the user gets a generic line instead (§29).
     */
    const message = status < 500
        ? (err.userMessage || err.message)
        : 'Something went wrong on our end.';

    const page = (status === 404 || status === 403) ? String(status) : '500';

    res.status(status).render('errors/' + page, {
        title: 'Error ' + status,
        status,
        message
    });
}

module.exports = errorHandler;
