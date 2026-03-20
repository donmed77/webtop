/**
 * Mobile Touch-to-Scroll Interceptor v4
 *
 * Gesture Map:
 *   Single-finger tap (<250ms)      → Left-click
 *   Single-finger swipe (>10px)     → Scroll
 *   Single-finger long-press+drag   → Text selection (mouse drag)
 *   Two-finger tap                  → Right-click (context menu)
 *   Two-finger scroll               → BLOCKED (single-finger scroll replaces it)
 *
 * Uses addEventListener override to wrap Selkies' touch handlers.
 * When _touchScrollActive is true, Selkies' handlers are skipped.
 */
(function() {
  var isMobile = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  if (!isMobile) return;
  console.log("[touch-scroll] v4: Touch device detected");

  window._touchScrollActive = false;

  // Override addEventListener to wrap ALL touch handlers
  var origAEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, options) {
    if (fn && (type === "touchstart" || type === "touchmove" || type === "touchend" || type === "touchcancel")) {
      var wrappedFn = function(e) {
        if (window._touchScrollActive) return;
        return fn.apply(this, arguments);
      };
      wrappedFn._origFn = fn;
      return origAEL.call(this, type, wrappedFn, options);
    }
    return origAEL.call(this, type, fn, options);
  };

  var mode = "idle";       // idle | pending | scroll | drag | twoFinger
  var startX = 0, startY = 0;
  var lastY = 0;
  var startTime = 0;
  var longPressTimer = null;
  var MOVE_THRESHOLD = 10;
  var LONG_PRESS_MS = 400;
  var TAP_MAX_MS = 250;
  var SCROLL_SENSITIVITY = 20;
  var dragMoved = false;
  var scrollAccum = 0;
  var twoFingerMoved = false;

  function getInput() { return window.webrtcInput; }

  function sendTap(x, y) {
    var wi = getInput();
    if (!wi) return;
    wi._calculateTouchCoordinates({ clientX: x, clientY: y });
    var sx = wi.x, sy = wi.y;
    var downMask = wi.buttonMask | 1;
    var upMask = wi.buttonMask & ~1;
    wi.send("m," + sx + "," + sy + "," + downMask + ",0");
    setTimeout(function() {
      wi.send("m," + sx + "," + sy + "," + upMask + ",0");
    }, 50);
  }

  function sendRightClick(x, y) {
    var wi = getInput();
    if (!wi) return;
    wi._calculateTouchCoordinates({ clientX: x, clientY: y });
    var sx = wi.x, sy = wi.y;
    var downMask = wi.buttonMask | 4;
    var upMask = wi.buttonMask & ~4;
    wi.send("m," + sx + "," + sy + "," + downMask + ",0");
    setTimeout(function() {
      wi.send("m," + sx + "," + sy + "," + upMask + ",0");
    }, 50);
  }

  function sendScroll(deltaY) {
    var wi = getInput();
    if (!wi || !wi._triggerMouseWheel) return;
    wi._triggerMouseWheel(deltaY > 0 ? "down" : "up", 1);
  }

  function onTouchStart(e) {
    if (!getInput()) { mode = "idle"; window._touchScrollActive = false; return; }

    // Two-finger touch: block Selkies, track for tap detection
    if (e.touches.length === 2) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      mode = "twoFinger";
      twoFingerMoved = false;
      // Use midpoint of two fingers for right-click position
      startX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      startY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      startTime = Date.now();
      window._touchScrollActive = true;
      e.preventDefault();
      return;
    }

    // 3+ fingers: block everything
    if (e.touches.length > 2) {
      mode = "idle";
      window._touchScrollActive = true;
      e.preventDefault();
      return;
    }

    // Single finger
    var t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    lastY = t.clientY;
    startTime = Date.now();
    mode = "pending";
    window._touchScrollActive = true;

    longPressTimer = setTimeout(function() {
      if (mode === "pending") {
        mode = "drag";
        dragMoved = false;
        window._touchScrollActive = true;
      }
    }, LONG_PRESS_MS);

    e.preventDefault();
  }

  function onTouchMove(e) {
    if (mode === "idle") return;

    // Two-finger move: track movement to distinguish tap from scroll attempt
    if (mode === "twoFinger") {
      if (e.touches.length >= 2) {
        var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (Math.abs(mx - startX) > MOVE_THRESHOLD || Math.abs(my - startY) > MOVE_THRESHOLD) {
          twoFingerMoved = true;
        }
      }
      e.preventDefault();
      return;
    }

    var t = e.touches[0];
    if (!t) return;

    // Drag mode: send mousemove with button held (text selection)
    if (mode === "drag") {
      var wi = getInput();
      if (wi) {
        if (!dragMoved) {
          dragMoved = true;
          wi._calculateTouchCoordinates({ clientX: startX, clientY: startY });
          wi.buttonMask |= 1;
          wi.send("m," + wi.x + "," + wi.y + "," + wi.buttonMask + ",0");
        }
        wi._calculateTouchCoordinates({ clientX: t.clientX, clientY: t.clientY });
        wi.send("m," + wi.x + "," + wi.y + "," + wi.buttonMask + ",0");
      }
      e.preventDefault();
      return;
    }

    var dy = t.clientY - startY;

    if (mode === "pending") {
      if (Math.abs(dy) > MOVE_THRESHOLD || Math.abs(t.clientX - startX) > MOVE_THRESHOLD) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        mode = "scroll";
        scrollAccum = 0;
        window._touchScrollActive = true;
        // Move cursor off-content to prevent hover effects
        var wi = getInput();
        if (wi) {
          var vid = document.querySelector("video") || document.getElementById("videoCanvas");
          if (vid) {
            var rect = vid.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var scale = wi.useCssScaling ? 1 : dpr;
            wi.x = Math.round(rect.width * scale);
            wi.y = Math.round(rect.height * scale);
          } else {
            wi.x = 32760; wi.y = 32760;
          }
          wi.send("m," + wi.x + "," + wi.y + "," + wi.buttonMask + ",0");
        }
      }
    }

    if (mode === "scroll") {
      scrollAccum += (lastY - t.clientY);
      lastY = t.clientY;
      while (Math.abs(scrollAccum) >= SCROLL_SENSITIVITY) {
        sendScroll(scrollAccum > 0 ? 1 : -1);
        scrollAccum -= (scrollAccum > 0 ? SCROLL_SENSITIVITY : -SCROLL_SENSITIVITY);
      }
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (mode === "idle") return;

    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    scrollAccum = 0;

    // Two-finger tap: right-click at midpoint
    if (mode === "twoFinger") {
      if (!twoFingerMoved && e.touches.length === 0) {
        sendRightClick(startX, startY);
      }
      // Reset to idle whether all fingers lifted or just one
      // If one finger remains, the next touchstart will begin a fresh gesture
      mode = "idle";
      window._touchScrollActive = false;
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Drag mode: release mouse button
    if (mode === "drag") {
      var wi = getInput();
      if (wi && dragMoved) {
        wi.buttonMask &= ~1;
        wi.send("m," + wi.x + "," + wi.y + "," + wi.buttonMask + ",0");
      }
    }

    // Single-finger tap
    if (mode === "pending") {
      var elapsed = Date.now() - startTime;
      if (elapsed < TAP_MAX_MS) {
        sendTap(startX, startY);
      }
    }

    mode = "idle";
    window._touchScrollActive = false;
    if (e.cancelable) e.preventDefault();
  }

  function onTouchCancel() {
    mode = "idle";
    window._touchScrollActive = false;
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  origAEL.call(window, "touchstart", onTouchStart, { capture: true, passive: false });
  origAEL.call(window, "touchmove", onTouchMove, { capture: true, passive: false });
  origAEL.call(window, "touchend", onTouchEnd, { capture: true, passive: false });
  origAEL.call(window, "touchcancel", onTouchCancel, { capture: true });

  console.log("[touch-scroll] v4 ready");
})();
