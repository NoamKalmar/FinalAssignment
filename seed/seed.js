/**
 * Demo data — §28.
 *
 *   "טרם ההגנה, יש להזין לרשת החברתית מספיק מידע בכדי שהפרויקט ידמה רשת
 *    חברתית אמיתית. כלומר, צריך להזין משתמשים, קבוצות, פוסטים וכו'."
 *
 * Run:  npm run seed          add demo data, leaving real accounts alone
 *       npm run seed:reset    remove previously seeded data first
 *
 * Two decisions worth knowing:
 *
 * 1. Seeded accounts are identified by their @demo.socialnet email domain,
 *    so a reset can never touch a real account someone actually uses. No
 *    extra marker field is needed on the documents.
 *
 * 2. Images are external URLs rather than uploads. Uploaded bytes live in
 *    the media collection and would add megabytes to a 512 MB cluster; a URL
 *    costs nothing and still renders on all three of our machines.
 *
 * Dates are spread across the last ten weeks, weighted towards recent, so
 * the activity timeline chart has a realistic shape instead of a single spike.
 */

require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { connectDB, getDB } = require('../config/db');

const DEMO_DOMAIN = 'demo.socialnet';
const DEMO_PASSWORD = 'demo1234';        // every seeded account, for the demo
const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness: the same seed always produces the same
// data, so a reseed is reproducible and everyone's demo looks identical.
// ---------------------------------------------------------------------------
let rngState = 20260901;
function rnd() {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
}
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
    return out;
};

// Weighted towards recent so the timeline rises rather than sitting flat.
function pastDate(maxDaysAgo = 70) {
    const skewed = Math.pow(rnd(), 1.7);           // bias towards 0 = today
    const days = skewed * maxDaysAgo;
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(days));
    d.setHours(7 + Math.floor(rnd() * 15), Math.floor(rnd() * 60), 0, 0);

    // The hour is picked between 07:00 and 21:00 regardless of the day, so
    // landing on today can produce a time later than right now — a post dated
    // in the future, which reads as broken on the feed and makes any comment
    // on it appear to predate it. Pull those back to a few minutes ago.
    const now = new Date();
    if (d > now) return new Date(now.getTime() - Math.floor(rnd() * 90 + 5) * 60 * 1000);

    return d;
}

// ---------------------------------------------------------------------------
const PEOPLE = [
    ['maya_bar',      'Maya Bar',          'Tel Aviv',      'Photographer. Chasing light.'],
    ['ori_cohen',     'Ori Cohen',         'Haifa',         'Backend developer, coffee dependent.'],
    ['noa_levi',      'Noa Levi',          'Jerusalem',     'Hiking every weekend.'],
    ['itay_shalev',   'Itay Shalev',       'Rishon LeZion', 'CS student. Building things.'],
    ['tamar_gold',    'Tamar Goldstein',   'Ramat Gan',     'UX designer. Type nerd.'],
    ['yonatan_r',     'Yonatan Regev',     'Beer Sheva',    'Guitar, code, repeat.'],
    ['shira_katz',    'Shira Katz',        'Netanya',       'Cooking is chemistry you can eat.'],
    ['amir_dayan',    'Amir Dayan',        'Herzliya',      'Trail runner and data nerd.'],
    ['lior_ben',      'Lior Ben-Ami',      'Modiin',        'Learning something new weekly.'],
    ['dana_frid',     'Dana Friedman',     'Tel Aviv',      'Film photography, mostly.'],
    ['eitan_mor',     'Eitan Mor',         'Ashdod',        'Gamer. Occasionally sleeps.'],
    ['hila_shani',    'Hila Shani',        'Kfar Saba',     'Baking sourdough since forever.'],
    ['gal_avrahami',  'Gal Avrahami',      'Holon',         'Frontend. CSS apologist.'],
    ['roni_peled',    'Roni Peled',        'Raanana',       'Travelling light.'],
    ['ben_shapira',   'Ben Shapira',       'Petah Tikva',   'Reading, mostly non-fiction.'],
    ['adi_rosen',     'Adi Rosen',         'Givatayim',     'Coffee, cameras, mountains.']
];

const GROUPS = [
    ['Web Development 2026', 'study',       'Course group. Questions, resources and project chat.'],
    ['Photography',          'photography', 'Share what you shot this week. Any camera, any level.'],
    ['Hiking & Trails',      'travel',      'Routes, conditions and weekend plans around the country.'],
    ['Home Cooking',         'food',        'Recipes that actually worked. Failures welcome too.'],
    ['Game Night',           'gaming',      'What we are playing and who is up for a session.'],
    ['Live Music',           'music',       'Gigs, records and the occasional argument about mixing.']
];

