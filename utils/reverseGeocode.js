const https = require('https');

// Simple in-memory cache: key => { name, timestamp }
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function cacheKey(lat, lon) {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function getCached(lat, lon) {
  const key = cacheKey(lat, lon);
  const entry = cache.get(key);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    return entry.name;
  }
  return null;
}

function setCache(lat, lon, name) {
  cache.set(cacheKey(lat, lon), { name, timestamp: Date.now() });
}

// Extract a human-friendly area name from Nominatim response
function extractName(json) {
  if (!json) return null;
  const { address } = json;
  if (!address) return json.display_name || null;
  // Preference order: suburb -> neighbourhood -> village -> town -> city -> state_district -> state -> country
  const fields = [
    'suburb','neighbourhood','quarter','hamlet','village','town','city','municipality','state_district','state','country'
  ];
  for (const f of fields) {
    if (address[f]) return address[f];
  }
  return json.display_name || null;
}

async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null;
  const cached = getCached(lat, lon);
  if (cached) return cached;

  const userAgent = process.env.GEOCODE_USER_AGENT || 'trip-metrics-pro/1.0';
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14`;

  const json = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': userAgent } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  }).catch(() => null);

  const name = extractName(json);
  if (name) setCache(lat, lon, name);
  return name;
}

module.exports = { reverseGeocode };
