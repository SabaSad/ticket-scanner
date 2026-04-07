/* ── Main application ──────────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────────────────────
let cameraStream      = null;
let currentFacingMode = 'environment';
let capturedDataUrl   = null;   // Full-resolution image (sent to API)
let capturedThumb     = null;   // Resized thumbnail (stored in DB)

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
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
  camera:   'Scanner',
  review:   'Review & Save',
  history:  'History',
  settings: 'Settings'
};

function showScreen(name) {
  // Stop camera when leaving the camera screen
  if (name !== 'camera') stopCamera();

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $(`screen-${name}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });

  $('screen-title').textContent = SCREEN_TITLES[name] ?? 'Scanner';

  // Side-effects per screen
  if (name === 'camera')  { startCamera(); }
  if (name === 'history') { loadHistory(); }
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
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
  if (cameraStream) return; // already running

  // Reset to capture mode first
  showCaptureMode();

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: currentFacingMode,
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    const video = $('camera-video');
    video.srcObject = cameraStream;
    $('camera-unavailable').style.display = 'none';
    video.style.display = 'block';
    $('scan-overlay').style.display = 'flex';
    $('capture-btn').style.display = 'flex';
    $('flip-btn').style.display = 'flex';
  } catch (_) {
    $('camera-video').style.display = 'none';
    $('scan-overlay').style.display = 'none';
    $('capture-btn').style.display = 'none';
    $('flip-btn').style.display = 'none';
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

  // Brief white flash
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
  reader.onload = ({ target: { result } }) => {
    capturedDataUrl = result;
    showPreview(result);
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // allow re-selecting the same file
}

function showPreview(dataUrl) {
  $('camera-video').style.display   = 'none';
  $('scan-overlay').style.display   = 'none';
  $('camera-unavailable').style.display = 'none';

  const pc = $('preview-container');
  pc.style.display       = 'flex';
  $('preview-img').src   = dataUrl;

  $('capture-controls').style.display = 'none';
  $('analyze-controls').style.display = 'flex';
}

function showCaptureMode() {
  $('preview-container').style.display = 'none';
  $('preview-img').src                 = '';
  $('capture-controls').style.display  = 'flex';
  $('analyze-controls').style.display  = 'none';
  capturedDataUrl = null;
  capturedThumb   = null;
}

function retakePhoto() {
  showCaptureMode();
  if (!cameraStream) startCamera();
  else {
    $('camera-video').style.display = 'block';
    $('scan-overlay').style.display = 'flex';
  }
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyzeCurrentImage() {
  if (!capturedDataUrl) { showToast('No image captured', 'error'); return; }

  const apiKey = localStorage.getItem('apiKey') || '';
  if (!apiKey) {
    showToast('Add your API key in Settings first', 'error');
    showScreen('settings');
    return;
  }

  $('loading-overlay').style.display = 'flex';
  try {
    capturedThumb = await makeThumbnail(capturedDataUrl, 400);
    const result  = await analyzeImage(capturedDataUrl, apiKey);
    $('loading-overlay').style.display = 'none';
    populateReview(result);
    showScreen('review');
  } catch (err) {
    $('loading-overlay').style.display = 'none';
    showToast(`Analysis failed: ${err.message}`, 'error', 5000);
  }
}

function makeThumbnail(dataUrl, maxPx = 400) {
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
      resolve(c.toDataURL('image/jpeg', 0.7));
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
    else {
      $('camera-video').style.display = 'block';
      $('scan-overlay').style.display = 'flex';
    }
  });
}

function populateReview(data) {
  $('review-thumb').src   = capturedThumb || '';
  $('field-type').value   = data.type   || 'other';
  $('field-vendor').value = data.vendor || '';
  $('field-date').value   = data.date   || '';
  $('field-amount').value = data.amount || '';
  $('field-notes').value  = data.notes  || '';
}

async function saveItem() {
  const item = {
    type:   $('field-type').value,
    vendor: $('field-vendor').value.trim(),
    date:   $('field-date').value,
    amount: $('field-amount').value.trim(),
    notes:  $('field-notes').value.trim(),
    thumb:  capturedThumb || null
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
    exportCSV(items);
  });
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
  const list  = $('history-list');
  const count = $('history-count');

  count.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

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
          ${item.amount ? `<span class="history-amount">${escHtml(item.amount)}</span>` : ''}
        </div>
      </div>
      <button class="delete-btn" data-id="${item.id}" aria-label="Delete item">🗑</button>
    </div>
  `).join('');

  // Card tap → detail modal
  list.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.delete-btn')) return;
      const id   = parseInt(card.dataset.id, 10);
      const item = items.find(i => i.id === id);
      if (item) showItemDetail(item);
    });
  });

  // Delete buttons
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
          <dt>Vendor</dt>  <dd>${escHtml(item.vendor  || '—')}</dd>
          <dt>Date</dt>    <dd>${escHtml(item.date    || '—')}</dd>
          <dt>Amount</dt>  <dd>${escHtml(item.amount  || '—')}</dd>
          <dt>Notes</dt>   <dd>${escHtml(item.notes   || '—')}</dd>
          <dt>Saved</dt>   <dd>${new Date(item.savedAt).toLocaleString()}</dd>
        </dl>
      </div>
    </div>`;

  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('.modal-close').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
}

function exportCSV(items) {
  const headers = ['Saved At', 'Type', 'Vendor', 'Date', 'Amount', 'Notes'];
  const rows    = items.map(({ savedAt, type, vendor, date, amount, notes }) =>
    [savedAt, type, vendor, date, amount, notes]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `scanner-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

  $('clear-data-btn').addEventListener('click', async () => {
    if (!confirm('Delete ALL saved items? This cannot be undone.')) return;
    await DB.clear();
    showToast('All data cleared', 'success');
  });
}

function updateKeyStatus() {
  const hasKey = !!localStorage.getItem('apiKey');
  $('key-status').textContent    = hasKey ? '✓ API key is saved' : 'No API key set';
  $('key-status').className      = `key-status ${hasKey ? 'key-ok' : 'key-missing'}`;
  $('clear-key-btn').style.display = hasKey ? 'flex' : 'none';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupCamera();
  setupReview();
  setupHistory();
  setupSettings();
  updateKeyStatus();
  showScreen('camera');
});
