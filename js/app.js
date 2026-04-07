/* ── Main application ──────────────────────────────────────────────────────── */
 
// ── State ─────────────────────────────────────────────────────────────────────
let cameraStream      = null;
let currentFacingMode = 'environment';
let capturedDataUrl   = null;
let capturedThumb     = null;   // 400 px — displayed in history list
let capturedImage     = null;   // Full resolution — uploaded to Google Drive
 
// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
 
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
 
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
 
// ── Currency normalisation ────────────────────────────────────────────────────
const CURRENCY_CODES = [
  ['EUR', '€'], ['USD', '$'], ['GBP', '£'], ['CHF', 'Fr'],
  ['PLN', 'zł'], ['CZK', 'Kč'], ['HUF', 'Ft'], ['SEK', 'kr'],
  ['NOK', 'kr'], ['DKK', 'kr']
];
const CURRENCY_SYMS = ['€', '$', '£', 'Fr'];
 
function parseMoneyString(s) {
  s = s.trim().replace(/\s/g, '');
  const commas = (s.match(/,/g) || []).length;
  const dots   = (s.match(/\./g) || []).length;
  if (!commas && !dots) return parseFloat(s);
  if (commas === 1 && dots >= 1 && s.lastIndexOf(',') > s.lastIndexOf('.'))
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (commas === 1 && !dots) {
    const decimals = (s.split(',')[1] || '').length;
    return decimals <= 2 ? parseFloat(s.replace(',', '.')) : parseFloat(s.replace(',', ''));
  }
  if (dots === 1 && commas >= 1 && s.lastIndexOf('.') > s.lastIndexOf(','))
    return parseFloat(s.replace(/,/g, ''));
  if (dots === 1 && !commas) {
    const decimals = (s.split('.')[1] || '').length;
    return decimals <= 2 ? parseFloat(s) : parseFloat(s.replace('.', ''));
  }
  return parseFloat(s.replace(/,/g, ''));
}
 
function normalizeAmount(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  let symbol = null;
  for (const [code, sym] of CURRENCY_CODES) {
    if (new RegExp(`(^|[\\s\\d])${code}([\\s\\d]|$)`, 'i').test(s)) {
      symbol = sym;
      s = s.replace(new RegExp(code, 'gi'), '').trim();
      break;
    }
  }
  for (const sym of CURRENCY_SYMS) {
    if (s.includes(sym)) {
      if (!symbol) symbol = sym;
      s = s.replace(new RegExp('\\' + sym, 'g'), '').trim();
    }
  }
  symbol = symbol ?? '€';
  s = s.replace(/\s/g, '');
  const num = parseMoneyString(s);
  if (isNaN(num)) return raw;
  return `${symbol}${num.toFixed(2)}`;
}
 
// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
 
