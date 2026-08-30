const twitterService = require('../services/twitterService');
const Post = require('../models/Post');

const share = async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return next(notFound());

        const text = post.content.slice(0, 280);
        const tweetId = await twitterService.publish(text);
        await Post.setTwitterShare(req.params.postId, tweetId);

        res.redirect('/posts/' + req.params.postId);
    } catch (err) {
        next(err);
    }
};

const engagement = async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post || !post.twitterPostId) return res.json({ success: true, engagement: null });

        const data = await twitterService.getEngagement(post.twitterPostId);
        res.json({ success: true, engagement: data });
    } catch (err) {
        next(err);
    }
};

module.exports = { share, engagement };