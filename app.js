// Load environment variables FIRST — everything below reads process.env.
require('dotenv').config();

const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');

const { connectDB } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const indexRoutes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware order below is NOT arbitrary. Express runs each layer in the
// order it is registered, so a layer that prepares data must be registered
// before whatever consumes that data.
// ---------------------------------------------------------------------------

// 1. View engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Static files: /css/main.css resolves to public/css/main.css
app.use(express.static('public'));

// 3. Body parsing. MUST precede the routes — otherwise req.body is undefined
//    in every POST handler and every form silently breaks.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 4. Sessions. MUST precede the routes — otherwise req.session is undefined
//    and login cannot work.
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// 5. Expose the logged-in user to every view, so no controller has to pass it
//    manually. res.locals is merged into the data given to res.render().
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// 6. Application routes
app.use('/', indexRoutes);

// 7. 404. Reached only when no route above matched, so it must come after them.
app.use((req, res, next) => {
    const err = new Error('הדף המבוקש לא נמצא');
    err.status = 404;
    next(err);
});

// 8. Error handler. ALWAYS last, and must take exactly 4 parameters —
//    that signature is how Express recognises it as an error handler.
app.use(errorHandler);

// Start listening only after the database is up and the indexes exist.
const models = [
    require('./models/User'),
    require('./models/Group'),
    require('./models/Post'),
    require('./models/Place')
];

connectDB()
    .then(() => Promise.all(models.map(m => m.createIndexes())))
    .then(() => {
        console.log('Indexes ready ->', models.map(m => m.COLLECTION).join(', '));
        app.listen(PORT, () => {
            console.log(`Server running -> http://localhost:${PORT}`);
        });
    });
