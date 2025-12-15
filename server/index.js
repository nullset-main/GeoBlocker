const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

const YT_API_KEY = process.env.YT_API_KEY;
if (!YT_API_KEY) {
  console.warn('Warning: YT_API_KEY not set. Proxy will not function without it.');
}

function proxyFetch(url) {
  return fetch(url).then(r => r.json());
}

app.get('/videos', async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) return res.status(400).json({ error: 'missing ids' });
    if (!YT_API_KEY) return res.status(500).json({ error: 'no-key' });
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(ids)}&key=${encodeURIComponent(YT_API_KEY)}`;
    const json = await proxyFetch(url);
    res.json(json);
  } catch (err) { console.error(err); res.status(500).json({ error: 'fetch-failed' }); }
});

app.get('/channels', async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) return res.status(400).json({ error: 'missing ids' });
    if (!YT_API_KEY) return res.status(500).json({ error: 'no-key' });
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(ids)}&key=${encodeURIComponent(YT_API_KEY)}`;
    const json = await proxyFetch(url);
    res.json(json);
  } catch (err) { console.error(err); res.status(500).json({ error: 'fetch-failed' }); }
});

app.get('/playlists', async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) return res.status(400).json({ error: 'missing ids' });
    if (!YT_API_KEY) return res.status(500).json({ error: 'no-key' });
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(ids)}&key=${encodeURIComponent(YT_API_KEY)}`;
    const json = await proxyFetch(url);
    res.json(json);
  } catch (err) { console.error(err); res.status(500).json({ error: 'fetch-failed' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GeoBlocker proxy listening on ${PORT}`));