// Per-group content so posts read as if they belong where they are.
const CONTENT = {
    'Web Development 2026': [
        'Finally got sessions working. The middleware order was the whole problem — body parsing has to come before the routes.',
        'Anyone else find aggregation pipelines click once you stop thinking of them as SQL?',
        'Spent an hour on a bug that turned out to be a missing enctype on the form. Uploads silently send nothing without it.',
        'Reminder that hiding a button is not security. The server has to check again.',
        'bcrypt being slow is the point. Took me embarrassingly long to understand that.',
        'Indexes matter more than I expected. One compound index took a query from 400ms to 3ms.',
        'TIL you can validate document shape in MongoDB itself with $jsonSchema. No ORM needed.',
        'Debouncing the search input cut our database calls by about 90%.'
    ],
    'Photography': [
        'Golden hour on the beach. Twenty minutes of good light and then it was gone.',
        'Shot this on a 40 year old lens. Sharper than it has any right to be.',
        'Rule of thirds is a suggestion, not a law. Fight me.',
        'Finally developed the roll that has been in my bag since spring.',
        'Overcast days are underrated. Soft light, no harsh shadows.',
        'Got up at 4am for fog that never arrived. Still worth it.'
    ],
    'Hiking & Trails': [
        'Did the Gilboa ridge this morning. Steep first hour, then it opens up completely.',
        'Water situation on the southern route is better than last month. Two working springs.',
        'Started before sunrise to beat the heat. Correct decision.',
        'Trail markers past the junction are faded — bring a map, do not rely on them.',
        'Six hours, and about four of them were worth it. The other two were uphill.'
    ],
    'Home Cooking': [
        'Sourdough attempt number nine. First one with a proper open crumb.',
        'Roasted the vegetables at a much higher heat than usual. Completely different result.',
        'The trick with risotto is that you cannot walk away. Learned that the hard way.',
        'Made too much and regret nothing.',
        'Shakshuka argument settled: the eggs go in last and the pan comes off early.'
    ],
    'Game Night': [
        'Anyone up for something co-op this weekend?',
        'Finished it in one sitting. The last two hours are extraordinary.',
        'Playing this on the hardest difficulty was a mistake and I am not stopping.',
        'The soundtrack alone is worth the price.'
    ],
    'Live Music': [
        'Small venue, four bands, ears still ringing. Perfect.',
        'The bass was mixed so loud I felt it in my teeth. Somehow that worked.',
        'Learning this riff has taken me three weeks and I am not close.',
        'Vinyl is not better, it is just more effort, and I think that is the point.'
    ],
    personal: [
        'First post here. Still working out what this is for.',
        'Long week. Good coffee helped.',
        'Reorganised my desk and immediately felt more competent. Placebo, probably.',
        'Walked home instead of taking the bus. Should do that more.',
        'Started a new book. Two chapters in and already recommending it.',
        'It is far too hot to do anything useful today.',
        'Sat outside for an hour with no phone. Recommended.',
        'Trying to be better about actually finishing things.'
    ]
};

const TAGS = {
    'Web Development 2026': ['nodejs', 'mongodb', 'javascript', 'webdev', 'express'],
    'Photography': ['photography', 'film', 'goldenhour', 'street'],
    'Hiking & Trails': ['hiking', 'trails', 'outdoors', 'nature'],
    'Home Cooking': ['cooking', 'baking', 'food', 'recipes'],
    'Game Night': ['gaming', 'coop', 'indie'],
    'Live Music': ['music', 'live', 'guitar', 'vinyl'],
    personal: ['life', 'thoughts', 'weekend']
};

// Replies are keyed by group so a comment reads as an answer to the post it
// sits under, rather than a generic line that would fit anywhere.
const REPLIES = {
    'Web Development 2026': [
        'This caught me too. The order of the middleware is not obvious until it breaks.',
        'Do you have a link to where you read that? Would like the details.',
        'Same thing happened to me last week. Took a while to spot.',
        'Adding an index made the biggest difference for us as well.',
        'Worth putting this in the group description so nobody else loses an evening.'
    ],
    'Photography': [
        'The light in this one is lovely.',
        'What lens was this shot on?',
        'Overcast is genuinely underrated, agreed.',
        'Would love to see the rest of the roll.'
    ],
    'Hiking & Trails': [
        'Did this one in spring. The last hour is worth it.',
        'Good to know about the water, thanks.',
        'How long did it take you door to door?',
        'Adding this to the list for next month.'
    ],
    'Home Cooking': [
        'That crumb looks excellent.',
        'Recipe please.',
        'Higher heat really does change everything.',
        'Tried this yesterday and it worked.'
    ],
    'Game Night': [
        'I am up for it. Weekend works.',
        'The ending stayed with me for days.',
        'Count me in if there is still room.'
    ],
    'Live Music': [
        'Small venues are always the best ones.',
        'Which night was this?',
        'Three weeks sounds about right for that riff.'
    ],
    personal: [
        'Completely agree.',
        'Ha, this is very relatable.',
        'Hope the week gets easier.',
        'Good call.'
    ]
};