function showToast(message, type = 'info', duration = 3000) {
  const toast = $('toast');
  toast.textContent = message;
  toast.className   = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
 
// ── Navigation ────────────────────────────────────────────────────────────────
const SCREEN_TITLES = {
  camera: 'Scanner', review: 'Review & Save',
  history: 'History', settings: 'Settings'
};
 
function showScreen(name) {
  if (name !== 'camera') stopCamera();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $(`screen-${name}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.screen === name)
  );
  $('screen-title').textContent = SCREEN_TITLES[name] ?? 'Scanner';
  if (name === 'camera')  startCamera();
  if (name === 'history') loadHistory();
}
 
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen(btn.dataset.screen))
  );
  $('settings-btn').addEventListener('click', () => showScreen('settings'));
}
 
// ── Camera ────────────────────────────────────────────────────────────────────
function setupCamera() {
  $('capture-btn').addEventListener('click', capturePhoto);
  $('flip-btn').addEventListener('click', flipCamera);
  $('file-input').addEventListener('change', handleFileUpload);
  $('retake-btn').addEventListener('click', retakePhoto);
  $('analyze-btn').addEventListener('click', analyzeCurrentImage);
}
 
async function startCamera() {
  if (cameraStream) return;
  showCaptureMode();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    const video = $('camera-video');
    video.srcObject = cameraStream;
    $('camera-unavailable').style.display = 'none';
    video.style.display = 'block';
    $('scan-overlay').style.display = 'flex';
    $('capture-btn').style.display  = 'flex';
    $('flip-btn').style.display     = 'flex';
  } catch (_) {
    $('camera-video').style.display       = 'none';
    $('scan-overlay').style.display       = 'none';
    $('capture-btn').style.display        = 'none';
    $('flip-btn').style.display           = 'none';
    $('camera-unavailable').style.display = 'flex';
  }
}
 
function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  $('camera-video').srcObject = null;
}
 
async function flipCamera() {
  stopCamera();
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
}
 
function capturePhoto() {
  const video = $('camera-video');
  if (!video.videoWidth) { showToast('Camera not ready', 'warning'); return; }
  const canvas = $('camera-canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const overlay = $('scan-overlay');
  overlay.classList.add('flash');
  setTimeout(() => overlay.classList.remove('flash'), 200);
  capturedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  showPreview(capturedDataUrl);
}
 
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ({ target: { result } }) => { capturedDataUrl = result; showPreview(result); };
  reader.readAsDataURL(file);
  e.target.value = '';
}
 
function showPreview(dataUrl) {
  $('camera-video').style.display       = 'none';
  $('scan-overlay').style.display       = 'none';
  $('camera-unavailable').style.display = 'none';
  $('preview-container').style.display  = 'flex';
  $('preview-img').src                  = dataUrl;
  $('capture-controls').style.display   = 'none';
  $('analyze-controls').style.display   = 'flex';
}
 
function showCaptureMode() {
  $('preview-container').style.display  = 'none';
  $('preview-img').src                  = '';
  $('capture-controls').style.display   = 'flex';
  $('analyze-controls').style.display   = 'none';
  capturedDataUrl = null;
  capturedThumb   = null;
  capturedImage   = null;
}
 
function retakePhoto() {
  showCaptureMode();
  if (!cameraStream) startCamera();
  else { $('camera-video').style.display = 'block'; $('scan-overlay').style.display = 'flex'; }
}
 
// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyzeCurrentImage() {
  if (!capturedDataUrl) { showToast('No image captured', 'error'); return; }
  const apiKey = localStorage.getItem('apiKey') || '';
  if (!apiKey) { showToast('Add your API key in Settings first', 'error'); showScreen('settings'); return; }
  $('loading-overlay').style.display = 'flex';
  try {
    capturedThumb = await makeThumbnail(capturedDataUrl, 400);
    capturedImage = capturedDataUrl; // original full-resolution for Drive upload
    const result = await analyzeImage(capturedDataUrl, apiKey);
    $('loading-overlay').style.display = 'none';
    populateReview(result);
    showScreen('review');
  } catch (err) {
    $('loading-overlay').style.display = 'none';
    showToast(`Analysis failed: ${err.message}`, 'error', 5000);
  }
}
 
function makeThumbnail(dataUrl, maxPx) {
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
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}
 
// ── Review ────────────────────────────────────────────────────────────────────
function setupReview() {
  $('save-btn').addEventListener('click', saveItem);
  $('discard-btn').addEventListener('click', () => {
    showScreen('camera');
    showCaptureMode();
    if (!cameraStream) startCamera();
    else { $('camera-video').style.display = 'block'; $('scan-overlay').style.display = 'flex'; }
  });
}
 
function populateReview(data) {
  $('review-thumb').src   = capturedThumb || '';
  $('field-type').value   = data.type   || 'other';
  $('field-vendor').value = data.vendor || '';
  $('field-date').value   = data.date   || '';
  $('field-amount').value = normalizeAmount(data.amount || '');
  $('field-notes').value  = data.notes  || '';
}
 
async function saveItem() {
  const item = {
    type:   $('field-type').value,
    vendor: $('field-vendor').value.trim(),
    date:   $('field-date').value,
    amount: normalizeAmount($('field-amount').value.trim()),
    notes:  $('field-notes').value.trim(),
    thumb:  capturedThumb || null,
    image:  capturedImage || null   // full-resolution original, used for Drive upload
  };
  try {
    await DB.add(item);
    showToast('Saved!', 'success');
    showScreen('camera');
    showCaptureMode();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}
 
// ── History ───────────────────────────────────────────────────────────────────
const TYPE_ICONS = { receipt: '🛒', ticket: '🎫', other: '📄' };
 
function setupHistory() {
  $('export-btn').addEventListener('click', async () => {
    const items = await DB.getAll();
    if (!items.length) { showToast('Nothing to export', 'warning'); return; }
    exportXLSX(items);
  });
  $('upload-all-btn').addEventListener('click', uploadAllToDrive);
}
 
async function loadHistory() {
  try {
    const items = await DB.getAll();
    renderHistory(items);
  } catch (err) {
    showToast('Could not load history', 'error');
  }
}
 
function renderHistory(items) {
  const list = $('history-list');
  $('history-count').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
 
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗂️</div>
        <p>No items yet.</p>
        <p class="empty-hint">Scan a receipt or ticket to get started!</p>
      </div>`;
    return;
  }
 
  list.innerHTML = items.map(item => `
    <div class="history-card" data-id="${item.id}">
      <div class="history-thumb">
        ${item.thumb
          ? `<img src="${escHtml(item.thumb)}" alt="" loading="lazy">`
          : `<span class="thumb-placeholder">${TYPE_ICONS[item.type] ?? '📄'}</span>`}
      </div>
      <div class="history-info">
        <div class="history-badge">${TYPE_ICONS[item.type] ?? '📄'} ${escHtml(capitalize(item.type || 'other'))}</div>
        <div class="history-vendor">${escHtml(item.vendor || '—')}</div>
        <div class="history-meta">
          ${item.date   ? `<span>${escHtml(item.date)}</span>` : ''}
          ${item.amount ? `<span class="history-amount">${escHtml(normalizeAmount(item.amount))}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="drive-btn" data-id="${item.id}" aria-label="Upload to Google Drive" title="Upload to Drive">☁️</button>
        <button class="delete-btn" data-id="${item.id}" aria-label="Delete item">🗑</button>
      </div>
    </div>
  `).join('');
 
  list.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-actions')) return;
      const id   = parseInt(card.dataset.id, 10);
      const item = items.find(i => i.id === id);
      if (item) showItemDetail(item);
    });
  });
 
  list.querySelectorAll('.drive-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id   = parseInt(btn.dataset.id, 10);
      const item = items.find(i => i.id === id);
      if (item) uploadToDrive(item);
    });
  });
 
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this item?')) return;
      await DB.delete(parseInt(btn.dataset.id, 10));
      showToast('Deleted', 'success');
      loadHistory();
    });
  });
}
 
function showItemDetail(item) {
  const icon = TYPE_ICONS[item.type] ?? '📄';
  const el   = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${icon} ${escHtml(capitalize(item.type || 'other'))}</h2>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${item.thumb ? `<img src="${escHtml(item.thumb)}" alt="Scanned image" class="modal-img">` : ''}
        <dl class="detail-list">
          <dt>Vendor</dt> <dd>${escHtml(item.vendor || '—')}</dd>
          <dt>Date</dt>   <dd>${escHtml(item.date   || '—')}</dd>
          <dt>Amount</dt> <dd>${escHtml(normalizeAmount(item.amount || '')) || '—'}</dd>
          <dt>Notes</dt>  <dd>${escHtml(item.notes  || '—')}</dd>
          <dt>Saved</dt>  <dd>${new Date(item.savedAt).toLocaleString()}</dd>
        </dl>
      </div>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('.modal-close').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
}
 
// ── Excel export ──────────────────────────────────────────────────────────────
function exportXLSX(items) {
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS not loaded — check your connection', 'error');
    return;
  }
  const headers = ['Saved At', 'Type', 'Vendor', 'Date', 'Amount', 'Notes'];
  const rows = items.map(({ savedAt, type, vendor, date, amount, notes }) => [
    savedAt,
    capitalize(type || 'other'),
    vendor || '',
    date   || '',
    normalizeAmount(amount || ''),
    notes  || ''
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 24 }, { wch: 10 }, { wch: 26 },
    { wch: 12 }, { wch: 12 }, { wch: 44 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Receipts');
  XLSX.writeFile(wb, `scanner-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
 
// ── Google Drive upload ───────────────────────────────────────────────────────
let _driveToken  = null;
let _tokenExpiry = 0;
 
function requestGoogleToken(clientId) {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded — check your connection'));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: resp => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        _driveToken  = resp.access_token;
        _tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        resolve(resp.access_token);
      }
    });
    client.requestAccessToken({ prompt: '' });
  });
}
 
