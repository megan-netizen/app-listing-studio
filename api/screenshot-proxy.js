// api/screenshot-proxy.js
// Vercel serverless function — proxies Microlink screenshot requests server-side
// so the browser never calls Microlink directly (fixes CORS + Cloudflare block).

export default async function handler(req, res) {
  // Allow your Vercel app to call this
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

  // Rebuild the Microlink query params exactly as the original HTML did
  const scrollScript = scrollAndBack
    ? `(function(){var el=document.scrollingElement||document.body;el.scrollTop=800;setTimeout(function(){el.scrollTop=0;},800);})()`
    : null;

  const params = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    'viewport.width': '390',
    'viewport.height': '1200',
    'viewport.deviceScaleFactor': '2',
    waitFor: String(waitFor),
    javascript: 'true',
    adblock: 'true',
  });

  if (scrollScript) {
    params.append('scripts[]', scrollScript);
  }

  const microlinkUrl = `https://api.microlink.io/?${params.toString()}`;

  try {
    const response = await fetch(microlinkUrl, {
      headers: {
        // Server-side requests don't carry a browser origin,
        // so Cloudflare won't flag this as a scraping attempt
        'User-Agent': 'Tapcart-Screenshot-Generator/1.0',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[screenshot-proxy] Microlink error:', response.status, text);
      return res.status(502).json({
        ok: false,
        error: `Microlink returned ${response.status}`,
      });
    }

    const data = await response.json();

    // Microlink returns screenshot URL in data.data.screenshot.url
    const screenshotUrl = data?.data?.screenshot?.url;

    if (!screenshotUrl) {
      console.error('[screenshot-proxy] No screenshot in response:', JSON.stringify(data));
      return res.status(502).json({ ok: false, error: 'No screenshot returned' });
    }

    // Fetch the actual image and convert to base64 so the client
    // gets the same { ok, image } shape it already expects
    const imgResponse = await fetch(screenshotUrl);
    const arrayBuffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imgResponse.headers.get('content-type') || 'image/png';

    return res.status(200).json({
      ok: true,
      image: `data:${mimeType};base64,${base64}`,
    });
  } catch (err) {
    console.error('[screenshot-proxy] Fetch failed:', err?.message);
    return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
  }
}