// ---------------------------------------------------------------------------

async function reset(db) {
    const demoUsers = await db.collection('users')
        .find({ email: { $regex: '@' + DEMO_DOMAIN + '$' } })
        .project({ _id: 1 })
        .toArray();
    const ids = demoUsers.map(u => u._id);

    if (!ids.length) {
        console.log('  nothing seeded previously');
        return;
    }

    // Comments first, and by post as well as by author: a real account may
    // have replied to a demo post, and that comment has to go too or it is
    // left pointing at a post id that no longer exists.
    const demoPostIds = await db.collection('posts')
        .find({ author: { $in: ids } }, { projection: { _id: 1 } })
        .toArray();
    const comments = await db.collection('comments').deleteMany({
        $or: [
            { author: { $in: ids } },
            { post: { $in: demoPostIds.map(p => p._id) } }
        ]
    });

    // Friend requests point at users from both ends, so either side being a
    // demo account is enough to make the row meaningless once that user goes.
    await db.collection('friendRequests').deleteMany({
        $or: [{ from: { $in: ids } }, { to: { $in: ids } }]
    });

    const posts = await db.collection('posts').deleteMany({ author: { $in: ids } });
    const groups = await db.collection('groups').deleteMany({ owner: { $in: ids } });

    // Real accounts may have joined a demo group or liked a demo post; strip
    // the references so nothing points at a deleted document.
    await db.collection('groups').updateMany({}, { $pull: { members: { user: { $in: ids } } } });
    await db.collection('posts').updateMany({}, { $pull: { likes: { $in: ids } } });
    await db.collection('users').updateMany({}, { $pull: { friends: { $in: ids } } });
    await db.collection('comments').updateMany({}, { $pull: { likes: { $in: ids } } });

    const users = await db.collection('users').deleteMany({ _id: { $in: ids } });

    console.log(`  removed ${users.deletedCount} users, ${groups.deletedCount} groups, ${posts.deletedCount} posts, ${comments.deletedCount} comments`);
}

