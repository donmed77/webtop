/**
 * Cloud Browser Toolbar — Injected into Selkies page at build time
 * Standalone vanilla JS — no React, no build tools
 */
(function () {
  'use strict';

  // --- Parse URL params ---
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('sessionId');
  var token = params.get('token');
  var isViewer = window.location.hash === '#shared';
  if (!sessionId) return; // Not a managed session, skip toolbar

  // --- State ---
  var state = {
    timeRemaining: 300,
    latency: null,
    audioMuted: true,
    streamReady: false,
    minimized: false,
    minPos: { right: 16, top: 16 },
    clipboardOpen: false,
    clipboardText: '',
    clipboardFlash: false,
    feedbackOpen: false,
    feedbackType: 'bug',
    feedbackMsg: '',
    feedbackEmail: '',
    feedbackFiles: [],
    feedbackError: '',
    feedbackEmailError: '',
    feedbackSending: false,
    uploadProgress: 0,
    mobileMenuOpen: false,
    screenshotMode: false,
    selStart: null,
    selEnd: null,
    recState: 'idle', // idle|recording|paused|ready
    recElapsed: 0,
    recSize: 0,
    recBlob: null,
    viewerCount: 0,
    reconnecting: false,
    reconnectCount: 30,
    isTouchDevice: false,
    kbdPos: { right: 40, bottom: 16 },
    hasShownPrivacyToast: false
  };

  var socket = null;
  var recTimer = null;
  var recStartTime = 0;
  var recPausedMs = 0;
  var pauseStart = 0;
  var mediaRecorder = null;
  var recStream = null;
  var recChunks = [];
  var latencyInterval = null;
  var reconnectTimer = null;
  var scrollInterval = null;
  var scrollCount = 0;
  var RECONNECT_MAX = 30;
  var SVG_CIRC = 2 * Math.PI * 36;
  var MAX_FILES = 3;
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

  // --- Helpers ---
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }
  function formatTime(s) {
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function formatSize(b) {
    if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function timerColor(t) {
    if (t <= 30) return 'cb-red';
    if (t <= 120) return 'cb-yellow';
    return '';
  }
  function latencyColor(ms) {
    if (ms === null) return 'cb-none';
    if (ms < 50) return 'cb-good';
    if (ms < 100) return 'cb-warn';
    return 'cb-bad';
  }

  // --- SVG Icons (inline) ---
  var icons = {
    chevronDown: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>',
    chevronUp: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronDownSmall: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    camera: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    speaker: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>',
    speakerMute: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>',
    speakerOn: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728"/>',
    clipboard: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
    chat: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
    share: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>',
    download: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>',
    pause: '<svg fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    play: '<svg fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>',
    stop: '<svg fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
    dots: '<svg fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    eye: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>',
    keyboard: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" stroke-width="1.5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
    x: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>',
    bug: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z"/></svg>',
    bulb: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>',
    image: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    link: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>',
    check: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    refresh: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>',
    lock: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
    video: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>'
  };

  function audioIcon(muted) {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>' + (muted ? icons.speakerMute : icons.speakerOn) + '</svg>';
  }


  // --- Toast system ---
  function showToast(iconSvg, iconColor, text, duration) {
    var t = el('div', 'cb-toast');
    t.innerHTML = '<div class="cb-toast-inner"><span style="color:' + iconColor + '">' + iconSvg + '</span><p>' + text + '</p></div>';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, duration || 3000);
  }

  // --- Clipboard sync: listen for remote clipboard updates ---
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'clipboardContentUpdate' && e.source === window) {
      state.clipboardText = e.data.text;
      state.clipboardFlash = true;
      render();
      setTimeout(function () { state.clipboardFlash = false; render(); }, 2000);
    }
  });

  function syncClipboardToRemote(text) {
    if (!text || !window.webrtcInput) return;
    try {
      var ci = window.webrtcInput._clipboardInstance || window.webrtcInput;
      if (ci && ci.send) ci.send(text);
    } catch (e) { }
  }

  // --- Audio toggle ---
  function toggleAudio() {
    try {
      var pipelineCtl = window.pipelineControl || (window.webrtcInput && window.webrtcInput._pipelineControl);
      if (pipelineCtl && pipelineCtl.getAudioEnabled) {
        var cur = pipelineCtl.getAudioEnabled();
        pipelineCtl.setAudioEnabled(!cur);
        state.audioMuted = cur;
      } else {
        // Fallback: try clicking the Selkies audio button
        var audioBtn = document.querySelector('button[aria-label*="audio"], button[title*="audio"], #audioBtn');
        if (audioBtn) audioBtn.click();
        state.audioMuted = !state.audioMuted;
      }
    } catch (e) {
      state.audioMuted = !state.audioMuted;
    }
    render();
  }

  // --- Screenshot ---
  function startScreenshot() {
    closeAllPanels();
    state.screenshotMode = true;
    state.selStart = null;
    state.selEnd = null;
    renderScreenshot();
  }

  function cancelScreenshot() {
    state.screenshotMode = false;
    state.selStart = null;
    state.selEnd = null;
    var ov = document.getElementById('cb-screenshot-ov');
    if (ov) ov.remove();
  }

  function renderScreenshot() {
    var existing = document.getElementById('cb-screenshot-ov');
    if (existing) existing.remove();
    if (!state.screenshotMode) return;

    var ov = el('div', 'cb-screenshot-overlay');
    ov.id = 'cb-screenshot-ov';

    // Dim
    var dim = el('div', 'cb-screenshot-dim');
    ov.appendChild(dim);

    // Hint bar
    var hint = el('div', 'cb-screenshot-hint');
    hint.innerHTML = icons.camera + '<span>Drag to select area</span><span class="cb-esc">ESC to cancel</span><button onclick="document.getElementById(\'cb-screenshot-ov\').remove()">✕ Cancel</button>';
    ov.appendChild(hint);

    var dragging = false;
    ov.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var rect = ov.getBoundingClientRect();
      state.selStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      state.selEnd = null;
      dragging = true;
    });
    ov.addEventListener('mousemove', function (e) {
      if (!dragging || !state.selStart) return;
      var rect = ov.getBoundingClientRect();
      state.selEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Update selection visual
      updateSelectionVisual(ov);
    });
    ov.addEventListener('mouseup', function () {
      dragging = false;
      captureScreenshot();
    });
    // Touch support
    ov.addEventListener('touchstart', function (e) {
      var t = e.touches[0], rect = ov.getBoundingClientRect();
      state.selStart = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      state.selEnd = null;
      dragging = true;
    }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      if (!dragging || !state.selStart) return;
      var t = e.touches[0], rect = ov.getBoundingClientRect();
      state.selEnd = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      updateSelectionVisual(ov);
    }, { passive: true });
    ov.addEventListener('touchend', function () { dragging = false; captureScreenshot(); });

    document.body.appendChild(ov);
  }

  function updateSelectionVisual(ov) {
    var old = ov.querySelector('.cb-screenshot-border');
    if (old) old.remove();
    var oldDim = ov.querySelector('.cb-screenshot-dim');
    if (!state.selStart || !state.selEnd) return;
    var x = Math.min(state.selStart.x, state.selEnd.x);
    var y = Math.min(state.selStart.y, state.selEnd.y);
    var w = Math.abs(state.selEnd.x - state.selStart.x);
    var h = Math.abs(state.selEnd.y - state.selStart.y);
    // Clip-path dim
    if (oldDim) oldDim.style.clipPath = 'polygon(0% 0%, 0% 100%, ' + x + 'px 100%, ' + x + 'px ' + y + 'px, ' + (x + w) + 'px ' + y + 'px, ' + (x + w) + 'px ' + (y + h) + 'px, ' + x + 'px ' + (y + h) + 'px, ' + x + 'px 100%, 100% 100%, 100% 0%)';
    var border = el('div', 'cb-screenshot-border');
    border.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px';
    ov.appendChild(border);
    if (w > 60 && h > 30) {
      var lbl = el('div', 'cb-screenshot-label');
      lbl.textContent = Math.round(w) + '×' + Math.round(h);
      lbl.style.cssText = 'left:' + (x + w / 2 - 20) + 'px;top:' + (y + h + 4) + 'px';
      ov.appendChild(lbl);
    }
  }

  function captureScreenshot() {
    if (!state.selStart || !state.selEnd) { cancelScreenshot(); return; }
    var canvas = document.getElementById('videoCanvas');
    if (!canvas) { cancelScreenshot(); return; }
    var x = Math.min(state.selStart.x, state.selEnd.x);
    var y = Math.min(state.selStart.y, state.selEnd.y);
    var w = Math.abs(state.selEnd.x - state.selStart.x);
    var h = Math.abs(state.selEnd.y - state.selStart.y);
    if (w < 10 || h < 10) { cancelScreenshot(); return; }
    var scaleX = canvas.width / window.innerWidth;
    var scaleY = canvas.height / window.innerHeight;
    var sx = Math.round(x * scaleX), sy = Math.round(y * scaleY);
    var sw = Math.round(w * scaleX), sh = Math.round(h * scaleY);
    var tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    var ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    tmp.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'screenshot-' + sessionId.slice(0, 8) + '-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
    cancelScreenshot();
  }

  // --- Recording ---
  function startRecording() {
    closeAllPanels();
    var canvas = document.getElementById('videoCanvas');
    if (!canvas) return;
    var mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'];
    var mimeType = mimeTypes.find(function (m) { return MediaRecorder.isTypeSupported(m); }) || 'video/webm';
    try {
      var stream = canvas.captureStream(60);
      recStream = stream;
      var recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 2500000 });
      recChunks = [];
      state.recSize = 0;
      recStartTime = Date.now();
      recPausedMs = 0;
      pauseStart = 0;
      recorder.ondataavailable = function (e) {
        if (e.data.size > 0) { recChunks.push(e.data); state.recSize += e.data.size; render(); }
      };
      recorder.onstop = function () {
        if (recStream) recStream.getTracks().forEach(function (t) { t.stop(); });
        recStream = null;
        var blob = new Blob(recChunks, { type: 'video/webm' });
        state.recBlob = blob;
        state.recSize = blob.size;
        state.recState = 'ready';
        if (recTimer) clearInterval(recTimer);
        render();
      };
      recorder.start(1000);
      mediaRecorder = recorder;
      state.recState = 'recording';
      state.recElapsed = 0;
      state.recBlob = null;
      recTimer = setInterval(function () { state.recElapsed++; render(); }, 1000);
      if (!state.hasShownPrivacyToast) {
        state.hasShownPrivacyToast = true;
        showToast(icons.lock, 'rgba(255,255,255,0.7)', window.innerWidth < 640 ? 'Saved locally only' : 'Recording is saved locally on your device only.', 4000);
      }
      render();
    } catch (e) { }
  }

  function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      if (recStream) recStream.getTracks().forEach(function (t) { t.enabled = false; });
      pauseStart = Date.now();
      state.recState = 'paused';
      if (recTimer) clearInterval(recTimer);
      render();
    }
  }

  function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      recPausedMs += Date.now() - pauseStart;
      if (recStream) recStream.getTracks().forEach(function (t) { t.enabled = true; });
      mediaRecorder.resume();
      state.recState = 'recording';
      recTimer = setInterval(function () { state.recElapsed++; render(); }, 1000);
      render();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      if (mediaRecorder.state === 'paused' && pauseStart > 0) recPausedMs += Date.now() - pauseStart;
      if (recStream) recStream.getTracks().forEach(function (t) { t.enabled = true; });
      mediaRecorder.stop();
    }
  }

  function downloadRecording() {
    if (!state.recBlob) return;
    var url = URL.createObjectURL(state.recBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'session-' + sessionId.slice(0, 8) + '-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.webm';
    a.click();
    URL.revokeObjectURL(url);
    state.recState = 'idle';
    state.recBlob = null;
    state.recElapsed = 0;
    state.recSize = 0;
    render();
  }


  // --- Feedback ---
  function submitFeedback() {
    if (!state.feedbackMsg.trim() || state.feedbackSending) return;
    if (state.feedbackEmail.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.feedbackEmail.trim())) {
        state.feedbackEmailError = 'Please enter a valid email address';
        render(); return;
      }
    }
    state.feedbackEmailError = '';
    state.feedbackSending = true;
    state.uploadProgress = 0;
    render();
    var fd = new FormData();
    fd.append('sessionId', sessionId);
    fd.append('type', state.feedbackType);
    fd.append('message', state.feedbackMsg.trim());
    if (state.feedbackEmail.trim()) fd.append('email', state.feedbackEmail.trim());
    state.feedbackFiles.forEach(function (f) { fd.append('files', f); });
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/feedback');
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) { state.uploadProgress = Math.round((e.loaded / e.total) * 100); render(); }
    };
    xhr.onload = function () {
      state.feedbackSending = false;
      state.uploadProgress = 0;
      if (xhr.status >= 200 && xhr.status < 300) {
        state.feedbackMsg = '';
        state.feedbackEmail = '';
        state.feedbackFiles = [];
        state.feedbackError = '';
        state.feedbackOpen = false;
        showToast(icons.check, '#4ade80', 'Thanks for your feedback!');
      } else {
        try { var d = JSON.parse(xhr.responseText); state.feedbackError = Array.isArray(d.message) ? d.message[0] : (d.message || 'Failed'); } catch (e) { state.feedbackError = 'Failed to send'; }
      }
      render();
    };
    xhr.onerror = function () { state.feedbackSending = false; state.uploadProgress = 0; state.feedbackError = 'Network error'; render(); };
    xhr.send(fd);
  }

  function handleFeedbackFiles(files) {
    state.feedbackError = '';
    var slots = MAX_FILES - state.feedbackFiles.length;
    if (slots <= 0) { state.feedbackError = 'Max ' + MAX_FILES + ' files'; setTimeout(function () { state.feedbackError = ''; render(); }, 3000); render(); return; }
    for (var i = 0; i < files.length && i < slots; i++) {
      var f = files[i];
      if (ALLOWED_TYPES.indexOf(f.type) === -1) { state.feedbackError = 'Unsupported format'; continue; }
      if (f.size > MAX_FILE_SIZE) { state.feedbackError = 'File too large (max 10MB)'; continue; }
      state.feedbackFiles.push(f);
    }
    render();
  }

  // --- Share ---
  function copyShareLink() {
    var url = window.location.origin + '/session/' + sessionId + '?viewer=true';
    navigator.clipboard.writeText(url).then(function () {
      showToast(icons.link, '#60a5fa', 'Viewer link copied to clipboard!');
    });
    closeAllPanels();
  }

  // --- End Session ---
  function endSession() {
    if (isViewer) return;
    stopRecording();
    fetch('/api/session/' + sessionId, { method: 'DELETE' }).catch(function () { });
    window.location.href = '/survey?sessionId=' + sessionId;
  }

  // --- Virtual keyboard (mobile) ---
  function toggleKeyboard() {
    var kbdInput = document.getElementById('keyboard-input-assist');
    if (!kbdInput) return;
    if (document.activeElement === kbdInput) {
      kbdInput.blur();
      kbdInput.setAttribute('aria-hidden', 'true');
    } else {
      kbdInput.removeAttribute('aria-hidden');
      kbdInput.value = '';
      kbdInput.focus();
    }
  }

  // --- Scroll helpers (mobile) ---
  function triggerScroll(dir) {
    var wi = window.webrtcInput;
    if (!wi || !wi._triggerMouseWheel) return;
    scrollCount = 0;
    wi._triggerMouseWheel(dir, 1);
    scrollInterval = setInterval(function () {
      scrollCount++;
      var mag = scrollCount > 10 ? 3 : scrollCount > 5 ? 2 : 1;
      wi._triggerMouseWheel(dir, mag);
    }, 60);
  }
  function stopScroll() {
    if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
  }

  // --- Close all panels ---
  function closeAllPanels() {
    state.clipboardOpen = false;
    state.feedbackOpen = false;
    state.mobileMenuOpen = false;
    render();
  }

  // --- Detect touch device ---
  state.isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1400) ||
    ('ontouchstart' in window && window.innerWidth < 1400);


  // =========================================================================
  // RENDER — Build and update toolbar DOM
  // =========================================================================
  var toolbarEl = null;
  var minimizedEl = null;
  var panelContainer = null;

  function render() {
    // Remove old
    if (toolbarEl) toolbarEl.remove();
    if (minimizedEl) minimizedEl.remove();
    if (panelContainer) panelContainer.remove();
    toolbarEl = null;
    minimizedEl = null;
    panelContainer = null;

    if (!state.streamReady) return;

    panelContainer = el('div');
    panelContainer.id = 'cb-panels';

    // --- Minimized state ---
    if (state.minimized) {
      minimizedEl = el('button', 'cb-minimized ' + timerColor(state.timeRemaining) + (state.timeRemaining <= 10 ? ' cb-flashing' : ''));
      minimizedEl.style.right = state.minPos.right + 'px';
      minimizedEl.style.top = state.minPos.top + 'px';
      minimizedEl.innerHTML = '<span class="cb-timer" style="font-size:14px;min-width:auto">' + formatTime(state.timeRemaining) + '</span>';
      if (state.recState === 'recording' || state.recState === 'paused') {
        minimizedEl.innerHTML += '<div class="cb-minimized-badge ' + (state.recState === 'recording' ? 'cb-rec' : 'cb-paused') + '"></div>';
      }
      if (state.viewerCount > 0) {
        minimizedEl.innerHTML += '<div class="cb-viewer-badge">' + state.viewerCount + '</div>';
      }
      // Drag + click
      var minDrag = false, minStart = null;
      minimizedEl.addEventListener('pointerdown', function (e) {
        minStart = { x: e.clientX, y: e.clientY, r: state.minPos.right, t: state.minPos.top };
        minimizedEl.setPointerCapture(e.pointerId);
        minDrag = false;
      });
      minimizedEl.addEventListener('pointermove', function (e) {
        if (!minStart) return;
        var dx = minStart.x - e.clientX, dy = e.clientY - minStart.y;
        if (!minDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) minDrag = true;
        if (minDrag) {
          state.minPos.right = Math.max(4, Math.min(window.innerWidth - 56, minStart.r + dx));
          state.minPos.top = Math.max(4, Math.min(window.innerHeight - 56, minStart.t + dy));
          minimizedEl.style.right = state.minPos.right + 'px';
          minimizedEl.style.top = state.minPos.top + 'px';
        }
      });
      minimizedEl.addEventListener('pointerup', function () {
        if (!minDrag) { state.minimized = false; render(); }
        minStart = null; minDrag = false;
      });
      document.body.appendChild(minimizedEl);
      renderMobileControls();
      return;
    }

    // --- Full toolbar ---
    toolbarEl = el('div', 'cb-toolbar');

    // Timer
    var timer = el('span', 'cb-timer ' + timerColor(state.timeRemaining) + (state.timeRemaining <= 10 ? ' cb-flashing' : ''));
    timer.textContent = formatTime(state.timeRemaining);
    toolbarEl.appendChild(timer);

    // Divider + Latency
    toolbarEl.appendChild(el('div', 'cb-divider'));
    var lat = el('span', 'cb-latency ' + latencyColor(state.latency));
    lat.textContent = state.latency !== null ? state.latency + 'ms' : '—ms';
    toolbarEl.appendChild(lat);

    if (isViewer) {
      // Viewer: just timer + latency + "Viewing" label + minimize
      toolbarEl.appendChild(el('div', 'cb-divider'));
      var vl = el('span', 'cb-viewer-label');
      vl.innerHTML = icons.eye + ' Viewing';
      toolbarEl.appendChild(vl);
      toolbarEl.appendChild(makeMinimizeBtn());
      document.body.appendChild(toolbarEl);
      renderMobileControls();
      return;
    }

    // Mobile audio toggle
    toolbarEl.appendChild(el('div', 'cb-divider cb-mobile-only'));
    var mAudio = el('button', 'cb-btn cb-mobile-only' + (state.audioMuted ? ' cb-btn-muted' : ''));
    mAudio.innerHTML = audioIcon(state.audioMuted);
    mAudio.style.cssText = 'width:28px;height:28px;justify-content:center;border-radius:50%';
    mAudio.onclick = toggleAudio;
    toolbarEl.appendChild(mAudio);

    toolbarEl.appendChild(el('div', 'cb-divider'));

    // Recording controls
    if (state.recState === 'idle') {
      var recBtn = el('button', 'cb-btn cb-desktop-only');
      recBtn.innerHTML = '<div class="cb-rec-dot-btn"></div><span class="cb-btn-label">Record</span>';
      recBtn.onclick = startRecording;
      toolbarEl.appendChild(recBtn);
    } else if (state.recState === 'recording' || state.recState === 'paused') {
      var recGroup = el('div', '');
      recGroup.style.cssText = 'display:flex;align-items:center;gap:8px';
      var prBtn = el('button', 'cb-btn');
      prBtn.innerHTML = state.recState === 'recording' ? icons.pause : icons.play;
      prBtn.onclick = state.recState === 'recording' ? pauseRecording : resumeRecording;
      recGroup.appendChild(prBtn);
      var recInfo = el('div', '');
      recInfo.style.cssText = 'display:flex;align-items:center;gap:6px';
      recInfo.innerHTML = '<div class="cb-rec-dot ' + (state.recState === 'recording' ? 'cb-active' : 'cb-paused') + '"></div>' +
        '<span class="cb-rec-time">' + formatTime(state.recElapsed) + '</span>' +
        '<span class="cb-rec-size cb-desktop-only" style="display:none">·</span>' +
        '<span class="cb-rec-size cb-desktop-only" style="display:none">' + formatSize(state.recSize) + '</span>';
      // Fix desktop-only visibility
      var sizeEls = recInfo.querySelectorAll('.cb-desktop-only');
      sizeEls.forEach(function (e) { e.style.display = ''; });
      recGroup.appendChild(recInfo);
      var stopBtn = el('button', 'cb-btn');
      stopBtn.style.color = '#f87171';
      stopBtn.innerHTML = icons.stop;
      stopBtn.onclick = stopRecording;
      recGroup.appendChild(stopBtn);
      toolbarEl.appendChild(recGroup);
    } else if (state.recState === 'ready') {
      var dlBtn = el('button', 'cb-btn cb-btn-download cb-desktop-only');
      dlBtn.innerHTML = icons.download + '<span class="cb-btn-label">Download (' + formatSize(state.recSize) + ')</span>';
      dlBtn.onclick = downloadRecording;
      toolbarEl.appendChild(dlBtn);
    }

    // === Desktop-only items ===
    var deskWrap = el('div', 'cb-desktop-only');
    deskWrap.style.cssText = 'display:none;align-items:center;gap:16px';
    // Fix styles via media query matching
    if (window.innerWidth >= 1024) deskWrap.style.display = 'flex';

    // Screenshot
    deskWrap.appendChild(el('div', 'cb-divider'));
    var ssBtn = el('button', 'cb-btn');
    ssBtn.innerHTML = icons.camera + '<span class="cb-btn-label">Screenshot</span>';
    ssBtn.onclick = startScreenshot;
    deskWrap.appendChild(ssBtn);

    // Audio
    deskWrap.appendChild(el('div', 'cb-divider'));
    var aBtn = el('button', 'cb-btn' + (state.audioMuted ? ' cb-btn-muted' : ''));
    aBtn.innerHTML = audioIcon(state.audioMuted) + '<span class="cb-btn-label">' + (state.audioMuted ? 'Unmute' : 'Mute') + '</span>';
    aBtn.onclick = toggleAudio;
    deskWrap.appendChild(aBtn);

    // Clipboard
    deskWrap.appendChild(el('div', 'cb-divider'));
    var cbBtn = el('button', 'cb-btn');
    cbBtn.style.position = 'relative';
    if (state.clipboardFlash) cbBtn.style.color = '#4ade80';
    else if (state.clipboardOpen) cbBtn.style.color = 'white';
    cbBtn.innerHTML = icons.clipboard + '<span class="cb-btn-label">Clipboard</span>';
    cbBtn.onclick = function () { state.clipboardOpen = !state.clipboardOpen; state.feedbackOpen = false; render(); };
    deskWrap.appendChild(cbBtn);

    // Feedback
    deskWrap.appendChild(el('div', 'cb-divider'));
    var fbBtnD = el('button', 'cb-btn');
    if (state.feedbackOpen) fbBtnD.style.color = 'white';
    fbBtnD.innerHTML = icons.chat + '<span class="cb-btn-label">Feedback</span>';
    fbBtnD.onclick = function () { state.feedbackOpen = !state.feedbackOpen; state.clipboardOpen = false; render(); };
    deskWrap.appendChild(fbBtnD);

    // Share
    deskWrap.appendChild(el('div', 'cb-divider'));
    var shBtn = el('button', 'cb-btn');
    shBtn.style.position = 'relative';
    shBtn.innerHTML = icons.share + '<span class="cb-btn-label" style="position:relative">Share' +
      (state.viewerCount > 0 ? '<span class="cb-share-badge">' + state.viewerCount + '</span>' : '') + '</span>';
    shBtn.onclick = copyShareLink;
    deskWrap.appendChild(shBtn);

    toolbarEl.appendChild(deskWrap);

    // === Mobile 3-dot menu ===
    var mobWrap = el('div', 'cb-mobile-only');
    mobWrap.style.position = 'relative';
    var dotsBtn = el('button', 'cb-btn-dots' + (state.mobileMenuOpen ? ' cb-active' : ''));
    dotsBtn.innerHTML = icons.dots;
    dotsBtn.onclick = function () { state.mobileMenuOpen = !state.mobileMenuOpen; state.clipboardOpen = false; state.feedbackOpen = false; render(); };
    mobWrap.appendChild(dotsBtn);
    toolbarEl.appendChild(mobWrap);

    toolbarEl.appendChild(el('div', 'cb-divider'));

    // End Session
    var endBtn = el('button', 'cb-btn-end');
    endBtn.innerHTML = window.innerWidth >= 1024 ? 'End Session' : 'End';
    endBtn.onclick = endSession;
    toolbarEl.appendChild(endBtn);

    // Minimize
    toolbarEl.appendChild(makeMinimizeBtn());

    document.body.appendChild(toolbarEl);

    // --- Render panels ---
    renderPanels();
    renderMobileControls();
  }

  function makeMinimizeBtn() {
    var btn = el('button', 'cb-btn-minimize');
    btn.innerHTML = icons.chevronDown;
    btn.onclick = function () { state.minimized = true; render(); };
    return btn;
  }


  // --- Render panels (clipboard, feedback, mobile menu) ---
  function renderPanels() {
    // Backdrop
    if (state.clipboardOpen || state.feedbackOpen || state.mobileMenuOpen) {
      var bd = el('div', 'cb-backdrop');
      bd.onclick = closeAllPanels;
      panelContainer.appendChild(bd);
    }

    // Position panels below toolbar
    var tbRect = toolbarEl ? toolbarEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    var panelTop = tbRect.top + tbRect.height + 12;

    // Clipboard panel
    if (state.clipboardOpen) {
      var cp = el('div', 'cb-panel');
      cp.style.cssText = 'left:50%;transform:translateX(-50%);top:' + panelTop + 'px';
      var hdr = el('div', 'cb-panel-header' + (state.clipboardFlash ? ' cb-flash-green' : ''));
      hdr.textContent = state.clipboardFlash ? '✓ Clipboard updated' : 'Remote Clipboard';
      cp.appendChild(hdr);
      var body = el('div', 'cb-panel-body');
      var ta = el('textarea', 'cb-input' + (state.clipboardFlash ? ' cb-flash-green' : ''));
      ta.rows = 4;
      ta.placeholder = 'Paste here to send to remote desktop...';
      ta.value = state.clipboardText;
      ta.oninput = function () { state.clipboardText = ta.value; };
      ta.onblur = function () { syncClipboardToRemote(state.clipboardText); };
      ta.onpaste = function (e) {
        var p = e.clipboardData.getData('text/plain');
        if (p) { e.preventDefault(); state.clipboardText = p; ta.value = p; syncClipboardToRemote(p); }
      };
      body.appendChild(ta);
      cp.appendChild(body);
      panelContainer.appendChild(cp);
    }

    // Feedback panel
    if (state.feedbackOpen) {
      var fp = el('div', 'cb-panel');
      fp.style.cssText = 'left:50%;transform:translateX(-50%);top:' + panelTop + 'px';
      fp.appendChild(el('div', 'cb-panel-header', 'Send Feedback'));
      var fbBody = el('div', 'cb-panel-body-padded');

      // Email
      var emailIn = el('input', 'cb-input' + (state.feedbackEmailError ? ' cb-error' : ''));
      emailIn.type = 'email';
      emailIn.placeholder = 'E-Mail (leave empty to comment anonymously)';
      emailIn.value = state.feedbackEmail;
      emailIn.oninput = function () { state.feedbackEmail = emailIn.value; state.feedbackEmailError = ''; };
      fbBody.appendChild(emailIn);
      if (state.feedbackEmailError) {
        fbBody.appendChild(el('p', 'cb-error-text', state.feedbackEmailError));
      }

      // Type pills
      var pills = el('div', '');
      pills.style.cssText = 'display:flex;gap:6px';
      ['bug', 'suggestion', 'other'].forEach(function (t) {
        var p = el('button', 'cb-pill' + (state.feedbackType === t ? (t === 'bug' ? ' cb-active-bug' : t === 'suggestion' ? ' cb-active-suggestion' : ' cb-active-other') : ''));
        p.innerHTML = (t === 'bug' ? icons.bug : t === 'suggestion' ? icons.bulb : icons.chat) +
          (t === 'bug' ? ' Bug' : t === 'suggestion' ? ' Suggestion' : ' Other');
        p.onclick = function () { state.feedbackType = t; render(); };
        pills.appendChild(p);
      });
      fbBody.appendChild(pills);

      // Message
      var msgWrap = el('div', '');
      var msgTa = el('textarea', 'cb-input' + (state.feedbackError ? ' cb-error' : ''));
      msgTa.rows = 4;
      msgTa.placeholder = 'Describe your feedback...';
      msgTa.value = state.feedbackMsg;
      msgTa.oninput = function () { state.feedbackMsg = msgTa.value.slice(0, 500); state.feedbackError = ''; msgTa.value = state.feedbackMsg; updateCharCount(); };
      msgWrap.appendChild(msgTa);
      var charRow = el('div', '');
      charRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:4px';
      var errSpan = el('span', 'cb-error-text', state.feedbackError);
      var countSpan = el('span', 'cb-char-count' + (state.feedbackMsg.length >= 500 ? ' cb-over' : state.feedbackMsg.length >= 450 ? ' cb-warn' : ''));
      countSpan.textContent = state.feedbackMsg.length + '/500';
      charRow.appendChild(errSpan);
      charRow.appendChild(countSpan);
      msgWrap.appendChild(charRow);
      fbBody.appendChild(msgWrap);
      function updateCharCount() {
        countSpan.textContent = state.feedbackMsg.length + '/500';
        countSpan.className = 'cb-char-count' + (state.feedbackMsg.length >= 500 ? ' cb-over' : state.feedbackMsg.length >= 450 ? ' cb-warn' : '');
      }

      // File upload
      var fileInput = el('input', '');
      fileInput.type = 'file';
      fileInput.accept = ALLOWED_TYPES.join(',');
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      fileInput.onchange = function () { handleFeedbackFiles(Array.from(fileInput.files)); fileInput.value = ''; };
      fbBody.appendChild(fileInput);

      if (state.feedbackFiles.length > 0) {
        var previews = el('div', 'cb-file-preview');
        state.feedbackFiles.forEach(function (f, i) {
          var thumb = el('div', 'cb-file-thumb');
          if (f.type.startsWith('image/')) {
            var img = el('img', '');
            img.src = URL.createObjectURL(f);
            thumb.appendChild(img);
          } else {
            thumb.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05)">' + icons.video + '</div>';
          }
          var rmBtn = el('button', 'cb-file-thumb-remove');
          rmBtn.innerHTML = icons.x;
          rmBtn.onclick = function () { state.feedbackFiles.splice(i, 1); render(); };
          thumb.appendChild(rmBtn);
          var sz = el('span', 'cb-file-size');
          sz.textContent = f.size >= 1048576 ? (f.size / 1048576).toFixed(1) + 'MB' : Math.round(f.size / 1024) + 'KB';
          thumb.appendChild(sz);
          previews.appendChild(thumb);
        });
        fbBody.appendChild(previews);
      }

      if (state.feedbackFiles.length < MAX_FILES) {
        var dz = el('div', 'cb-dropzone');
        dz.innerHTML = icons.image + '<span>Drop or click · ' + state.feedbackFiles.length + '/' + MAX_FILES + '</span>';
        dz.onclick = function () { fileInput.click(); };
        dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('cb-dragover'); };
        dz.ondragleave = function () { dz.classList.remove('cb-dragover'); };
        dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('cb-dragover'); handleFeedbackFiles(Array.from(e.dataTransfer.files)); };
        fbBody.appendChild(dz);
      }

      // Submit
      var sub = el('button', 'cb-submit' + (state.feedbackMsg.trim() ? ' cb-active' : ''));
      sub.disabled = !state.feedbackMsg.trim() || state.feedbackSending;
      if (state.feedbackSending && state.uploadProgress > 0) {
        sub.innerHTML = '<div class="cb-submit-progress" style="width:' + state.uploadProgress + '%"></div><span style="position:relative">' +
          (state.uploadProgress < 100 ? 'Uploading ' + state.uploadProgress + '%' : 'Sending...') + '</span>';
      } else {
        sub.textContent = state.feedbackSending ? 'Sending...' : 'Send Feedback';
      }
      sub.onclick = submitFeedback;
      fbBody.appendChild(sub);
      fp.appendChild(fbBody);
      panelContainer.appendChild(fp);
    }

    // Mobile menu
    if (state.mobileMenuOpen && window.innerWidth < 1024) {
      var mm = el('div', 'cb-mobile-menu');
      mm.style.cssText = 'left:50%;transform:translateX(-50%);top:' + panelTop + 'px';
      var items = [];
      if (state.recState === 'idle') items.push({ icon: '<div class="cb-rec-dot-btn" style="width:14px;height:14px"></div>', label: 'Record Session', fn: function () { startRecording(); closeAllPanels(); } });
      if (state.recState === 'ready') items.push({ icon: icons.download, label: 'Download (' + formatSize(state.recSize) + ')', fn: function () { downloadRecording(); closeAllPanels(); }, cls: 'color:#4ade80' });
      items.push({ icon: icons.camera, label: 'Screenshot', fn: function () { startScreenshot(); } });
      items.push({ icon: icons.clipboard, label: 'Clipboard', fn: function () { state.clipboardOpen = !state.clipboardOpen; state.feedbackOpen = false; state.mobileMenuOpen = false; render(); } });
      items.push({ icon: icons.chat, label: 'Feedback', fn: function () { state.feedbackOpen = !state.feedbackOpen; state.clipboardOpen = false; state.mobileMenuOpen = false; render(); } });
      items.push({ icon: icons.share, label: 'Share' + (state.viewerCount > 0 ? ' (' + state.viewerCount + ')' : ''), fn: function () { copyShareLink(); } });
      items.forEach(function (it) {
        var btn = el('button', 'cb-mobile-menu-item');
        if (it.cls) btn.style.cssText = it.cls;
        btn.innerHTML = it.icon + '<span>' + it.label + '</span>';
        btn.onclick = it.fn;
        mm.appendChild(btn);
      });
      panelContainer.appendChild(mm);
    }

    document.body.appendChild(panelContainer);
  }

  // --- Render mobile FAB controls ---
  function renderMobileControls() {
    var old = document.getElementById('cb-mobile-fab');
    if (old) old.remove();
    if (!state.isTouchDevice || !state.streamReady) return;

    var fab = el('div', 'cb-mobile-fab');
    fab.id = 'cb-mobile-fab';
    fab.style.right = state.kbdPos.right + 'px';
    fab.style.bottom = state.kbdPos.bottom + 'px';

    // Scroll up
    var upBtn = el('button', 'cb-fab-btn');
    upBtn.innerHTML = icons.chevronUp;
    upBtn.onpointerdown = function (e) { e.stopPropagation(); triggerScroll('up'); };
    upBtn.onpointerup = stopScroll;
    upBtn.onpointercancel = stopScroll;
    upBtn.onpointerleave = stopScroll;
    fab.appendChild(upBtn);

    // Keyboard
    var kbBtn = el('button', 'cb-fab-btn');
    kbBtn.innerHTML = icons.keyboard;
    kbBtn.onclick = toggleKeyboard;
    fab.appendChild(kbBtn);

    // Scroll down
    var dnBtn = el('button', 'cb-fab-btn');
    dnBtn.innerHTML = icons.chevronDownSmall;
    dnBtn.onpointerdown = function (e) { e.stopPropagation(); triggerScroll('down'); };
    dnBtn.onpointerup = stopScroll;
    dnBtn.onpointercancel = stopScroll;
    dnBtn.onpointerleave = stopScroll;
    fab.appendChild(dnBtn);

    // Drag
    var fabDrag = false, fabStart = null;
    fab.addEventListener('pointerdown', function (e) {
      fabStart = { x: e.clientX, y: e.clientY, r: state.kbdPos.right, b: state.kbdPos.bottom };
      fab.setPointerCapture(e.pointerId);
      fabDrag = false;
    });
    fab.addEventListener('pointermove', function (e) {
      if (!fabStart) return;
      var dx = fabStart.x - e.clientX, dy = fabStart.y - e.clientY;
      if (!fabDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) fabDrag = true;
      if (fabDrag) {
        state.kbdPos.right = Math.max(4, Math.min(window.innerWidth - 56, fabStart.r + dx));
        state.kbdPos.bottom = Math.max(4, Math.min(window.innerHeight - 140, fabStart.b + dy));
        fab.style.right = state.kbdPos.right + 'px';
        fab.style.bottom = state.kbdPos.bottom + 'px';
      }
    });
    fab.addEventListener('pointerup', function () { fabStart = null; fabDrag = false; });

    document.body.appendChild(fab);
  }


  // =========================================================================
  // SOCKET.IO CONNECTION + INITIALIZATION
  // =========================================================================

  // Load Socket.io client from CDN
  function loadSocketIO(cb) {
    if (window.io) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    s.onload = cb;
    s.onerror = function () {
      // Fallback: try loading from the app server
      var s2 = document.createElement('script');
      s2.src = '/socket.io/socket.io.js';
      s2.onload = cb;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  }

  function connectSocket() {
    loadSocketIO(function () {
      socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: 30,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 2000
      });

      socket.on('connect', function () {
        socket.emit('session:join', { sessionId: sessionId, viewer: isViewer });
        state.reconnecting = false;
        if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
        renderReconnect();
      });

      socket.on('session:joined', function (data) {
        state.timeRemaining = data.timeRemaining;
        render();
      });

      socket.on('session:timer', function (data) {
        state.timeRemaining = data.timeRemaining;
        render();
      });

      socket.on('session:ended', function () {
        stopRecording();
        if (isViewer) {
          window.location.href = '/session-ended?reason=expired&viewer=true';
        } else {
          window.location.href = '/survey?sessionId=' + sessionId + '&reason=expired';
        }
      });

      socket.on('session:viewer-count', function (data) {
        state.viewerCount = data.count;
        render();
      });

      socket.on('session:error', function (data) {
        if (data && data.viewerLimitReached) {
          window.location.href = '/session-ended?reason=viewer_limit';
        } else {
          window.location.href = '/session-ended?reason=not_found';
        }
      });

      socket.on('session:takeover', function () {
        stopRecording();
        socket.disconnect();
        // Redirect back to React session page for takeover UI
        window.location.href = '/session/' + sessionId + '?taken_over=true';
      });

      socket.on('disconnect', function (reason) {
        if (reason === 'io server disconnect') socket.connect();
        state.reconnecting = true;
        state.reconnectCount = RECONNECT_MAX;
        if (reconnectTimer) clearInterval(reconnectTimer);
        reconnectTimer = setInterval(function () {
          state.reconnectCount--;
          if (state.reconnectCount <= 0) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
            socket.disconnect();
            if (isViewer) {
              window.location.href = '/session-ended?reason=abandoned&viewer=true';
            } else {
              window.location.href = '/survey?sessionId=' + sessionId + '&reason=abandoned';
            }
            return;
          }
          renderReconnect();
        }, 1000);
        renderReconnect();
      });

      socket.on('reconnect', function () {
        state.reconnecting = false;
        if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
        renderReconnect();
        socket.emit('session:join', { sessionId: sessionId, viewer: isViewer });
      });
    });
  }

  // --- Reconnection overlay ---
  function renderReconnect() {
    var old = document.getElementById('cb-reconnect');
    if (old) old.remove();
    if (!state.reconnecting) return;
    var ov = el('div', 'cb-reconnect-overlay');
    ov.id = 'cb-reconnect';
    var frac = 1 - state.reconnectCount / RECONNECT_MAX;
    ov.innerHTML = '<div><div class="cb-reconnect-ring"><svg viewBox="0 0 80 80">' +
      '<circle cx="40" cy="40" r="36" fill="none" stroke="white" stroke-opacity="0.1" stroke-width="4"/>' +
      '<circle cx="40" cy="40" r="36" fill="none" stroke="#eab308" stroke-width="4" stroke-linecap="round" ' +
      'stroke-dasharray="' + SVG_CIRC + '" stroke-dashoffset="' + (SVG_CIRC * frac) + '" style="transition:stroke-dashoffset 1s linear"/>' +
      '</svg><span class="cb-reconnect-count">' + state.reconnectCount + '</span></div>' +
      '<div class="cb-reconnect-text"><p>Connection lost</p><p>Reconnecting...</p></div></div>';
    document.body.appendChild(ov);
  }

  // --- Stream detection ---
  function detectStream() {
    // Poll for videoCanvas
    var poll = setInterval(function () {
      var canvas = document.getElementById('videoCanvas');
      if (canvas && canvas.width > 0) {
        clearInterval(poll);
        // Delay slightly for smooth transition
        setTimeout(function () {
          state.streamReady = true;
          render();
        }, 1500);
      }
    }, 500);
    // Fallback: show toolbar after 5s regardless
    setTimeout(function () {
      if (!state.streamReady) { state.streamReady = true; render(); }
    }, 5000);
  }

  // --- Latency polling ---
  function startLatencyPolling() {
    latencyInterval = setInterval(function () {
      var ms = window.network_stats && window.network_stats.latency_ms;
      if (ms !== undefined && ms !== null) {
        var newLat = Math.round(ms);
        if (newLat !== state.latency) { state.latency = newLat; render(); }
      }
    }, 2000);
  }

  // --- ESC handler ---
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.screenshotMode) cancelScreenshot();
      if (state.clipboardOpen || state.feedbackOpen || state.mobileMenuOpen) closeAllPanels();
    }
  });

  // --- Hide Selkies native UI (sidebar, status bar, play button) ---
  // TEMPORARILY DISABLED for vanilla Selkies testing
  // var hideStyle = document.createElement('style');
  // hideStyle.textContent = '.sidebar, .toggle-button-sidebar, .dashboard-overlay-container, .status-bar, #playButton, .virtual-keyboard-button { display: none !important; }';
  // document.head.appendChild(hideStyle);

  // --- Init ---
  detectStream();
  startLatencyPolling();
  connectSocket();

})();
