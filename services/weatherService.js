/**
 * Web Service integration — §33.ii.
 *
 * The requirement is explicit that this must be a real service call made
 * from OUR code, processed by us, and displayed by us:
 *
 *   "יש 'לצרוך' את ה web service ממש, כלומר לשלוח אליו נתונים ולקבל נתונים
 *    בחזרה ולהציג את הנתונים. לא מספיק להטמיע iframe או קוד בסיסי מהתיעוד
 *    של האתר או משהו דומה."
 *
 * So: no iframe, no embedded widget. We call Open-Meteo from the server,
 * interpret the response, and render it ourselves.
 *
 * Open-Meteo was chosen because it needs no API key and no billing account,
 * which keeps us inside §15 (free tools only) and removes a credential that
 * could fail on defense day.
 *
 * Context (§33.ii asks for something relevant to the social network): users
 * have an address, places have coordinates, so posts and profiles can show
 * the weather where someone is.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// A slow third party must not hang our page. Without a timeout, a request
// that never answers holds the response open until the browser gives up.
const TIMEOUT_MS = 4000;

/**
 * WMO weather codes are integers; the API does not send text. Turning them
 * into something readable is our processing step, and the reason this is a
 * consumed service rather than an embedded widget.
 * https://open-meteo.com/en/docs — WMO Weather interpretation codes
 */
const WMO = {
    0: ['Clear sky', '☀'],
    1: ['Mainly clear', '🌤'],
    2: ['Partly cloudy', '⛅'],
    3: ['Overcast', '☁'],
    45: ['Fog', '🌫'],
    48: ['Rime fog', '🌫'],
    51: ['Light drizzle', '🌦'],
    53: ['Drizzle', '🌦'],
    55: ['Heavy drizzle', '🌦'],
    61: ['Light rain', '🌧'],
    63: ['Rain', '🌧'],
    65: ['Heavy rain', '🌧'],
    71: ['Light snow', '🌨'],
    73: ['Snow', '🌨'],
    75: ['Heavy snow', '❄'],
    80: ['Rain showers', '🌦'],
    81: ['Rain showers', '🌦'],
    82: ['Violent rain showers', '⛈'],
    95: ['Thunderstorm', '⛈'],
    96: ['Thunderstorm with hail', '⛈'],
    99: ['Thunderstorm with hail', '⛈']
};

function describe(code) {
    return WMO[code] || ['Unknown', '·'];
}

// Small in-memory cache. Weather does not change every second, and a page
// with several places would otherwise fire one request per place on every
// single view.
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

function cached(key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    cache.delete(key);
    return null;
}

async function getJson(url) {
    // AbortSignal.timeout gives up rather than waiting indefinitely.
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error('Weather service returned ' + res.status);
    return res.json();
}

/**
 * City name -> coordinates. Also Open-Meteo, also keyless.
 * Returns null when the place is unknown, rather than throwing, so a user
 * with a typo in their address just sees no weather card.
 */
async function geocode(city) {
    if (!city || !city.trim()) return null;
    const key = 'geo:' + city.trim().toLowerCase();
    const hit = cached(key);
    if (hit !== null) return hit;

    const url = `${GEOCODE_URL}?name=${encodeURIComponent(city.trim())}&count=1&language=en&format=json`;
    const data = await getJson(url);

    const first = data.results && data.results[0];
    const value = first
        ? { lat: first.latitude, lng: first.longitude, name: first.name, country: first.country_code }
        : null;

    cache.set(key, { at: Date.now(), value });
    return value;
}

/**
 * Coordinates -> current conditions.
 */
async function byCoords(lat, lng, label) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    const key = `wx:${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = cached(key);
    if (hit !== null) return { ...hit, place: label || hit.place };

    const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lng}`
        + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
        + `&timezone=auto`;

    const data = await getJson(url);
    const c = data.current;
    if (!c) return null;

    const [text, icon] = describe(c.weather_code);

    // Reshape the API's response into exactly what a view needs. This is the
    // "processing" half of §33.ii.
    const value = {
        place: label || null,
        temperature: Math.round(c.temperature_2m),
        feelsLike: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        wind: Math.round(c.wind_speed_10m),
        code: c.weather_code,
        description: text,
        icon,
        observedAt: c.time
    };

    cache.set(key, { at: Date.now(), value });
    return value;
}

/**
 * The convenience path: a city name straight to conditions.
 * Every failure returns null instead of throwing, because a weather widget
 * is decoration — an outage at Open-Meteo must never break a profile page
 * (§29).
 */
async function byCity(city) {
    try {
        const place = await geocode(city);
        if (!place) return null;
        return await byCoords(place.lat, place.lng, `${place.name}, ${place.country}`);
    } catch (err) {
        console.error('[weather]', err.message);
        return null;
    }
}

async function safeByCoords(lat, lng, label) {
    try {
        return await byCoords(lat, lng, label);
    } catch (err) {
        console.error('[weather]', err.message);
        return null;
    }
}

module.exports = { byCity, byCoords: safeByCoords, geocode, describe };