async function getValidDriveToken(clientId) {
  if (_driveToken && Date.now() < _tokenExpiry) return _driveToken;
  return requestGoogleToken(clientId);
}
 
// ── Drive low-level helpers ───────────────────────────────────────────────────

/** Convert a data-URL to a Blob. */
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mimeType    = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bytes = atob(b64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

/**
 * Return true if a file with this exact name already exists in Drive
 * (not trashed). Throws on network / auth errors.
 */
async function driveFileExists(filename, accessToken) {
  // Single quotes inside the filename must be escaped as \' for the Drive query
  const safe = filename.replace(/'/g, "\\'");
  const q    = `name='${safe}' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Drive search error ${resp.status}`);
  }
  const data = await resp.json();
  return data.files.length > 0;
}

/**
 * Upload a Blob to Drive using multipart/related.
 * Throws on failure so callers can decide how to handle errors.
 */
async function driveUpload(blob, filename, accessToken) {
  const boundary  = 'scanner_' + Math.random().toString(36).slice(2);
  const metaBlock = JSON.stringify({ name: filename, mimeType: 'image/jpeg' });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metaBlock,
    `\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ]);
  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Drive error ${resp.status}`);
  }
}

// ── Single-item upload ────────────────────────────────────────────────────────

async function uploadToDrive(item) {
  const clientId = localStorage.getItem('driveClientId');
  if (!clientId) {
    showToast('Set your Google Client ID in Settings first', 'error');
    showScreen('settings');
    return;
  }
  const imageDataUrl = item.image || item.thumb;
  if (!imageDataUrl) { showToast('No image stored for this item', 'error'); return; }

  showToast('Connecting to Google Drive…', 'info', 8000);
  let accessToken;
  try {
    accessToken = await getValidDriveToken(clientId);
  } catch (err) {
    showToast(`Google auth failed: ${err.message}`, 'error', 6000);
    return;
  }

  const filename = item.savedAt + '.jpg';
  try {
    await driveUpload(dataUrlToBlob(imageDataUrl), filename, accessToken);
    showToast(`Uploaded: ${filename}`, 'success', 5000);
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error', 6000);
  }
}

