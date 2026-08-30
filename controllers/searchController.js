const Post = require('../models/Post');
const Group = require('../models/Group');

/**
 * Search (§23) and Ajax (§30).
 *
 * Two shapes for each query:
 *   - a page render, so the URL is shareable and the results survive a
 *     refresh or someone arriving with query parameters already set
 *   - a JSON endpoint the browser calls with fetch(), so typing updates
 *     the results without reloading the page
 *
 * The same model function backs both, so the two paths can never disagree.
 */

// GET /search — the page itself
const showSearch = async (req, res, next) => {
    try {
        const [myGroups, categories] = await Promise.all([
            Group.findByMember(req.session.user._id),
            Group.distinctCategories()
        ]);

        // Honour parameters already in the URL, so a shared search link works.
        const tab = req.query.tab === 'groups' ? 'groups' : 'posts';

        res.render('pages/search', {
            title: 'Search — SocialNet',
            tab,
            myGroups,
            categories,
            query: req.query
        });
    } catch (err) {
        next(err);
    }
};

// GET /search/api/posts — §23 query 1, called by fetch()
const searchPosts = async (req, res, next) => {
    try {
        const posts = await Post.search({
            keyword: req.query.keyword,
            type: req.query.type,
            tag: req.query.tag,
            group: req.query.group,
            from: req.query.from,
            to: req.query.to
        });

        // Only what the client needs to draw a result row. The full documents
        // would leak fields the search UI has no business showing.
        res.json({
            count: posts.length,
            results: posts.map(p => ({
                _id: p._id,
                type: p.type,
                content: p.content,
                mediaUrl: p.mediaUrl,
                tags: p.tags || [],
                createdAt: p.createdAt,
                likes: (p.likes || []).length,
                groupName: p.groupName || null,
                group: p.group || null,
                author: {
                    _id: p.author._id,
                    username: p.author.username,
                    fullName: p.author.fullName
                }
            }))
        });
    } catch (err) {
        next(err);
    }
};

// GET /search/api/groups — §23 query 2
const searchGroups = async (req, res, next) => {
    try {
        const groups = await Group.search({
            keyword: req.query.keyword,
            category: req.query.category,
            minMembers: req.query.minMembers,
            from: req.query.from
        });

        const mine = await Group.findByMember(req.session.user._id);
        const mineIds = new Set(mine.map(g => String(g._id)));

        res.json({
            count: groups.length,
            results: groups.map(g => ({
                _id: g._id,
                name: g.name,
                description: g.description,
                category: g.category,
                memberCount: g.memberCount,
                createdAt: g.createdAt,
                joined: mineIds.has(String(g._id))
            }))
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { showSearch, searchPosts, searchGroups };
