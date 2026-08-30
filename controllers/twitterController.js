const twitterService = require('../services/twitterService');
const Post = require('../models/Post');

function notFound() {
    const err = new Error('Post not found');
    err.status = 404;
    return err;
}

function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

/**
 * POST /twitter/:id/share
 *
 * isOwner has already confirmed the caller wrote the post and loaded it into
 * req.doc, so there is no second lookup here.
 */
const share = async (req, res, next) => {
    const post = req.doc;
    try {
        if (!twitterService.isConfigured()) {
            const err = new Error('Twitter is not configured on this server.');
            err.status = 503;
            err.userMessage = 'Twitter sharing is not configured on this server.';
            return next(err);
        }

        if (post.twitterPostId) {
            const err = new Error('This post has already been shared to Twitter.');
            err.status = 400;
            return next(err);
        }

        // X refuses a tweet whose text matches one already posted, which is
        // easy to hit during a demo. Signing each message with the author
        // makes otherwise-identical posts distinct — the same reason the
        // Facebook service does it.
        //
        // The suffix is measured first so a long post loses its own tail
        // rather than the signature: 280 is X's hard limit and anything
        // longer is rejected outright.
        const signature = '\n\n— ' + req.session.user.fullName + ' on SocialNet';
        const room = 280 - signature.length;
        const body = post.content.length > room
            ? post.content.slice(0, room - 1).trimEnd() + '…'
            : post.content;

        const tweetId = await twitterService.publish(body + signature);
        await Post.setTwitterShare(req.params.id, tweetId);

        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        // A third-party outage is not our bug, and must not read like one.
        // Surface X's own message so the cause is visible (§29).
        const e = new Error('Twitter rejected the post: ' + err.message);
        e.status = 502;
        e.userMessage = 'Twitter rejected the post: ' + err.message;
        next(e);
    }
};

/** POST /twitter/:id/unshare — delete the tweet again. */
const unshare = async (req, res, next) => {
    const post = req.doc;
    try {
        if (!post.twitterPostId) return res.redirect('/posts/' + req.params.id);

        await twitterService.unpublish(post.twitterPostId);
        await Post.setTwitterShare(req.params.id, null);

        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        // If X no longer has it — deleted by hand, credentials changed — then
        // clearing our own reference is still the right outcome.
        await Post.setTwitterShare(req.params.id, null);
        res.redirect('/posts/' + req.params.id);
    }
};

/**
 * GET /twitter/:id/engagement — the receive half of §33.iv.
 * Fetched by the browser after the page renders, so a slow or failing X
 * call never blocks the post from displaying.
 */
const engagement = async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return next(notFound());
        if (!post.twitterPostId) return res.json({ success: true, engagement: null });

        const data = await twitterService.getEngagement(post.twitterPostId);
        res.json({ success: true, engagement: data });
    } catch (err) {
        if (isBadId(err)) return next(notFound());
        // The panel degrades to "unavailable" rather than breaking the page.
        res.json({ success: false, engagement: null });
    }
};

module.exports = { share, unshare, engagement };