async function main() {
    await connectDB();
    const db = getDB();

    console.log('\nSeeding demo data (§28)\n' + '─'.repeat(52));

    if (RESET) {
        console.log('\nResetting previous demo data...');
        await reset(db);
    }

    // ---- users ----
    console.log('\nUsers');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const userDocs = PEOPLE.map(([username, fullName, city, bio]) => ({
        username,
        passwordHash,
        fullName,
        email: `${username}@${DEMO_DOMAIN}`,
        avatarUrl: null,
        bio,
        address: { street: '', city, lat: null, lng: null },
        friends: [],
        createdAt: pastDate(90)
    }));

    // Skip anyone already present so a re-run does not collide with the
    // unique index on username.
    const existing = await db.collection('users')
        .find({ username: { $in: userDocs.map(u => u.username) } })
        .project({ username: 1 })
        .toArray();
    const have = new Set(existing.map(u => u.username));
    const toInsert = userDocs.filter(u => !have.has(u.username));

    if (toInsert.length) await db.collection('users').insertMany(toInsert);
    const users = await db.collection('users')
        .find({ email: { $regex: '@' + DEMO_DOMAIN + '$' } })
        .toArray();
    console.log(`  ${toInsert.length} inserted, ${users.length} demo users total`);

    // ---- friendships (mutual) ----
    console.log('\nFriendships');
    let links = 0;
    for (const u of users) {
        const others = users.filter(o => !o._id.equals(u._id));
        for (const f of pickN(others, 3 + Math.floor(rnd() * 4))) {
            await db.collection('users').updateOne({ _id: u._id }, { $addToSet: { friends: f._id } });
            await db.collection('users').updateOne({ _id: f._id }, { $addToSet: { friends: u._id } });
            links++;
        }
    }
    console.log(`  ${links} mutual connections`);

    // ---- groups ----
    console.log('\nGroups');
    const groupDocs = [];
    for (const [name, category, description] of GROUPS) {
        const found = await db.collection('groups').findOne({ name });
        if (found) { groupDocs.push(found); continue; }

        const owner = pick(users);
        const members = [{ user: owner._id, role: 'admin', joinedAt: pastDate(60) }];

        // A second admin on some groups, so §26's multi-admin support shows.
        for (const m of pickN(users.filter(u => !u._id.equals(owner._id)), 4 + Math.floor(rnd() * 7))) {
            members.push({ user: m._id, role: rnd() < 0.18 ? 'admin' : 'member', joinedAt: pastDate(50) });
        }

        const doc = {
            name, description, category,
            coverUrl: null,
            owner: owner._id,
            members,
            place: null,
            createdAt: pastDate(80)
        };
        const res = await db.collection('groups').insertOne(doc);
        groupDocs.push({ ...doc, _id: res.insertedId });
    }
    console.log(`  ${groupDocs.length} groups, ${groupDocs.reduce((n, g) => n + g.members.length, 0)} memberships`);

    // ---- posts ----
    console.log('\nPosts');
    const posts = [];
    let imageSeed = 1;

    for (const group of groupDocs) {
        const lines = CONTENT[group.name] || CONTENT.personal;
        const memberIds = group.members.map(m => m.user);

        for (const line of lines) {
            const roll = rnd();
            const type = roll < 0.32 ? 'image' : roll < 0.50 ? 'video' : 'text';
            posts.push({
                author: pick(memberIds),
                group: group._id,
                type,
                content: line,
                mediaUrl: type === 'image'
                    ? `https://picsum.photos/seed/sn${imageSeed++}/900/600`
                    : type === 'video'
                        ? 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
                        : null,
                tags: pickN(TAGS[group.name] || TAGS.personal, 1 + Math.floor(rnd() * 2)),
                place: null,
                likes: pickN(users, Math.floor(rnd() * 9)).map(u => u._id),
                sharedToSocial: false,
                createdAt: pastDate()
            });
        }
    }

    // Personal wall posts, so the feed is not entirely group content.
    for (const line of CONTENT.personal) {
        for (const author of pickN(users, 2)) {
            const roll = rnd();
            const type = roll < 0.28 ? 'image' : 'text';
            posts.push({
                author: author._id,
                group: null,
                type,
                content: line,
                mediaUrl: type === 'image' ? `https://picsum.photos/seed/sn${imageSeed++}/900/600` : null,
                tags: pickN(TAGS.personal, 1),
                place: null,
                likes: pickN(users, Math.floor(rnd() * 6)).map(u => u._id),
                sharedToSocial: false,
                createdAt: pastDate()
            });
        }
    }

    const inserted = await db.collection('posts').insertMany(posts);
    const byType = posts.reduce((acc, p) => ({ ...acc, [p.type]: (acc[p.type] || 0) + 1 }), {});
    console.log(`  ${posts.length} posts — ${byType.text || 0} text, ${byType.image || 0} image, ${byType.video || 0} video`);

    // ---- comments ----
    //
    // Roughly two thirds of posts get a reply, so the feed shows a mix of
    // discussed and quiet posts rather than a uniform count on every card.
    //
    // A comment is always dated after the post it belongs to, otherwise the
    // thread would read as a reply written before the thing it replies to.
    console.log('\nComments');
    const comments = [];

    posts.forEach((post, i) => {
        if (rnd() > 0.66) return;                       // this one stays quiet

        const groupName = groupDocs.find(g => String(g._id) === String(post.group));
        const pool = REPLIES[groupName ? groupName.name : 'personal'] || REPLIES.personal;

        // Commenters are drawn from everyone, including the author — people
        // do reply in their own threads.
        for (const author of pickN(users, 1 + Math.floor(rnd() * 3))) {
            const after = new Date(post.createdAt.getTime()
                + Math.floor(rnd() * 3 * 24 * 60 * 60 * 1000) + 60 * 1000);

            comments.push({
                post: inserted.insertedIds[i],
                author: author._id,
                content: pick(pool),
                likes: pickN(users, Math.floor(rnd() * 4)).map(u => u._id),
                createdAt: after > new Date() ? new Date() : after,
                updatedAt: null
            });
        }
    });

    if (comments.length) await db.collection('comments').insertMany(comments);
    const commented = new Set(comments.map(c => String(c.post))).size;
    console.log(`  ${comments.length} comments across ${commented} of ${posts.length} posts`);

    // ---- summary ----
    console.log('\n' + '─'.repeat(52));
    for (const c of ['users', 'groups', 'posts', 'comments']) {
        console.log(`  ${c.padEnd(8)} ${await db.collection(c).countDocuments()} total in database`);
    }
    console.log(`\n  Demo logins:  any username above  /  ${DEMO_PASSWORD}`);
    console.log(`  e.g.          maya_bar / ${DEMO_PASSWORD}\n`);

    process.exit(0);
}

main().catch(err => {
    console.error('\nSeed failed:', err.message, '\n');
    process.exit(1);
});
