const Post = require('../models/Post');
const Media = require('../models/Media');
const Group = require('../models/Group');

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
        res.render('pages/post-show', { title: 'Post — SocialNet', post });
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
        await Post.remove(req.params.id);
        res.redirect('/posts/mine');
    } catch (err) {
        next(err);
    }
};

module.exports = { showNew, create, show, mine, showEdit, update, remove };