// ── Bulk upload ───────────────────────────────────────────────────────────────

async function uploadAllToDrive() {
  const clientId = localStorage.getItem('driveClientId');
  if (!clientId) {
    showToast('Set your Google Client ID in Settings first', 'error');
    showScreen('settings');
    return;
  }

  const allItems = await DB.getAll();
  const items    = allItems.filter(i => i.image || i.thumb);
  if (!items.length) { showToast('No items with images to upload', 'warning'); return; }

  // Disable button for the duration of the batch
  const btn = $('upload-all-btn');
  btn.disabled = true;

  showToast('Authenticating with Google Drive…', 'info', 10000);
  let accessToken;
  try {
    accessToken = await getValidDriveToken(clientId);
  } catch (err) {
    showToast(`Google auth failed: ${err.message}`, 'error', 6000);
    btn.disabled = false;
    return;
  }

  let uploaded = 0, skipped = 0, failed = 0;
  const total  = items.length;

  for (let i = 0; i < total; i++) {
    const item     = items[i];
    const filename = item.savedAt + '.jpg';

    showToast(`Uploading ${i + 1} of ${total}…`, 'info', 20000);

    try {
      const exists = await driveFileExists(filename, accessToken);
      if (exists) {
        skipped++;
        continue;
      }
      await driveUpload(dataUrlToBlob(item.image || item.thumb), filename, accessToken);
      uploaded++;
    } catch (err) {
      console.warn(`Drive upload failed for ${filename}:`, err.message);
      failed++;
    }
  }

  btn.disabled = false;

  // Build summary message
  const parts = [
    uploaded > 0 ? `Uploaded ${uploaded}`                      : null,
    skipped  > 0 ? `skipped ${skipped} already in Drive`       : null,
    failed   > 0 ? `${failed} failed`                          : null,
    (uploaded === 0 && skipped === 0 && failed === 0) ? 'Nothing to upload' : null
  ].filter(Boolean);

  const type = failed > 0 && uploaded === 0 ? 'error'
             : uploaded > 0                 ? 'success'
             :                                'info';
  showToast(parts.join(', '), type, 7000);
}
 
