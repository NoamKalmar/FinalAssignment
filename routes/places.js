const express = require('express');
const router = express.Router();

const { isAuth } = require('../middleware/isAuth');
const isOwner = require('../middleware/isOwner');
const Place = require('../models/Place');
const placeController = require('../controllers/placeController');

// Places are shared content, but managing them needs a session (§25).
router.use(isAuth);

router.get('/', placeController.list);

// JSON for the map. Static segments before '/:id' so they are not read as ids.
router.get('/api', placeController.listJson);
router.get('/api/geocode', placeController.geocode);
router.get('/api/:id/weather', placeController.placeWeather);

// Anyone logged in may add a place...
router.post('/', placeController.create);

// ...but only its creator may change or remove it (§25).
router.post('/:id/edit', isOwner(Place, 'createdBy'), placeController.update);
router.post('/:id/delete', isOwner(Place, 'createdBy'), placeController.remove);

module.exports = router;
