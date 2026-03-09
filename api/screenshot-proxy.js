// api/screenshot-proxy.js
// Vercel serverless function — proxies screenshot requests to your own
// Playwright service (local Docker or Cloud Run) instead of Microlink.

// Set this in Vercel Environment Variables, or use localhost for local testing
const SCREENSHOT_SERVICE_URL =
  process.env.SCREENSHOT_SERVICE_URL || 'http://localhost:3001';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { url, waitFor = 5000, scrollAndBack = false } = req.body;

  if (!url) {
    return res.status(400).json({ ok: false, error: 'Missing url' });
  }

  try {
    const response = await fetch(`${SCREENSHOT_SERVICE_URL}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        waitFor,
        scrollAndBack,
        viewportWidth: 390,
        viewportHeight: 1200,
        deviceScaleFactor: 2,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('[screenshot-proxy] Service error:', data.error);
      return res.status(502).json({
        ok: false,
        error: data.error || `Service returned ${response.status}`,
      });
    }

    return res.status(200).json({
      ok: true,
      image: data.image,
    });
  } catch (err) {
    console.error('[screenshot-proxy] Fetch failed:', err?.message);
    return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
  }
};
