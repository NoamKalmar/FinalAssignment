const Place = require('../models/Place');
const weather = require('../services/weatherService');

/**
 * Places and the map — §33.iii.
 *
 *   "באחד מדפי המערכת תוצג מפה מבוססת Google Maps ובה מסומנות כתובות שנקראו
 *    מבסיס הנתונים וניתן יהיה לנהל את הכתובות הללו דרך האפליקציה
 *    (ולא רק דרך ה DB)."
 *
 * So two halves: markers drawn from the database, AND full management from
 * inside the app. Adding a place by clicking the map, editing it and
 * deleting it all happen here, never in Compass.
 */

function notFound() {
    const err = new Error('Place not found');
    err.status = 404;
    return err;
}

function isBadId(err) {
    return err.name === 'BSONError' || /24 hex|hex string/i.test(err.message);
}

function validate(body) {
    const errors = [];
    const name = (body.name || '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (name.length < 2 || name.length > 100) errors.push('Name must be 2–100 characters.');
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('Latitude must be between -90 and 90.');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push('Longitude must be between -180 and 180.');
    if ((body.address || '').length > 200) errors.push('Address is limited to 200 characters.');

    return errors;
}

// GET /places — the map page
const list = async (req, res, next) => {
    try {
        const places = await Place.findAllWithCreator();
        res.render('pages/places', {
            title: 'Places — SocialNet',
            places,
            mapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
            error: req.query.error || null
        });
    } catch (err) {
        next(err);
    }
};

// GET /places/api — the markers, as JSON for the map
const listJson = async (req, res, next) => {
    try {
        const places = await Place.findAllWithCreator();
        res.json({
            count: places.length,
            results: places.map(p => ({
                _id: p._id,
                name: p.name,
                category: p.category,
                address: p.address,
                lat: p.lat,
                lng: p.lng,
                createdBy: p.creator ? p.creator.username : null,
                // Only the creator gets edit and delete controls (§25).
                mine: String(p.createdBy) === String(req.session.user._id)
            }))
        });
    } catch (err) {
        next(err);
    }
};

// POST /places — created by clicking the map, or by searching for a city
const create = async (req, res, next) => {
    try {
        const errors = validate(req.body);
        if (errors.length) {
            return res.redirect('/places?error=' + encodeURIComponent(errors[0]));
        }

        await Place.create({
            name: req.body.name.trim(),
            category: (req.body.category || 'general').trim(),
            address: (req.body.address || '').trim(),
            lat: Number(req.body.lat),
            lng: Number(req.body.lng),
            createdBy: req.session.user._id
        });

        res.redirect('/places');
    } catch (err) {
        next(err);
    }
};

// POST /places/:id/edit — isOwner has already loaded it into req.doc
const update = async (req, res, next) => {
    try {
        const errors = validate(req.body);
        if (errors.length) {
            return res.redirect('/places?error=' + encodeURIComponent(errors[0]));
        }

        await Place.update(req.params.id, {
            name: req.body.name.trim(),
            category: (req.body.category || 'general').trim(),
            address: (req.body.address || '').trim(),
            lat: Number(req.body.lat),
            lng: Number(req.body.lng)
        });

        res.redirect('/places');
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

// POST /places/:id/delete
const remove = async (req, res, next) => {
    try {
        await Place.remove(req.params.id);
        res.redirect('/places');
    } catch (err) {
        next(isBadId(err) ? notFound() : err);
    }
};

/**
 * GET /places/api/geocode?q=Tel+Aviv
 *
 * Address text -> coordinates, so a place can be added by name rather than
 * only by clicking the map.
 *
 * Deliberately NOT Google's Geocoding API: we already have Open-Meteo's
 * geocoder from M8, it needs no key, and it keeps the Google key restricted
 * to the Maps JavaScript API alone.
 */
const geocode = async (req, res, next) => {
    try {
        const found = await weather.geocode(req.query.q || '');
        if (!found) return res.json({ found: false });
        res.json({ found: true, ...found });
    } catch (err) {
        // A geocoding failure is not fatal — the user can still click the map.
        res.json({ found: false });
    }
};

/**
 * GET /places/api/:id/weather
 *
 * Ties M7 to M8: the weather at a place's coordinates, fetched on demand
 * when its marker is opened rather than for every place on page load.
 */
const placeWeather = async (req, res, next) => {
    try {
        const place = await Place.findById(req.params.id);
        if (!place) return res.json({ ok: false });

        const w = await weather.byCoords(place.lat, place.lng, place.name);
        res.json(w ? { ok: true, weather: w } : { ok: false });
    } catch (err) {
        res.json({ ok: false });
    }
};

module.exports = { list, listJson, create, update, remove, geocode, placeWeather };
