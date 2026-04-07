/* ── Claude Vision API ─────────────────────────────────────────────────────── */

/**
 * Resize an image to a max dimension while preserving aspect ratio.
 * Returns a JPEG data-URL.
 */
function resizeForAPI(dataUrl, maxPx = 1920, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

/**
 * Send an image to Claude and extract structured receipt / ticket fields.
 * @param {string} dataUrl   Full-resolution image data-URL
 * @param {string} apiKey    Anthropic API key
 * @returns {Promise<{type, vendor, date, amount, notes}>}
 */
async function analyzeImage(dataUrl, apiKey) {
  const resized = await resizeForAPI(dataUrl);
  const base64  = resized.split(',')[1];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required header for direct browser-to-API calls
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
          },
          {
            type: 'text',
            text: `Analyze this image of a receipt, transport ticket, or document.
Respond with ONLY a valid JSON object — no markdown, no explanation, just the JSON:
{
  "type": "receipt" or "ticket" or "other",
  "vendor": "business, store, or transport operator name — empty string if unknown",
  "date": "YYYY-MM-DD — empty string if not found",
  "amount": "total with currency symbol, e.g. €12.50 or $45.00 — empty string if not found",
  "notes": "one or two sentences describing what this document is"
}`
          }
        ]
      }]
    })
  });

  if (!resp.ok) {
    let msg = `API error ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';

  // Extract JSON even if the model wrapped it in markdown fences
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse AI response');

  try {
    return JSON.parse(match[0]);
  } catch (_) {
    throw new Error('Invalid JSON from AI');
  }
}
