const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Media = require('../models/Media');
const Group = require('../models/Group');
const twitter = require('../services/twitterService');
const facebook = require('../services/facebookService');

/**
 * Media reaches a post two ways:
 *   - an uploaded file (req.file) — stored in MongoDB, so all three of us
 *     see it regardless of who uploaded it
 *   - a URL (req.body.mediaUrl) — used by the seed script, keeps the demo
 *     data small while still rendering everywhere
 * Upload wins if both are supplied.
 */
async function resolveMedia(req) {
    if (req.file) {
        const id = await Media.create({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            uploadedBy: req.session.user._id
        });
        return '/media/' + id;
    }
    const url = (req.body.mediaUrl || '').trim();
    return url || null;
}

// Removes a stored file we are no longer referencing. Only touches media we
// own — an external URL is not ours to delete.
async function dropMedia(mediaUrl) {
    if (!mediaUrl || !mediaUrl.startsWith('/media/')) return;
    try {
        await Media.remove(mediaUrl.split('/').pop());
    } catch {
        // A leftover row is untidy, not fatal.
    }
}

function validate(body, mediaUrl) {
    const errors = [];
    const content = (body.content || '').trim();

    if (!Post.TYPES.includes(body.type)) errors.push('Please choose a post type.');
    if (!content) errors.push('A post needs some text.');
    if (content.length > 2000) errors.push('Posts are limited to 2000 characters.');
    if ((body.type === 'image' || body.type === 'video') && !mediaUrl) {
        errors.push('An ' + body.type + ' post needs a file or a link.');
    }
    return errors;
}

function parseTags(raw) {
    return (raw || '')
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 10);
}

// A user may only post into a group they belong to. Without this check a
// crafted form could drop a post into any group.
async function resolveGroup(req) {
    const id = (req.body.group || '').trim();
    if (!id) return null;
    const mine = await Group.findByMember(req.session.user._id);
    return mine.some(g => String(g._id) === id) ? id : null;
}

function notFound() {
    const err = new Error('Post not found');
    err.status = 404;
    return err;
}

// A malformed :id makes ObjectId throw — a 404, not a 500.
function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

// GET /posts/new
const showNew = async (req, res, next) => {
    try {
        const myGroups = await Group.findByMember(req.session.user._id);
        const postType = Post.TYPES.includes(req.query.type) ? req.query.type : 'text';
        res.render('pages/post-form', {
            title: 'New post — SocialNet',
            mode: 'new',
            myGroups,
            // ?group=<id> arrives from the "Post here" button on a group page
            // ?type=<type> arrives from composer shortcuts on the feed
            post: { type: postType, content: '', mediaUrl: '', tags: [], group: req.query.group || '' }
        });
    } catch (err) { next(err); }
};

// POST /posts
const create = async (req, res, next) => {
    let mediaUrl = null;
    try {
        mediaUrl = await resolveMedia(req);

        const errors = validate(req.body, mediaUrl);
        if (errors.length) {
            await dropMedia(mediaUrl);
            return res.status(400).render('pages/post-form', {
                title: 'New post — SocialNet', mode: 'new', error: errors[0], myGroups: await Group.findByMember(req.session.user._id),
                post: {
                    type: req.body.type,
                    content: req.body.content,
                    mediaUrl: req.file ? '' : (req.body.mediaUrl || ''),
                    tags: parseTags(req.body.tags)
                }
            });
        }

        const post = await Post.create({
            author: req.session.user._id,
            group: await resolveGroup(req),
            type: req.body.type,
            content: req.body.content.trim(),
            mediaUrl,
            tags: parseTags(req.body.tags)
        });

        res.redirect('/posts/' + post._id);
    } catch (err) {
        await dropMedia(mediaUrl);
        next(err);
    }
};