// ── Settings ──────────────────────────────────────────────────────────────────
function setupSettings() {
  $('save-key-btn').addEventListener('click', () => {
    const key = $('api-key-input').value.trim();
    if (!key) { showToast('Please enter an API key', 'error'); return; }
    localStorage.setItem('apiKey', key);
    $('api-key-input').value = '';
    updateKeyStatus();
    showToast('API key saved!', 'success');
  });
  $('clear-key-btn').addEventListener('click', () => {
    if (!confirm('Remove saved API key?')) return;
    localStorage.removeItem('apiKey');
    updateKeyStatus();
    showToast('API key removed', 'success');
  });
  $('save-drive-btn').addEventListener('click', () => {
    const id = $('drive-client-input').value.trim();
    if (!id) { showToast('Please enter a Client ID', 'error'); return; }
    localStorage.setItem('driveClientId', id);
    $('drive-client-input').value = '';
    _driveToken  = null;
    _tokenExpiry = 0;
    updateDriveStatus();
    showToast('Google Client ID saved!', 'success');
  });
  $('clear-drive-btn').addEventListener('click', () => {
    if (!confirm('Remove Google Drive Client ID?')) return;
    localStorage.removeItem('driveClientId');
    _driveToken  = null;
    _tokenExpiry = 0;
    updateDriveStatus();
    showToast('Drive Client ID removed', 'success');
  });
  $('clear-data-btn').addEventListener('click', async () => {
    if (!confirm('Delete ALL saved items? This cannot be undone.')) return;
    await DB.clear();
    showToast('All data cleared', 'success');
  });
}
 
function updateKeyStatus() {
  const hasKey = !!localStorage.getItem('apiKey');
  $('key-status').textContent      = hasKey ? '✓ API key is saved' : 'No API key set';
  $('key-status').className        = `key-status ${hasKey ? 'key-ok' : 'key-missing'}`;
  $('clear-key-btn').style.display = hasKey ? 'flex' : 'none';
}
 
function updateDriveStatus() {
  const hasId = !!localStorage.getItem('driveClientId');
  $('drive-status').textContent       = hasId ? '✓ Client ID is saved' : 'Drive not configured';
  $('drive-status').className         = `key-status ${hasId ? 'key-ok' : 'key-missing'}`;
  $('clear-drive-btn').style.display  = hasId ? 'flex' : 'none';
}
 
// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupCamera();
  setupReview();
  setupHistory();
  setupSettings();
  updateKeyStatus();
  updateDriveStatus();
  showScreen('camera');
});
