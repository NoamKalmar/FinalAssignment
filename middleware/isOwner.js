/**
 * Ownership check (§25) — "is this thing actually yours?"
 *
 * Distinct from isAuth, which only asks "are you logged in?". A logged-in
 * user passes isAuth and can still be trying to edit someone else's post.
 *
 * This is a middleware FACTORY: it needs to know which model to look in and
 * which field names the owner, so it takes those and returns the middleware.
 *
 *   router.post('/posts/:id/delete', isAuth, isOwner(Post, 'author'), ctrl.remove);
 *
 * Order matters — isAuth must run first, because req.session.user only exists
 * once it has confirmed there is a session.
 */
function isOwner(model, ownerField = 'author') {
    return async (req, res, next) => {
        try {
            const doc = await model.findById(req.params.id);

            if (!doc) {
                const err = new Error('Not found');
                err.status = 404;
                return next(err);
            }

            if (String(doc[ownerField]) !== String(req.session.user._id)) {
                // 403, not a redirect. Compare with isAuth, which redirects to
                // the login page because the user COULD gain access. Here they
                // are already logged in and the answer is permanently no.
                const err = new Error('You do not have permission to do that');
                err.status = 403;
                return next(err);
            }

            // Hand the document to the controller so it does not run the same
            // query a second time.
            req.doc = doc;
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = isOwner;
