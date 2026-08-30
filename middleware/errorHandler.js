// Express recognises an error handler by its FOUR parameters. Removing `next`
// silently turns this back into a normal middleware and errors stop reaching it.
function errorHandler(err, req, res, next) {
    const status = err.status || 500;

    // Full detail to the server console, for us.
    console.error(`[${status}] ${err.message}`);

    /**
     * Three tiers, because "5xx" is not one thing (§29):
     *
     * 1. err.userMessage — set deliberately by us, safe by construction.
     *    Used for upstream failures (502/503) where the cause is a third
     *    party and naming it is genuinely useful: "Facebook rejected the
     *    post: ..." tells the user something, "something went wrong" does not.
     *
     * 2. 4xx — the user caused it. A bad id, no permission, the last admin
     *    trying to leave. Written for them, safe to show.
     *
     * 3. Everything else is our bug. The message can leak file paths or query
     *    fragments, so it goes to the console and the user gets a generic line.
     */
    let message;
    if (err.userMessage) {
        message = err.userMessage;
    } else if (status < 500) {
        message = err.message;
    } else {
        message = 'Something went wrong on our end.';
    }

    const page = (status === 404 || status === 403) ? String(status) : '500';

    res.status(status).render('errors/' + page, {
        title: 'Error ' + status,
        status,
        message
    });
}

module.exports = errorHandler;
