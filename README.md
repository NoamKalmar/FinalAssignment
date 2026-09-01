# SocialNet

A social network built as the final project for the Web Application Development
course. Users register, post text, images and video, join groups, add friends,
comment, search, and see statistics drawn from the database.

## Stack

| | |
|---|---|
| Server | Node.js + Express 4 |
| Views | EJS |
| Database | MongoDB, accessed with the native `mongodb` driver |
| Architecture | MVC — `models/`, `views/`, `controllers/`, `routes/` |
| Client | Hand-written HTML/CSS, vanilla JavaScript, Ajax via `fetch` |
| Charts | D3.js v7, served locally |

Express is pinned to 4.x and body parsing uses `body-parser`, matching the
versions and APIs taught in the course. No Mongoose — collection shapes are
enforced by MongoDB itself through `$jsonSchema` validators.

## Running it

Requires Node.js 18 or newer and a MongoDB connection (Atlas or local).

```
git clone https://github.com/NoamKalmar/FinalAssignment.git
cd FinalAssignment
npm install
```

Copy `.env.example` to `.env` and fill in at least `MONGODB_URI`, `DB_NAME`
and `SESSION_SECRET`. The file documents every value. The Google Maps,
Facebook and Twitter keys are optional — leave them blank and those features
hide themselves rather than failing.

```
npm run seed      # demo users, groups and posts
npm start         # http://localhost:3000
```

`npm run dev` runs the same server under nodemon, which restarts on file
changes. Use `npm start` for a demo: a nodemon restart clears all sessions,
because sessions are held in memory.

### Demo accounts

Every seeded account uses the password `demo1234` — for example `maya_bar`,
`ori_cohen`, `noa_levi`. Seeded accounts are identified by their
`@demo.socialnet` email address, so `npm run seed:reset` can never delete a
real one.

## Troubleshooting

**Windows PowerShell: "running scripts is disabled on this system"**

PowerShell refuses to run `npm.ps1` under its default execution policy, so
`npm install`, `npm start` and `npm run dev` all fail with
`UnauthorizedAccess` before Node is ever reached. Any one of these fixes it:

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # permanent, no admin needed
npm.cmd start                                         # skips the .ps1 wrapper
node app.js                                           # what npm start runs anyway
```

Command Prompt and Git Bash are unaffected.

**`ENOENT: no such file or directory, open '...\package.json'`**

You are a directory above the project. `cd` into the repository folder first.

**MongoDB connection timeout**

Using Atlas, add your current IP under Network Access in the Atlas dashboard.
Using a local server, prefer `127.0.0.1` over `localhost` in `MONGODB_URI` —
on Windows `localhost` can resolve to IPv6 while MongoDB listens on IPv4.

## Layout

```
app.js              entry point: middleware order, then routes, then errors
config/db.js        one shared MongoClient for the whole process
models/             User, Post, Group, Place, Media, Comment, FriendRequest
controllers/        request handling and validation
routes/             URL to controller mapping
middleware/         isAuth, isOwner, isGroupAdmin, upload, errorHandler
services/           outbound API calls: weather, Facebook, Twitter
views/              EJS pages and partials
public/             CSS, client-side JavaScript, fonts
seed/seed.js        demo data
```

Every external API call is made by the server in `services/`, never from the
browser, and never through an embedded widget or iframe.
