const Comment = require('../models/Comment');
const Post = require('../models/Post');

function notFound(message) {
    const err = new Error(message || 'Not found');
    err.status = 404;
    return err;
}

function forbidden(message) {
    const err = new Error(message || 'Not allowed');
    err.status = 403;
    err.userMessage = message || 'You are not allowed to do that.';
    return err;
}

// A malformed :id makes ObjectId throw — that is a 404, not a 500. Same
// helper as postController, because a typed URL should not look like a
// server crash (§29).
function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

// POST /posts/:postId/comments
const create = async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return next(notFound('Post not found'));

        const content = (req.body.content || '').trim();
        if (!content) {
            const err = new Error('Comment cannot be empty.');
            err.status = 400;
            err.userMessage = 'Comment cannot be empty.';
            return next(err);
        }
        if (content.length > 500) {
            const err = new Error('Comment is too long.');
            err.status = 400;
            err.userMessage = 'Comments are limited to 500 characters.';
            return next(err);
        }

        await Comment.create({
            post: req.params.postId,
            author: req.session.user._id,
            content
        });

        res.redirect('/posts/' + req.params.postId);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /posts/:postId/comments/:id/edit
const update = async (req, res, next) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) return next(notFound('Comment not found'));

        // Only the comment's own author may edit it.
        if (String(comment.author) !== String(req.session.user._id)) {
            return next(forbidden('You can only edit your own comments.'));
        }

        const content = (req.body.content || '').trim();
        if (!content) {
            const err = new Error('Comment cannot be empty.');
            err.status = 400;
            err.userMessage = 'Comment cannot be empty.';
            return next(err);
        }

        await Comment.update(req.params.id, content);
        res.redirect('/posts/' + req.params.postId);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /posts/:postId/comments/:id/delete
const remove = async (req, res, next) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) return next(notFound('Comment not found'));

        if (String(comment.author) !== String(req.session.user._id)) {
            return next(forbidden('You can only delete your own comments.'));
        }

        await Comment.remove(req.params.id);
        res.redirect('/posts/' + req.params.postId);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};
// POST /posts/:postId/comments/:id/like
const toggleLike = async (req, res, next) => {
    try {
        const result = await Comment.toggleLike(req.params.id, req.session.user._id);

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, ...result });
        }
        res.redirect('/posts/' + req.params.postId);
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

module.exports = { create, update, remove, toggleLike };