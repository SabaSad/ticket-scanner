/* ── Google Gemini Vision API ────────────────────────────────────────────────── */

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
 * Send an image to Gemini 1.5 Flash and extract structured receipt / ticket fields.
 * @param {string} dataUrl   Full-resolution image data-URL
 * @param {string} apiKey    Google Gemini API key
 * @returns {Promise<{type, vendor, date, amount, notes}>}
 */
async function analyzeImage(dataUrl, apiKey) {
  const resized = await resizeForAPI(dataUrl);
  const base64  = resized.split(',')[1];

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64
            }
          },
          {
            text: `Analyze this image of a receipt, transport ticket, or document.
Respond with ONLY a valid JSON object — no markdown fences, no explanation, just the raw JSON:
{
  "type": "receipt" or "ticket" or "other",
  "vendor": "business, store, or transport operator name — empty string if unknown",
  "date": "YYYY-MM-DD — empty string if not found",
  "amount": "total amount in format SYMBOL+digits+dot+2decimals, e.g. €12.50 or €1250.00 or $45.99 — always dot as decimal separator, always exactly 2 decimal places, no spaces — empty string if not found",
  "notes": "one or two sentences describing what this document is"
}`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512
      }
    })
  });

  if (!resp.ok) {
    let msg = `Gemini API error ${resp.status}`;
    try {
      const e = await resp.json();
      msg = e.error?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract JSON even if the model wrapped it in markdown fences
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse Gemini response');

  try {
    return JSON.parse(match[0]);
  } catch (_) {
    throw new Error('Invalid JSON from Gemini');
  }
}
