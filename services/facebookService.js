/**
 * Facebook Graph API integration — §33.iv.
 *
 * The requirement is explicit about what does NOT count:
 *
 *   "הטמעה של iframe או רק כפתורי לייק/שיתוף/פרסום או קוד שפשוט פותח דפים,
 *    חלונות או ממשקים של Twitter/Facebook וכדו' אינה נחשבת."
 *
 * So no share widget and no window.open. Everything here is an HTTP call
 * made by our server to graph.facebook.com, with the response parsed by us.
 *
 * It also asks for לקבל/לשדר — receive AND transmit — so this goes both ways:
 *   publish()       our post   -> a real Facebook Page post
 *   getEngagement() Facebook   -> likes and comments back into our UI
 *
 * The lecturer approved Facebook in place of X, which moved to pay-per-use
 * with no free tier and so conflicted with §15.
 *
 * Credentials live in .env. The Page token is the long-lived, non-expiring
 * kind obtained by exchanging a short-lived user token and then calling
 * /me/accounts — a token straight from Graph API Explorer dies in an hour.
 */

const API = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 6000;

function config() {
    return {
        pageId: process.env.FACEBOOK_PAGE_ID,
        token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    };
}

// Lets the UI hide the share button rather than offering something that
// cannot work.
function isConfigured() {
    const { pageId, token } = config();
    return Boolean(pageId && token);
}

async function call(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json();

    // Graph returns 200 with an error object in some cases, so check the
    // payload rather than trusting the status code.
    if (body.error) {
        const err = new Error(body.error.message || 'Facebook request failed');
        err.fbCode = body.error.code;
        err.fbType = body.error.type;
        throw err;
    }
    return body;
}

/**
 * Publish to the Page.
 *
 * Facebook rejects two identical messages posted in quick succession as
 * duplicates, which is confusing during a demo — so each message carries the
 * author's name, which usually differentiates it. Callers should surface the
 * error rather than retry blindly.
 */
async function publish(message) {
    const { pageId, token } = config();
    if (!pageId || !token) throw new Error('Facebook is not configured.');

    const body = new URLSearchParams({ message, access_token: token });

    const result = await call(`${API}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    return result.id;   // "{page-id}_{post-id}"
}

/**
 * Read back from Facebook — the receive half of §33.iv.
 *
 * summary(true) is what makes Graph return the total counts; without it you
 * get the first page of individual likes and no total, which is useless here.
 */
async function getEngagement(facebookPostId) {
    const { token } = config();
    if (!token) return null;

    const fields = 'permalink_url,created_time,likes.summary(true),comments.summary(true)';
    const data = await call(
        `${API}/${facebookPostId}?fields=${fields}&access_token=${encodeURIComponent(token)}`
    );

    return {
        permalink: data.permalink_url || null,
        createdTime: data.created_time || null,
        likes: (data.likes && data.likes.summary && data.likes.summary.total_count) || 0,
        comments: (data.comments && data.comments.summary && data.comments.summary.total_count) || 0
    };
}

/** Remove a Page post — so an author can undo a share. */
async function unpublish(facebookPostId) {
    const { token } = config();
    if (!token) throw new Error('Facebook is not configured.');

    await call(`${API}/${facebookPostId}?access_token=${encodeURIComponent(token)}`, {
        method: 'DELETE'
    });
    return true;
}

/** Page name and follower count, for the status panel. */
async function pageInfo() {
    const { pageId, token } = config();
    if (!pageId || !token) return null;
    try {
        const d = await call(
            `${API}/${pageId}?fields=name,fan_count,link&access_token=${encodeURIComponent(token)}`
        );
        return { name: d.name, followers: d.fan_count || 0, link: d.link || null };
    } catch {
        return null;
    }
}

module.exports = { isConfigured, publish, getEngagement, unpublish, pageInfo };
