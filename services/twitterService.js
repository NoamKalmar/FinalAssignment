/**
 * Twitter/X API integration — §33.iv.
 * Mirrors services/facebookService.js: server-side fetch calls only, no
 * widgets/iframes/window.open, and both directions are covered:
 *   publish()       our post -> a real tweet
 *   getEngagement() Twitter  -> like/retweet counts back into our UI
 *
 * Unlike Facebook, X's *write* endpoint (posting a tweet) requires OAuth 1.0a
 * request signing — every POST needs a per-request cryptographic signature
 * built from all 4 credentials below. Reading can use the simpler Bearer
 * Token alone. Node's built-in crypto module does the signing — no extra
 * package needed.
 *
 * Credentials live in .env (see .env.example).
 */

const crypto = require('crypto');

const API = 'https://api.twitter.com/2';
const TIMEOUT_MS = 6000;

function config() {
    return {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        bearerToken: process.env.TWITTER_BEARER_TOKEN,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    };
}

// Lets the UI hide the tweet button rather than offering something that
// cannot work — same idea as facebookService.isConfigured().
function isConfigured() {
    const c = config();
    return Boolean(c.apiKey && c.apiSecret && c.bearerToken && c.accessToken && c.accessTokenSecret);
}

/**
 * Builds the OAuth 1.0a "Authorization" header X requires on write requests.
 *
 * The algorithm (fixed by the OAuth 1.0a spec, not our choice):
 *   1. Collect all oauth_* parameters + a fresh nonce + timestamp
 *   2. Sort them alphabetically and URL-encode into one "parameter string"
 *   3. Build a "signature base string": METHOD & URL & paramString (all encoded)
 *   4. HMAC-SHA1 that base string using apiSecret + accessTokenSecret as the key
 *   5. Base64-encode the result — that's oauth_signature
 *   6. Send all oauth_* fields (including the signature) as one header
 */
function buildOAuthHeader(method, url) {
    const c = config();

    const oauthParams = {
        oauth_consumer_key: c.apiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: c.accessToken,
        oauth_version: '1.0'
    };

    const encode = s => encodeURIComponent(s).replace(/[!*()']/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

    const paramString = Object.keys(oauthParams)
        .sort()
        .map(k => `${encode(k)}=${encode(oauthParams[k])}`)
        .join('&');

    const baseString = [method.toUpperCase(), encode(url), encode(paramString)].join('&');
    const signingKey = `${encode(c.apiSecret)}&${encode(c.accessTokenSecret)}`;

    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    const headerParams = { ...oauthParams, oauth_signature: signature };
    const header = 'OAuth ' + Object.keys(headerParams)
        .sort()
        .map(k => `${encode(k)}="${encode(headerParams[k])}"`)
        .join(', ');

    return header;
}

async function call(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json();

    if (body.errors || (body.title && res.status >= 400)) {
        const msg = (body.errors && body.errors[0] && body.errors[0].message) || body.title || 'Twitter request failed';
        const err = new Error(msg);
        err.twStatus = res.status;
        throw err;
    }
    return body;
}

/** Post a tweet. Requires the full OAuth 1.0a signed header. */
async function publish(text) {
    if (!isConfigured()) throw new Error('Twitter is not configured.');

    const url = `${API}/tweets`;
    const result = await call(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': buildOAuthHeader('POST', url)
        },
        body: JSON.stringify({ text })
    });

    return result.data.id;   // the new tweet's id
}

// Small in-memory cache, same idea as weatherService. Unlike Facebook, X
// bills per request — every view of a shared post would otherwise cost
// another read, so refreshing a page repeatedly spends real credit. Two
// minutes is short enough that a like arriving mid-demo still shows up.
const cache = new Map();
const CACHE_MS = 2 * 60 * 1000;

function cached(key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    cache.delete(key);
    return null;
}

/**
 * Read back a tweet's public metrics — the receive half of §33.iv.
 * Read-only, so the simpler Bearer Token is enough (no OAuth 1.0a needed).
 */
async function getEngagement(tweetId) {
    const c = config();
    if (!c.bearerToken) return null;

    const hit = cached(tweetId);
    if (hit !== null) return hit;

    const url = `${API}/tweets/${tweetId}?tweet.fields=public_metrics,created_at`;
    const data = await call(url, {
        headers: { 'Authorization': `Bearer ${c.bearerToken}` }
    });

    const m = (data.data && data.data.public_metrics) || {};
    const value = {
        permalink: `https://twitter.com/i/web/status/${tweetId}`,
        createdTime: (data.data && data.data.created_at) || null,
        likes: m.like_count || 0,
        comments: m.reply_count || 0,
        retweets: m.retweet_count || 0
    };

    cache.set(tweetId, { at: Date.now(), value });
    return value;
}

/** Delete a tweet — so an author can undo a share. Also needs OAuth 1.0a. */
async function unpublish(tweetId) {
    if (!isConfigured()) throw new Error('Twitter is not configured.');

    const url = `${API}/tweets/${tweetId}`;
    await call(url, {
        method: 'DELETE',
        headers: { 'Authorization': buildOAuthHeader('DELETE', url) }
    });

    // Otherwise a deleted tweet's counts would keep being served from cache.
    cache.delete(tweetId);
    return true;
}

module.exports = { isConfigured, publish, getEngagement, unpublish };