// GET /posts/:id
const show = async (req, res, next) => {
    try {
        const post = await Post.findByIdWithAuthor(req.params.id);
        if (!post) return next(notFound());

        const comments = await Comment.findByPostWithAuthor(req.params.id);

        res.render('pages/post-show', {
            title: 'Post — SocialNet',
            post,
            comments,
            facebookConfigured: facebook.isConfigured(),
            twitterConfigured: twitter.isConfigured()
        });
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// GET /posts/mine  (§27)
const mine = async (req, res, next) => {
    try {
        const posts = await Post.findByAuthorWithAuthor(req.session.user._id);
        res.render('pages/post-list', {
            title: 'My posts — SocialNet',
            heading: 'My posts',
            posts,
            empty: "You haven't posted anything yet."
        });
    } catch (err) {
        next(err);
    }
};

// GET /posts/:id/edit  — isOwner already loaded the post into req.doc
const showEdit = async (req, res, next) => {
    try {
        const myGroups = await Group.findByMember(req.session.user._id);
        res.render('pages/post-form', {
            title: 'Edit post — SocialNet', mode: 'edit', myGroups, post: req.doc
        });
    } catch (err) { next(err); }
};

// POST /posts/:id/edit
const update = async (req, res, next) => {
    const existing = req.doc;
    let newMedia = null;
    try {
        newMedia = await resolveMedia(req);
        const mediaUrl = newMedia || existing.mediaUrl;   // keep the old one if unchanged

        const errors = validate(req.body, mediaUrl);
        if (errors.length) {
            await dropMedia(newMedia);
            return res.status(400).render('pages/post-form', {
                title: 'Edit post — SocialNet', mode: 'edit', error: errors[0], myGroups: await Group.findByMember(req.session.user._id),
                post: { ...existing, type: req.body.type, content: req.body.content }
            });
        }

        // Replacing the media orphans the previous file.
        if (newMedia && existing.mediaUrl && newMedia !== existing.mediaUrl) {
            await dropMedia(existing.mediaUrl);
        }

        await Post.update(req.params.id, {
            group: await resolveGroup(req),
            type: req.body.type,
            content: req.body.content.trim(),
            mediaUrl,
            tags: parseTags(req.body.tags)
        });

        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        await dropMedia(newMedia);
        next(err);
    }
};

// POST /posts/:id/delete
const remove = async (req, res, next) => {
    try {
        await dropMedia(req.doc.mediaUrl);   // don't leave the bytes behind

        // Comments live in their own collection, so deleting the post does
        // not remove them — they would stay behind pointing at an id that no
        // longer exists. Removed first: if the post delete then fails, the
        // user retries and nothing is left half-deleted either way.
        await Comment.removeByPost(req.params.id);

        await Post.remove(req.params.id);

        const referrer = req.get('Referrer');
        if (referrer && referrer.includes(req.headers.host) && !referrer.includes('/posts/' + req.params.id)) {
            return res.redirect(referrer);
        }

        res.redirect('/feed');
    } catch (err) {
        next(err);
    }
};

// POST /posts/:id/like
const toggleLike = async (req, res, next) => {
    try {
        const result = await Post.toggleLike(req.params.id, req.session.user._id);

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, ...result });
        }

        const referrer = req.get('Referrer');
        if (referrer && referrer.includes(req.headers.host)) {
            return res.redirect(referrer);
        }
        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// ---------------------------------------------------------------------------
// Facebook Graph API — §33.iv
//
// The requirement rules out iframes and share widgets: this has to send data
// to Facebook and read data back, from our own server. isOwner has already
// confirmed the caller wrote the post, so only an author can publish their
// own content.
// ---------------------------------------------------------------------------

// POST /posts/:id/share
const shareToFacebook = async (req, res, next) => {
    const post = req.doc;
    try {
        if (!facebook.isConfigured()) {
            const err = new Error('Facebook is not configured on this server.');
            err.status = 503;
            err.userMessage = 'Facebook sharing is not configured on this server.';
            return next(err);
        }

        if (post.facebookPostId) {
            const err = new Error('This post has already been shared to Facebook.');
            err.status = 400;
            return next(err);
        }

        // The author's name makes otherwise-identical messages distinct —
        // Facebook rejects a repeated message as a duplicate.
        const author = req.session.user.fullName;
        const message = post.content
            + '\n\n— ' + author + ' on SocialNet'
            + (post.mediaUrl && !post.mediaUrl.startsWith('/media/') ? '\n' + post.mediaUrl : '');

        const facebookPostId = await facebook.publish(message);
        await Post.setFacebookShare(req.params.id, facebookPostId);

        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        // A third-party outage is not our bug, and must not read like one.
        // Surface Facebook's own message so the cause is visible (§29).
        const e = new Error('Facebook rejected the post: ' + err.message);
        e.status = 502;
        // Marked user-facing: this is Facebook's own wording, not our internals,
        // so the error page may show it rather than a generic 5xx line.
        e.userMessage = 'Facebook rejected the post: ' + err.message;
        next(e);
    }
};

// POST /posts/:id/unshare — remove the Page post again
const unshareFromFacebook = async (req, res, next) => {
    const post = req.doc;
    try {
        if (!post.facebookPostId) return res.redirect('/posts/' + req.params.id);

        await facebook.unpublish(post.facebookPostId);
        await Post.setFacebookShare(req.params.id, null);

        res.redirect('/posts/' + req.params.id);
    } catch (err) {
        // If Facebook no longer has it — deleted by hand, token changed — the
        // local flag is stale either way, so clear it rather than leaving the
        // user stuck with a button that always fails.
        await Post.setFacebookShare(req.params.id, null);
        res.redirect('/posts/' + req.params.id);
    }
};

// GET /posts/:id/engagement — the RECEIVE half of §33.iv, called by fetch()
const facebookEngagement = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post || !post.facebookPostId) return res.json({ ok: false });

        const data = await facebook.getEngagement(post.facebookPostId);
        res.json(data ? { ok: true, ...data } : { ok: false });
    } catch (err) {
        // Engagement is supplementary. If Facebook is unreachable the post
        // page still renders; the panel just says so.
        res.json({ ok: false, reason: err.message });
    }
};

module.exports = {
    showNew, create, show, mine, showEdit, update, remove, toggleLike,
    shareToFacebook, unshareFromFacebook, facebookEngagement
};
