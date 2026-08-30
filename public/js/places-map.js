/**
 * Places map — §33.iii.
 *
 * Two halves the requirement asks for:
 *   1. markers drawn from addresses held in the database
 *   2. those addresses managed from inside the app, not only through the DB
 *
 * Adding is a click on the map, editing and deleting are on each row, and
 * every change goes through a normal form POST that the server validates.
 * Nothing here writes to MongoDB directly.
 *
 * initPlacesMap is called by the Maps script's ?callback= parameter, so it
 * has to be global — the API invokes it by name once it has loaded.
 */

var placesMap = (function () {
    'use strict';

    var map, infoWindow;
    var markers = [];
    var draftMarker = null;

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function data() {
        var el = document.getElementById('places-data');
        try { return JSON.parse(el.textContent || '[]'); } catch (e) { return []; }
    }

    // ── the form ───────────────────────────────────────────────────────────

    var wrap, form, title, submit;

    function openForm(mode, values) {
        wrap.hidden = false;
        title.textContent = mode === 'edit' ? 'Edit place' : 'Add a place';
        submit.textContent = mode === 'edit' ? 'Save changes' : 'Save place';
        form.action = mode === 'edit' ? '/places/' + values._id + '/edit' : '/places';

        document.getElementById('pl-name').value = values.name || '';
        document.getElementById('pl-category').value = values.category || '';
        document.getElementById('pl-address').value = values.address || '';
        document.getElementById('pl-lat').value = values.lat;
        document.getElementById('pl-lng').value = values.lng;

        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('pl-name').focus();
    }

    function closeForm() {
        wrap.hidden = true;
        if (draftMarker) { draftMarker.setMap(null); draftMarker = null; }
    }

    // ── markers ────────────────────────────────────────────────────────────

    function addMarker(place) {
        var marker = new google.maps.Marker({
            position: { lat: place.lat, lng: place.lng },
            map: map,
            title: place.name,
            animation: google.maps.Animation.DROP
        });

        marker.addListener('click', function () {
            // Weather is fetched only when a marker is opened, rather than
            // for every place on page load (ties M7 to M8).
            infoWindow.setContent(
                '<div class="iw">' +
                  '<strong>' + esc(place.name) + '</strong>' +
                  '<div class="iw-meta">' + esc(place.category) +
                    (place.address ? ' &middot; ' + esc(place.address) : '') + '</div>' +
                  '<div class="iw-meta">added by ' + esc(place.creator) + '</div>' +
                  '<div class="iw-wx" id="iw-wx">loading weather…</div>' +
                '</div>'
            );
            infoWindow.open(map, marker);

            fetch('/places/api/' + place._id + '/weather')
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var el = document.getElementById('iw-wx');
                    if (!el) return;
                    el.innerHTML = d.ok
                        ? d.weather.icon + ' ' + d.weather.temperature + '&deg;C, ' + esc(d.weather.description)
                        : 'weather unavailable';
                })
                .catch(function () {
                    var el = document.getElementById('iw-wx');
                    if (el) el.textContent = 'weather unavailable';
                });
        });

        markers.push(marker);
        return marker;
    }

    // ── init ───────────────────────────────────────────────────────────────

    function init() {
        var places = data();

        wrap = document.getElementById('place-form-wrap');
        form = document.getElementById('place-form');
        title = document.getElementById('form-title');
        submit = document.getElementById('form-submit');

        map = new google.maps.Map(document.getElementById('map'), {
            // Centre on the existing places when there are any, so the map
            // opens where the data is rather than at a fixed default.
            center: places.length
                ? { lat: places[0].lat, lng: places[0].lng }
                : { lat: 32.0853, lng: 34.7818 },
            zoom: places.length ? 11 : 8,
            mapTypeControl: false,
            streetViewControl: false,
            // Dark styling so the map does not glare against the rest of the UI.
            styles: [
                { elementType: 'geometry', stylers: [{ color: '#1b1f24' }] },
                { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1014' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#a8a8a8' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1b2d' }] },
                { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#262a2e' }] },
                { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
            ]
        });

        infoWindow = new google.maps.InfoWindow();

        places.forEach(addMarker);

        // Fit every marker in view when there is more than one.
        if (places.length > 1) {
            var bounds = new google.maps.LatLngBounds();
            places.forEach(function (p) { bounds.extend({ lat: p.lat, lng: p.lng }); });
            map.fitBounds(bounds, 60);
        }

        // ── click the map to add a place ──
        map.addListener('click', function (e) {
            var lat = e.latLng.lat();
            var lng = e.latLng.lng();

            if (draftMarker) draftMarker.setMap(null);
            draftMarker = new google.maps.Marker({
                position: { lat: lat, lng: lng },
                map: map,
                animation: google.maps.Animation.BOUNCE
            });

            openForm('new', { lat: lat.toFixed(6), lng: lng.toFixed(6) });
            document.getElementById('map-hint').textContent = 'Pin dropped — fill in the details below';
        });

        // ── edit buttons on the list ──
        document.querySelectorAll('[data-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openForm('edit', {
                    _id: btn.dataset.edit,
                    name: btn.dataset.name,
                    category: btn.dataset.category,
                    address: btn.dataset.address,
                    lat: btn.dataset.lat,
                    lng: btn.dataset.lng
                });
                map.panTo({ lat: Number(btn.dataset.lat), lng: Number(btn.dataset.lng) });
                map.setZoom(14);
            });
        });

        // ── clicking a row centres the map on it ──
        document.querySelectorAll('.place-row').forEach(function (row) {
            row.addEventListener('click', function (e) {
                if (e.target.closest('.place-tools')) return;   // ignore the buttons
                map.panTo({ lat: Number(row.dataset.lat), lng: Number(row.dataset.lng) });
                map.setZoom(14);
                document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        });

        document.getElementById('form-cancel').addEventListener('click', closeForm);

        // ── search by name ──
        // Uses our own /places/api/geocode, which is backed by Open-Meteo.
        // Google's Geocoding API would work too, but that would mean widening
        // the key beyond the Maps JavaScript API.
        function findPlace() {
            var q = document.getElementById('place-search').value.trim();
            if (!q) return;
            var hint = document.getElementById('map-hint');
            hint.textContent = 'searching…';

            fetch('/places/api/geocode?q=' + encodeURIComponent(q))
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (!d.found) { hint.textContent = 'No match for "' + q + '"'; return; }

                    map.panTo({ lat: d.lat, lng: d.lng });
                    map.setZoom(12);

                    if (draftMarker) draftMarker.setMap(null);
                    draftMarker = new google.maps.Marker({
                        position: { lat: d.lat, lng: d.lng },
                        map: map,
                        animation: google.maps.Animation.BOUNCE
                    });

                    openForm('new', {
                        name: d.name,
                        address: d.name + ', ' + d.country,
                        lat: d.lat.toFixed(6),
                        lng: d.lng.toFixed(6)
                    });
                    hint.textContent = 'Found ' + d.name + ' — check the details below';
                })
                .catch(function () { hint.textContent = 'Search failed'; });
        }

        document.getElementById('search-go').addEventListener('click', findPlace);
        document.getElementById('place-search').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); findPlace(); }
        });
    }

    return { init: init };
})();

// The Maps script calls this by name once it has finished loading.
function initPlacesMap() {
    placesMap.init();
}
