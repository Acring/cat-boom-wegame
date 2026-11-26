"use strict";
(() => {
  // src/platform.ts
  function createPlatform() {
    var _a;
    const isWechat = typeof wx !== "undefined" && typeof wx.createCanvas === "function";
    let canvas;
    let width;
    let height;
    let dpr;
    let topInset = 0;
    let bottomInset = 0;
    let isTouch = true;
    if (isWechat && wx) {
      canvas = wx.createCanvas();
      const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
      width = info.windowWidth;
      height = info.windowHeight;
      if (info.safeArea) {
        bottomInset = Math.max(0, Math.min(width > 0 ? height - info.safeArea.bottom : 0, 48));
      }
      dpr = Math.min(info.pixelRatio || 1, 2);
      if (typeof wx.getMenuButtonBoundingClientRect === "function") {
        try {
          const menu = wx.getMenuButtonBoundingClientRect();
          topInset = Math.max(0, Math.min(menu.bottom + 4, 96));
        } catch (e) {
          topInset = (info.statusBarHeight || 20) + 40;
        }
      } else {
        topInset = (info.statusBarHeight || 20) + 40;
      }
    } else {
      isTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 || typeof window !== "undefined" && "ontouchstart" in window;
      const existing = document.getElementById("game-canvas");
      canvas = existing || document.createElement("canvas");
      if (!existing) {
        document.body.appendChild(canvas);
      }
      if (window.innerWidth > 540) {
        height = Math.min(window.innerHeight - 24, 900);
        width = Math.round(height * (720 / 1220));
      } else {
        width = window.innerWidth;
        height = window.innerHeight;
        const probe = document.createElement("div");
        try {
          probe.style.cssText = "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)";
          document.body.appendChild(probe);
          const inset = parseFloat(window.getComputedStyle(probe).paddingBottom) || 0;
          bottomInset = Math.max(0, Math.min(inset, 48));
        } catch (e) {
          bottomInset = 0;
        } finally {
          (_a = probe.parentNode) == null ? void 0 : _a.removeChild(probe);
        }
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("\u65E0\u6CD5\u83B7\u53D6 Canvas 2D \u4E0A\u4E0B\u6587");
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const downListeners = [];
    const moveListeners = [];
    const upListeners = [];
    const hoverListeners = [];
    if (isWechat && wx) {
      let lastX = 0;
      let lastY = 0;
      wx.onTouchStart((e) => {
        const t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        lastX = t.clientX;
        lastY = t.clientY;
        for (const cb of downListeners) cb(lastX, lastY);
      });
      wx.onTouchMove((e) => {
        const t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        lastX = t.clientX;
        lastY = t.clientY;
        for (const cb of moveListeners) cb(lastX, lastY);
      });
      const emitUp = (e) => {
        const t = e.changedTouches[0] || e.touches[0];
        const x = t ? t.clientX : lastX;
        const y = t ? t.clientY : lastY;
        for (const cb of upListeners) cb(x, y);
      };
      wx.onTouchEnd(emitUp);
      if (wx.onTouchCancel) wx.onTouchCancel(emitUp);
    } else {
      let pointerActive = false;
      const toLocal = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (clientX - rect.left) / rect.width * width,
          y: (clientY - rect.top) / rect.height * height
        };
      };
      canvas.addEventListener("pointerdown", (e) => {
        var _a2;
        pointerActive = true;
        (_a2 = canvas.setPointerCapture) == null ? void 0 : _a2.call(canvas, e.pointerId);
        const pos = toLocal(e.clientX, e.clientY);
        for (const cb of downListeners) cb(pos.x, pos.y);
      });
      canvas.addEventListener("pointermove", (e) => {
        const pos = toLocal(e.clientX, e.clientY);
        if (pointerActive) {
          for (const cb of moveListeners) cb(pos.x, pos.y);
        } else {
          for (const cb of hoverListeners) cb(pos.x, pos.y);
        }
      });
      const endPointer = (e) => {
        if (!pointerActive) return;
        pointerActive = false;
        const pos = toLocal(e.clientX, e.clientY);
        for (const cb of upListeners) cb(pos.x, pos.y);
      };
      canvas.addEventListener("pointerup", endPointer);
      canvas.addEventListener("pointercancel", endPointer);
    }
    return {
      canvas,
      ctx,
      width,
      height,
      dpr,
      topInset,
      bottomInset,
      isTouch,
      isWechat,
      onPointerDown(cb) {
        downListeners.push(cb);
      },
      onPointerMove(cb) {
        moveListeners.push(cb);
      },
      onPointerUp(cb) {
        upListeners.push(cb);
      },
      onPointerHover(cb) {
        hoverListeners.push(cb);
      },
      vibrate(type = "light") {
        if (isWechat && wx && typeof wx.vibrateShort === "function") {
          try {
            wx.vibrateShort({ type });
          } catch (e) {
          }
        }
      },
      getStorage(key) {
        try {
          if (isWechat && wx && typeof wx.getStorageSync === "function") {
            const v = wx.getStorageSync(key);
            return typeof v === "string" && v.length > 0 ? v : null;
          }
          if (typeof window !== "undefined" && window.localStorage) {
            return window.localStorage.getItem(key);
          }
        } catch (e) {
        }
        return null;
      },
      setStorage(key, value) {
        try {
          if (isWechat && wx && typeof wx.setStorageSync === "function") {
            wx.setStorageSync(key, value);
            return;
          }
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(key, value);
          }
        } catch (e) {
        }
      }
    };
  }

  // src/assets.ts
  function loadImage(src) {
    const el = typeof wx !== "undefined" && typeof wx.createImage === "function" ? wx.createImage() : new Image();
    const entry = { el, ready: false };
    el.onload = () => {
      entry.ready = true;
    };
    el.src = src;
    return entry;
  }
  function loadGameAssets() {
    return {
      icons: {
        sound_on: loadImage("assets/ui/icon_sound_on.png"),
        sound_off: loadImage("assets/ui/icon_sound_off.png"),
        shield: loadImage("assets/ui/icon_shield.png"),
        blast: loadImage("assets/ui/icon_blast.png"),
        sparkle: loadImage("assets/ui/icon_sparkle.png"),
        gift: loadImage("assets/ui/icon_gift.png"),
        trophy: loadImage("assets/ui/icon_trophy.png"),
        paw: loadImage("assets/ui/icon_paw.png"),
        rice: loadImage("assets/ui/icon_rice.png"),
        target: loadImage("assets/ui/icon_target.png"),
        bolt: loadImage("assets/ui/icon_bolt.png"),
        crown: loadImage("assets/ui/icon_crown.png")
      },
      bg: loadImage("assets/bg_catroom.jpg"),
      avatarP1: loadImage("assets/ui/avatar_p1.png"),
      avatarP2: loadImage("assets/ui/avatar_p2.png"),
      cats: [0, 1, 2, 3, 4].map((color) => ({
        lv1: loadImage(`assets/cats/cat_${color}_lv1.png`),
        lv2: loadImage(`assets/cats/cat_${color}_lv2.png`),
        animLv1: loadImage(`assets/cats/anim_cat_${color}_lv1.png`),
        animLv2: loadImage(`assets/cats/anim_cat_${color}_lv2.png`)
      })),
      bosses: {
        orange: loadImage("assets/bosses/boss_orange.png"),
        cow: loadImage("assets/bosses/boss_cow.png"),
        hakimi: loadImage("assets/bosses/boss_hakimi.png")
      },
      relics: {
        blast: loadImage("assets/relics/relic_blast.png"),
        merge: loadImage("assets/relics/relic_merge.png"),
        collapse: loadImage("assets/relics/relic_collapse.png")
      }
    };
  }

  // src/audio.ts
  var SoundEngine = class {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }
    isMuted() {
      return this.muted;
    }
    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }
    /** 在用户首次交互时惰性初始化并恢复音频上下文 */
    unlock() {
      if (this.muted) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended" && typeof ctx.resume === "function") {
          void ctx.resume();
        }
      } catch (e) {
      }
    }
    ensureContext() {
      if (this.ctx) return this.ctx;
      try {
        if (typeof wx !== "undefined" && typeof wx.createWebAudioContext === "function") {
          this.ctx = wx.createWebAudioContext();
          return this.ctx;
        }
        if (typeof window !== "undefined") {
          const w = window;
          const Ctor = w.AudioContext || w.webkitAudioContext;
          if (Ctor) {
            this.ctx = new Ctor();
            return this.ctx;
          }
        }
      } catch (e) {
        this.ctx = null;
      }
      return null;
    }
    tone(type, freqStart, freqEnd, duration, volume, delay = 0) {
      if (this.muted) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended" && typeof ctx.resume === "function") {
          void ctx.resume();
        }
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(40, freqStart), now);
        if (freqEnd !== freqStart) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
        }
        gain.gain.setValueAtTime(1e-4, now);
        gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.015, duration * 0.25));
        gain.gain.exponentialRampToValueAtTime(1e-4, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      } catch (e) {
      }
    }
    /** 拎起小猫：软萌轻弹啵声 */
    playGrab() {
      this.tone("sine", 340, 560, 0.085, 0.11);
    }
    /** 确认交换落位：轻快碰击 */
    playSwap() {
      this.tone("triangle", 280, 420, 0.09, 0.1);
    }
    /** 非法交换反馈：低沉短促嘟声 */
    playInvalid() {
      this.tone("sine", 210, 150, 0.12, 0.09);
    }
    /** 合成大猫/炫彩猫：清亮上行铃音 */
    playMerge(level = 2) {
      if (level === 3) {
        this.tone("triangle", 523.25, 587.33, 0.12, 0.13, 0);
        this.tone("triangle", 659.25, 783.99, 0.14, 0.14, 0.07);
        this.tone("sine", 1046.5, 1174.66, 0.22, 0.14, 0.14);
      } else {
        this.tone("triangle", 493.88, 659.25, 0.11, 0.12, 0);
        this.tone("sine", 783.99, 880, 0.15, 0.11, 0.06);
      }
    }
    /** 逐波引爆：低频冲击 + 随波次爬升的爽感爆音 */
    playBlast(waveIndex) {
      const pitchBoost = Math.pow(1.16, Math.min(waveIndex, 5));
      this.tone("sawtooth", 165 * pitchBoost, 52, 0.22, 0.16, 0);
      this.tone("triangle", 440 * pitchBoost, 680 * pitchBoost, 0.14, 0.12, 0.02);
      if (waveIndex > 0) {
        this.tone("sine", 740 * pitchBoost, 987.77 * pitchBoost, 0.18, 0.11, 0.06);
      }
    }
    /** 第 2 轮及以上连锁提示音 */
    playCombo(roundNumber) {
      const base = 523.25 * Math.pow(1.12, Math.min(roundNumber - 2, 5));
      this.tone("sine", base, base * 1.25, 0.12, 0.12, 0);
      this.tone("triangle", base * 1.25, base * 1.5, 0.16, 0.11, 0.06);
    }
    /** 拆穿 Boss 意图 / 选卡确认 */
    playChime() {
      this.tone("triangle", 587.33, 783.99, 0.1, 0.11, 0);
      this.tone("sine", 880, 1046.5, 0.16, 0.11, 0.07);
    }
    /** 击败 Boss / 通关短旋律 */
    playVictory() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, idx) => {
        this.tone("triangle", f, f, 0.16, 0.13, idx * 0.085);
      });
    }
    /** 战败短旋律 */
    playDefeat() {
      const notes = [392, 349.23, 311.13, 261.63];
      notes.forEach((f, idx) => {
        this.tone("sine", f, f * 0.96, 0.18, 0.11, idx * 0.1);
      });
    }
  };

  // src/catRender.ts
  var CAT_PALETTE = ["#ffb870", "#96b2cc", "#524952", "#fffaf0", "#efe0c8"];
  var ANIM_FRAME_SIZE = 192;
  var ANIM_FRAME_COUNT = 10;
  var INK = "#4e342e";
  var FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';
  function pickCatAnimFrame(animState, elapsed, seedOffset = 0, grabElapsed = 0) {
    if (animState === "static") {
      return 0;
    }
    if (animState === "grabbed") {
      if (grabElapsed < 0.14) return 7;
      const step = Math.floor((grabElapsed - 0.14) / 0.105);
      const seq = [8, 9, 8, 9, 8, 9, 7, 9, 8, 9];
      return seq[step % seq.length];
    }
    if (animState === "hint") {
      const seq = [4, 5, 6, 5];
      const idx = Math.floor((elapsed * 4.2 + seedOffset * 0.3) % seq.length);
      return seq[idx];
    }
    const hash = Math.abs(Math.sin(seedOffset * 12.9898 + 78.233) * 43758.5453);
    const period = 3.6 + hash % 1.8;
    const phaseOffset = hash * 7.3 % period;
    const t = (elapsed + phaseOffset) % period;
    const cycleIndex = Math.floor((elapsed + phaseOffset) / period);
    if (t < 1.35) return 0;
    if (t < 2.25) return 1;
    if (t < 2.52) return 2;
    if (t < 3.05) return 0;
    if (cycleIndex % 2 === 0 && t < 3.55) return 3;
    return 0;
  }
  function drawFourPointStar(ctx, cx, cy, r, fill) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = fill;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : r * 0.42;
      const ang = i * Math.PI / 4;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function drawCatSprite(ctx, opts, assets) {
    const {
      x,
      y,
      colorId,
      level,
      scale = 1,
      rotation = 0,
      alpha = 1,
      elapsed = 0,
      showBadge = true,
      animState = "static",
      seedOffset = 0,
      grabElapsed = 0,
      flipX = false,
      forceFrame
    } = opts;
    const n = CAT_PALETTE.length;
    const idx = (colorId % n + n) % n;
    const isGrabbed = animState === "grabbed";
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (scale !== 1) ctx.scale(scale, scale);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    if (level === 2 && showBadge && !isGrabbed) {
      const pulse = 1 + Math.sin(elapsed * 4.5) * 0.035;
      ctx.save();
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = "#f5b82e";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawFourPointStar(ctx, -40, -34, 7.5, "#ffe169");
      drawFourPointStar(ctx, 41, -30, 6.5, "#ffe169");
      drawFourPointStar(ctx, -42, 26, 5.5, "#fff3b0");
      ctx.restore();
    }
    if (level === 3 && showBadge) {
      const pulse = 1 + Math.sin(elapsed * 6) * 0.05;
      const hueBase = elapsed * 140 % 360;
      ctx.save();
      ctx.scale(pulse, pulse);
      const glow = ctx.createRadialGradient(0, 0, 12, 0, 0, 56);
      glow.addColorStop(0, `hsla(${hueBase}, 95%, 78%, 0.62)`);
      glow.addColorStop(0.55, `hsla(${(hueBase + 110) % 360}, 92%, 72%, 0.34)`);
      glow.addColorStop(1, `hsla(${(hueBase + 220) % 360}, 92%, 70%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 56, 0, Math.PI * 2);
      ctx.fill();
      const segments = 12;
      const rot = elapsed * 1.9;
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      for (let s = 0; s < segments; s++) {
        const a0 = rot + s * Math.PI * 2 / segments;
        const a1 = a0 + Math.PI * 2 / segments - 0.12;
        ctx.strokeStyle = `hsl(${(hueBase + s * 30) % 360}, 92%, 62%)`;
        ctx.beginPath();
        ctx.arc(0, 0, 51, a0, a1);
        ctx.stroke();
      }
      for (let s = 0; s < 6; s++) {
        const ang = -elapsed * 1.3 + s * Math.PI * 2 / 6;
        const sx = Math.cos(ang) * 46;
        const sy = Math.sin(ang) * 46;
        const starR = 5.5 + s % 2 * 2.2;
        drawFourPointStar(ctx, sx, sy, starR, `hsl(${(hueBase + s * 60) % 360}, 96%, 72%)`);
      }
      ctx.restore();
    }
    const animSheet = assets ? level >= 2 ? assets.cats[idx].animLv2 : assets.cats[idx].animLv1 : void 0;
    const sprite = assets ? level >= 2 ? assets.cats[idx].lv2 : assets.cats[idx].lv1 : void 0;
    const size = level === 3 ? 110 : level === 2 ? 106 : 98;
    const drawYOffset = isGrabbed ? -6 : level >= 2 ? -3 : 0;
    if (animSheet && animSheet.ready) {
      const frame = forceFrame !== void 0 ? Math.max(0, Math.min(ANIM_FRAME_COUNT - 1, Math.floor(forceFrame))) : pickCatAnimFrame(animState, elapsed, seedOffset, grabElapsed);
      ctx.save();
      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(
        animSheet.el,
        frame * ANIM_FRAME_SIZE,
        0,
        ANIM_FRAME_SIZE,
        ANIM_FRAME_SIZE,
        -size / 2,
        -size / 2 + drawYOffset,
        size,
        size
      );
      ctx.restore();
      if (level === 3 && showBadge) {
        const hue = elapsed * 160 % 360;
        const sheen = ctx.createLinearGradient(-40, -40, 40, 40);
        sheen.addColorStop(0, `hsla(${hue}, 100%, 72%, 0.28)`);
        sheen.addColorStop(0.5, `hsla(${(hue + 120) % 360}, 100%, 76%, 0.22)`);
        sheen.addColorStop(1, `hsla(${(hue + 240) % 360}, 100%, 72%, 0.28)`);
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sprite && sprite.ready) {
      const fallbackSize = level === 3 ? 106 : level === 2 ? 102 : 94;
      ctx.drawImage(
        sprite.el,
        -fallbackSize / 2,
        -fallbackSize / 2 - (level >= 2 ? 3 : 0),
        fallbackSize,
        fallbackSize
      );
      if (level === 3 && showBadge) {
        const hue = elapsed * 160 % 360;
        const sheen = ctx.createLinearGradient(-40, -40, 40, 40);
        sheen.addColorStop(0, `hsla(${hue}, 100%, 72%, 0.28)`);
        sheen.addColorStop(0.5, `hsla(${(hue + 120) % 360}, 100%, 76%, 0.22)`);
        sheen.addColorStop(1, `hsla(${(hue + 240) % 360}, 100%, 72%, 0.28)`);
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const r = level === 3 ? 36 : level === 2 ? 34 : 30;
      if (level === 3) {
        const hue = elapsed * 140 % 360;
        const g = ctx.createLinearGradient(-r, -r, r, r);
        g.addColorStop(0, `hsl(${hue}, 92%, 72%)`);
        g.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 92%, 74%)`);
        g.addColorStop(1, `hsl(${(hue + 240) % 360}, 92%, 72%)`);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = CAT_PALETTE[idx];
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 2, r * 1.12, r * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(-10, -2, 3, 0, Math.PI * 2);
      ctx.arc(10, -2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (level === 2 && showBadge) {
      const bx = 33;
      const by = 32;
      ctx.fillStyle = "#ffd54f";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `900 19px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("2", bx, by + 1);
    }
    if (level === 3 && showBadge) {
      const bx = 33;
      const by = 32;
      const hue = elapsed * 180 % 360;
      const bg = ctx.createLinearGradient(bx - 16, by - 16, bx + 16, by + 16);
      bg.addColorStop(0, `hsl(${hue}, 95%, 66%)`);
      bg.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 95%, 68%)`);
      bg.addColorStop(1, `hsl(${(hue + 240) % 360}, 95%, 66%)`);
      ctx.fillStyle = bg;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 18px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2605", bx, by + 1);
    }
    ctx.restore();
  }

  // src/rng.ts
  var SeededRng = class {
    constructor(seed, savedState) {
      if (savedState !== void 0) {
        this.state = savedState >>> 0;
      } else {
        this.state = (Math.imul(seed | 0, 2654435761) ^ 2246822507) >>> 0;
      }
    }
    getState() {
      return this.state >>> 0;
    }
    nextFloat() {
      this.state = this.state + 1831565813 >>> 0;
      let t = Math.imul(this.state ^ this.state >>> 15, 1 | this.state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    /** 返回 [min, max] 闭区间内的整数 */
    randiRange(min, max) {
      if (max <= min) return min;
      return min + Math.floor(this.nextFloat() * (max - min + 1));
    }
  };

  // src/rules.ts
  var SIZE = 7;
  var CELL_COUNT = SIZE * SIZE;
  var COLORS = 5;
  var HP = 100;
  var AXES = [
    [0, 1],
    // 竖
    [1, 0],
    // 右下
    [1, -1]
    // 右上
  ];
  var HEX_DIRS = [
    [0, -1],
    // 0: 正上
    [1, -1],
    // 1: 右上
    [1, 0],
    // 2: 右下
    [0, 1],
    // 3: 正下
    [-1, 1],
    // 4: 左下
    [-1, 0]
    // 5: 左上
  ];
  var MAX_ROUNDS = 100;
  var SMALL_DAMAGE = 1;
  var BIG_DAMAGE = 3;
  var RAINBOW_DAMAGE = 5;
  var MAX_RADIUS = 4;
  var COMBO_STEP = 2;
  var MAX_COMBO_BONUS = 6;
  var WAVE_CHAIN_BONUS = 0;
  function cloneCat(cat) {
    return cat ? { id: cat.id, color: cat.color, level: cat.level } : null;
  }
  function cloneBoard(board) {
    return board.map(cloneCat);
  }
  function cloneState(state) {
    const copy = {
      seed: state.seed,
      rngState: state.rngState,
      nextId: state.nextId,
      board: cloneBoard(state.board),
      hp: [state.hp[0], state.hp[1]],
      player: state.player,
      turn: state.turn,
      winner: state.winner,
      ruleVersion: state.ruleVersion
    };
    if (state.maxHp) copy.maxHp = [state.maxHp[0], state.maxHp[1]];
    if (state.shield) copy.shield = [state.shield[0], state.shield[1]];
    if (state.fixture !== void 0) copy.fixture = state.fixture;
    if (state.suggested) copy.suggested = [state.suggested[0], state.suggested[1]];
    return copy;
  }
  function coord(i) {
    const c = Math.floor(i / SIZE);
    return [c, i % SIZE - Math.floor(c / 2)];
  }
  function index(q, r) {
    const row = r + Math.floor(q / 2);
    if (q < 0 || q >= SIZE || row < 0 || row >= SIZE) {
      return -1;
    }
    return q * SIZE + row;
  }
  function position(i) {
    const c = Math.floor(i / SIZE);
    return {
      x: c * 1.5,
      y: (i % SIZE + c % 2 * 0.5) * Math.sqrt(3)
    };
  }
  function before(a, b) {
    const pa = position(a);
    const pb = position(b);
    if (Math.abs(pa.y - pb.y) < 1e-6) {
      return pa.x < pb.x;
    }
    return pa.y < pb.y;
  }
  function neighbors(i) {
    const [q, r] = coord(i);
    const result = [];
    for (const [aq, ar] of AXES) {
      for (const sign of [-1, 1]) {
        const j = index(q + aq * sign, r + ar * sign);
        if (j >= 0) result.push(j);
      }
    }
    return result;
  }
  function matchesColor(cat, color) {
    return cat !== null && (cat.color === color || cat.level === 3);
  }
  function matches(board) {
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    for (let axisId = 0; axisId < AXES.length; axisId++) {
      const [aq, ar] = AXES[axisId];
      for (let color = 0; color < COLORS; color++) {
        for (let i = 0; i < board.length; i++) {
          if (!matchesColor(board[i], color)) continue;
          const [iq, ir] = coord(i);
          const prev = index(iq - aq, ir - ar);
          if (prev >= 0 && matchesColor(board[prev], color)) {
            continue;
          }
          const cells = [];
          let hasNormal = false;
          let j = i;
          while (j >= 0 && matchesColor(board[j], color)) {
            if (board[j].level !== 3) hasNormal = true;
            cells.push(j);
            const [jq, jr] = coord(j);
            j = index(jq + aq, jr + ar);
          }
          if (cells.length >= 3 && (hasNormal || color === 0)) {
            const key = `${axisId}:${cells.join(",")}`;
            if (!seen.has(key)) {
              seen.add(key);
              result.push({ axis: axisId, cells });
            }
          }
        }
      }
    }
    result.sort((a, b) => {
      if (a.axis !== b.axis) return a.axis - b.axis;
      return before(a.cells[0], b.cells[0]) ? -1 : 1;
    });
    return result;
  }
  function middle(cells) {
    if (cells.length % 2 === 1) {
      return cells[Math.floor(cells.length / 2)];
    }
    const a = cells[cells.length / 2 - 1];
    const b = cells[cells.length / 2];
    return before(a, b) ? a : b;
  }
  function groups(lines) {
    const output = [];
    for (let k = 0; k < lines.length; k++) {
      const connected = [];
      for (const g of output) {
        if (lines[k].cells.some((cell) => g.cells.includes(cell))) {
          connected.push(g);
        }
      }
      const group = {
        lines: [k],
        cells: [...lines[k].cells]
      };
      for (const g of connected) {
        group.lines.push(...g.lines);
        for (const cell of g.cells) {
          if (!group.cells.includes(cell)) {
            group.cells.push(cell);
          }
        }
        const idx = output.indexOf(g);
        if (idx >= 0) output.splice(idx, 1);
      }
      group.lines.sort((x, y) => x - y);
      output.push(group);
    }
    return output;
  }
  function newCat(state, color, level = 1) {
    const cat = { id: state.nextId, color, level };
    state.nextId += 1;
    return cat;
  }
  function generate(state, rng) {
    for (let attempt = 0; attempt < 500; attempt++) {
      state.board = new Array(CELL_COUNT).fill(null);
      for (let i = 0; i < CELL_COUNT; i++) {
        const colors = Array.from({ length: COLORS }, (_, k) => k);
        while (colors.length > 0) {
          const pick = rng.randiRange(0, colors.length - 1);
          state.board[i] = { id: 0, color: colors[pick], level: 1 };
          colors.splice(pick, 1);
          if (matches(state.board).length === 0) {
            break;
          }
        }
      }
      if (matches(state.board).length === 0 && findLegalSwaps(state).length > 0) {
        for (let i = 0; i < CELL_COUNT; i++) {
          state.board[i] = newCat(state, state.board[i].color, 1);
        }
        return;
      }
    }
    throw new Error("Could not generate a playable board");
  }
  function newGame(seedValue) {
    const rng = new SeededRng(seedValue);
    const state = {
      seed: seedValue,
      rngState: rng.getState(),
      nextId: 1,
      board: [],
      hp: [HP, HP],
      player: 0,
      turn: 1,
      winner: -1,
      ruleVersion: 3
    };
    generate(state, rng);
    state.rngState = rng.getState();
    return state;
  }
  function validSwap(state, a, b) {
    if (state.winner >= 0 || a < 0 || b < 0 || a >= CELL_COUNT || b >= CELL_COUNT || !neighbors(a).includes(b)) {
      return false;
    }
    if (!state.board[a] || !state.board[b]) {
      return false;
    }
    const board = [...state.board];
    const tmp = board[a];
    board[a] = board[b];
    board[b] = tmp;
    for (const line of matches(board)) {
      if (line.cells.includes(a) || line.cells.includes(b)) {
        return true;
      }
    }
    return false;
  }
  function findLegalSwaps(state) {
    const output = [];
    for (let a = 0; a < state.board.length; a++) {
      for (const b of neighbors(a)) {
        if (b > a && validSwap(state, a, b)) {
          output.push([a, b]);
        }
      }
    }
    return output;
  }
  function compactSegment(state, cells, li, owners, event) {
    const cats = [];
    for (const cell of cells) {
      if (state.board[cell]) {
        cats.push({ from: cell, cat: state.board[cell] });
      }
    }
    for (const cell of cells) {
      state.board[cell] = null;
      owners.delete(cell);
    }
    for (let k = 0; k < cats.length; k++) {
      state.board[cells[k]] = cats[k].cat;
      if (cats[k].from !== cells[k]) {
        event.moves.push({ from: cats[k].from, to: cells[k], id: cats[k].cat.id });
      }
    }
    for (let k = cats.length; k < cells.length; k++) {
      owners.set(cells[k], li);
    }
  }
  function castWideBeam(cell, dq, dr, radius) {
    const dirIdx = HEX_DIRS.findIndex(([x, y]) => x === dq && y === dr);
    const [lq, lr] = dirIdx >= 0 ? HEX_DIRS[(dirIdx + 5) % 6] : [0, 0];
    const [rq, rr] = dirIdx >= 0 ? HEX_DIRS[(dirIdx + 1) % 6] : [0, 0];
    const path = [cell];
    const covered = /* @__PURE__ */ new Set([cell, ...neighbors(cell)]);
    let [curQ, curR] = coord(cell);
    for (let step = 0; step < radius; step++) {
      const next = index(curQ + dq, curR + dr);
      if (next < 0) break;
      path.push(next);
      covered.add(next);
      if (dirIdx >= 0) {
        const left = index(curQ + lq, curR + lr);
        if (left >= 0) covered.add(left);
        const right = index(curQ + rq, curR + rr);
        if (right >= 0) covered.add(right);
      }
      curQ += dq;
      curR += dr;
    }
    return { path, cells: Array.from(covered) };
  }
  function roundStep(state, number, modifiers) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const original = cloneBoard(state.board);
    const lines = matches(original);
    const comboMul = (_a = modifiers == null ? void 0 : modifiers.comboStepMultiplier) != null ? _a : 1;
    const beamBonus = (_b = modifiers == null ? void 0 : modifiers.beamRadiusBonus) != null ? _b : 0;
    const maxRadius = MAX_RADIUS + beamBonus;
    const mergeMul = (_c = modifiers == null ? void 0 : modifiers.mergeDamageMultiplier) != null ? _c : 1;
    const chainBonus = (_d = modifiers == null ? void 0 : modifiers.waveChainBonus) != null ? _d : WAVE_CHAIN_BONUS;
    const curShield = state.shield ? [state.shield[0], state.shield[1]] : [0, 0];
    const event = {
      number,
      before: original,
      lines,
      centers: [],
      rays: [],
      waves: [],
      cleared: [],
      moves: [],
      spawn: [],
      baseDamage: 0,
      bonus: Math.min(COMBO_STEP * comboMul * (number - 1), MAX_COMBO_BONUS * comboMul),
      trueDamage: 0,
      shieldBlocked: 0,
      damage: 0,
      edgeHoles: [],
      afterClear: [],
      hp: [state.hp[0], state.hp[1]],
      shield: [curShield[0], curShield[1]],
      afterCollapse: [],
      deterministicMatches: [],
      after: [],
      refillMatches: []
    };
    const catDamage = (cat) => {
      if (!cat) return 0;
      if (cat.level === 3) return RAINBOW_DAMAGE;
      if (cat.level === 2) return BIG_DAMAGE;
      return SMALL_DAMAGE;
    };
    const blast = /* @__PURE__ */ new Set();
    const detonated = /* @__PURE__ */ new Set();
    const owners = /* @__PURE__ */ new Map();
    const targets = /* @__PURE__ */ new Map();
    const anchors = /* @__PURE__ */ new Set();
    const wave0Sources = /* @__PURE__ */ new Set();
    const wave0Affected = /* @__PURE__ */ new Set();
    const wave0Rays = [];
    let wave0HasRainbow = false;
    for (const group of groups(lines)) {
      const allLevel1 = group.cells.every((cell) => {
        var _a2;
        return ((_a2 = original[cell]) == null ? void 0 : _a2.level) === 1;
      });
      const allLevel2 = group.cells.every((cell) => {
        var _a2;
        return ((_a2 = original[cell]) == null ? void 0 : _a2.level) === 2;
      });
      const explosive = !allLevel1 && !allLevel2;
      if (explosive) {
        const rainbowFired = /* @__PURE__ */ new Set();
        for (const cell of group.cells) {
          wave0Affected.add(cell);
          const lv = (_f = (_e = original[cell]) == null ? void 0 : _e.level) != null ? _f : 1;
          if (lv >= 2) {
            wave0Sources.add(cell);
            detonated.add(cell);
          }
          if (lv === 3 && !rainbowFired.has(cell)) {
            rainbowFired.add(cell);
            wave0HasRainbow = true;
            for (const [dq, dr] of HEX_DIRS) {
              const beam = castWideBeam(cell, dq, dr, MAX_RADIUS);
              for (const hit of beam.cells) wave0Affected.add(hit);
              if (beam.path.length >= 2) {
                wave0Rays.push(beam.path);
                event.rays.push(beam.path);
              }
            }
          }
        }
        for (const li of group.lines) {
          const line = lines[li];
          const specials = line.cells.filter((cell) => {
            var _a2, _b2;
            return ((_b2 = (_a2 = original[cell]) == null ? void 0 : _a2.level) != null ? _b2 : 1) >= 2;
          });
          const radius = Math.min(specials.length + 1 + beamBonus, maxRadius);
          const [aq, ar] = AXES[line.axis];
          for (const cell of specials) {
            if (((_g = original[cell]) == null ? void 0 : _g.level) !== 2) continue;
            const at = line.cells.indexOf(cell);
            for (const direction of [-1, 1]) {
              if (direction === -1 && at === 0 || direction === 1 && at === line.cells.length - 1) {
                continue;
              }
              const beam = castWideBeam(cell, aq * direction, ar * direction, radius);
              for (const hit of beam.cells) {
                wave0Affected.add(hit);
              }
              wave0Rays.push(beam.path);
              event.rays.push(beam.path);
            }
          }
        }
      } else {
        const maxLineLen = Math.max(...group.lines.map((li) => lines[li].cells.length));
        if (allLevel1 && maxLineLen === 4) {
          const line4Idx = group.lines.find((li) => lines[li].cells.length === 4);
          const ordered = [...lines[line4Idx].cells];
          const c1 = ordered[1];
          const c2 = ordered[2];
          const centerSet = /* @__PURE__ */ new Set([c1, c2]);
          anchors.add(c1);
          anchors.add(c2);
          const extraMembers = group.cells.filter((c) => !ordered.includes(c));
          event.centers.push({
            cell: c1,
            members: [ordered[0], c1, ...extraMembers],
            survives: true,
            resultLevel: 2
          });
          event.centers.push({
            cell: c2,
            members: [c2, ordered[3]],
            survives: true,
            resultLevel: 2
          });
          for (const li of group.lines) {
            targets.set(li, lines[li].cells.includes(c1) ? c1 : middle(lines[li].cells));
            for (const cell of lines[li].cells) {
              if (!centerSet.has(cell) && !owners.has(cell)) {
                owners.set(cell, li);
              }
            }
          }
        } else {
          const resultLevel = allLevel2 || maxLineLen >= 5 ? 3 : 2;
          let center = middle(lines[group.lines[0]].cells);
          if (group.lines.length > 1) {
            const counts = /* @__PURE__ */ new Map();
            for (const li of group.lines) {
              for (const cell of lines[li].cells) {
                counts.set(cell, (counts.get(cell) || 0) + 1);
              }
            }
            const candidates = [...group.cells].sort((a, b) => {
              const ca = counts.get(a) || 0;
              const cb = counts.get(b) || 0;
              if (ca !== cb) return cb - ca;
              return before(a, b) ? -1 : 1;
            });
            center = candidates[0];
          }
          anchors.add(center);
          event.centers.push({
            cell: center,
            members: [...group.cells],
            survives: true,
            resultLevel
          });
          for (const li of group.lines) {
            targets.set(li, lines[li].cells.includes(center) ? center : middle(lines[li].cells));
            for (const cell of lines[li].cells) {
              if (cell !== center && !owners.has(cell)) {
                owners.set(cell, li);
              }
            }
          }
        }
      }
    }
    if (wave0Affected.size > 0) {
      const wave0Cells = [];
      let wave0Dmg = 0;
      for (const cell of wave0Affected) {
        if (!blast.has(cell)) {
          blast.add(cell);
          wave0Cells.push(cell);
          wave0Dmg += catDamage(original[cell]);
        }
      }
      event.waves.push({
        wave: 0,
        kind: wave0HasRainbow ? "rainbow" : "beam",
        sources: Array.from(wave0Sources).sort((a, b) => a - b),
        rays: wave0Rays,
        cells: wave0Cells,
        affected: Array.from(wave0Affected),
        damage: wave0Dmg
      });
      let frontier = wave0Cells;
      let waveIdx = 1;
      while (frontier.length > 0) {
        const nextSources = frontier.filter((cell) => {
          var _a2, _b2;
          return ((_b2 = (_a2 = original[cell]) == null ? void 0 : _a2.level) != null ? _b2 : 1) >= 2 && !detonated.has(cell);
        }).sort((a, b) => a - b);
        if (nextSources.length === 0) break;
        const waveAffected = /* @__PURE__ */ new Set();
        const waveRays = [];
        let waveHasRainbow = false;
        for (const src of nextSources) {
          detonated.add(src);
          waveAffected.add(src);
          if (((_h = original[src]) == null ? void 0 : _h.level) === 3) {
            waveHasRainbow = true;
            for (const [dq, dr] of HEX_DIRS) {
              const beam = castWideBeam(src, dq, dr, MAX_RADIUS);
              for (const hit of beam.cells) waveAffected.add(hit);
              if (beam.path.length >= 2) {
                waveRays.push(beam.path);
                event.rays.push(beam.path);
              }
            }
          } else {
            for (const nb of neighbors(src)) {
              waveAffected.add(nb);
            }
          }
        }
        const newCells = [];
        let waveDmg = chainBonus;
        for (const cell of waveAffected) {
          if (!blast.has(cell)) {
            blast.add(cell);
            newCells.push(cell);
            waveDmg += catDamage(original[cell]);
          }
        }
        event.waves.push({
          wave: waveIdx,
          kind: waveHasRainbow ? "rainbow" : "ring",
          sources: nextSources,
          rays: waveRays,
          cells: newCells,
          affected: Array.from(waveAffected),
          damage: waveDmg
        });
        frontier = newCells;
        waveIdx += 1;
      }
    }
    for (const cell of blast) {
      owners.delete(cell);
      anchors.delete(cell);
    }
    for (const cell of owners.keys()) {
      state.board[cell] = null;
      event.baseDamage += catDamage(original[cell]) * mergeMul;
      event.cleared.push(cell);
    }
    for (const cell of blast) {
      state.board[cell] = null;
      event.baseDamage += catDamage(original[cell]);
      event.cleared.push(cell);
    }
    for (const center of event.centers) {
      center.survives = anchors.has(center.cell);
      if (center.survives) {
        const orig = original[center.cell];
        state.board[center.cell] = { id: orig.id, color: orig.color, level: center.resultLevel };
      }
    }
    event.bonus += Math.max(0, event.waves.length - 1) * chainBonus;
    const dmgScale = (_i = modifiers == null ? void 0 : modifiers.damageMultiplier) != null ? _i : 1;
    const normalDamage = Math.max(0, Math.round((event.baseDamage + event.bonus) * dmgScale));
    const trueDamage = ((_j = modifiers == null ? void 0 : modifiers.aftershockPerWave) != null ? _j : 0) * event.waves.length;
    event.trueDamage = trueDamage;
    event.damage = normalDamage + trueDamage;
    const defender = 1 - state.player;
    const applyDamage = (norm, tr) => {
      let rem = norm;
      if (curShield[defender] > 0 && rem > 0) {
        const absorbed = Math.min(curShield[defender], rem);
        curShield[defender] -= absorbed;
        rem -= absorbed;
        event.shieldBlocked += absorbed;
      }
      state.hp[defender] = Math.max(0, state.hp[defender] - rem - tr);
      if (state.shield) {
        state.shield[defender] = curShield[defender];
      }
      event.hp = [state.hp[0], state.hp[1]];
      event.shield = [curShield[0], curShield[1]];
    };
    applyDamage(normalDamage, trueDamage);
    event.afterClear = cloneBoard(state.board);
    if (state.hp[defender] === 0) {
      state.winner = state.player;
      event.afterCollapse = cloneBoard(state.board);
      event.after = cloneBoard(state.board);
      event.deterministicMatches = [];
      event.refillMatches = [];
      return event;
    }
    for (let li = 0; li < lines.length; li++) {
      if (!targets.has(li)) continue;
      const target = targets.get(li);
      const [tq, tr] = coord(target);
      const [aq, ar] = AXES[lines[li].axis];
      for (const sign of [-1, 1]) {
        let segment = [];
        const startDistance = sign === -1 || anchors.has(target) ? 1 : 0;
        let distance = startDistance;
        while (true) {
          const cell = index(tq + aq * sign * distance, tr + ar * sign * distance);
          if (cell < 0) {
            compactSegment(state, segment, li, owners, event);
            break;
          }
          const isForeignHole = state.board[cell] === null && owners.get(cell) !== li;
          if (anchors.has(cell) || isForeignHole) {
            compactSegment(state, segment, li, owners, event);
            segment = [];
          } else {
            segment.push(cell);
          }
          distance += 1;
        }
      }
    }
    const collapsePerMove = (_k = modifiers == null ? void 0 : modifiers.collapseMoveDamage) != null ? _k : 0;
    if (collapsePerMove > 0 && event.moves.length > 0) {
      const collapseDmg = Math.round(collapsePerMove * event.moves.length * dmgScale);
      if (collapseDmg > 0) {
        event.bonus += collapseDmg;
        event.damage += collapseDmg;
        applyDamage(collapseDmg, 0);
        if (state.hp[defender] === 0) {
          state.winner = state.player;
        }
      }
    }
    event.edgeHoles = Array.from(owners.keys());
    event.afterCollapse = cloneBoard(state.board);
    event.deterministicMatches = matches(state.board);
    return event;
  }
  function refillColors(board, cell) {
    const [cq, cr] = coord(cell);
    const colors = [];
    for (let color = 0; color < COLORS; color++) {
      let createsMatch = false;
      for (const [aq, ar] of AXES) {
        let length = 1;
        for (const direction of [-1, 1]) {
          let cursor = index(cq + aq * direction, cr + ar * direction);
          while (cursor >= 0 && matchesColor(board[cursor], color)) {
            length += 1;
            const [xq, xr] = coord(cursor);
            cursor = index(xq + aq * direction, xr + ar * direction);
          }
        }
        if (length >= 3) {
          createsMatch = true;
          break;
        }
      }
      if (!createsMatch) {
        colors.push(color);
      }
    }
    return colors;
  }
  function refill(state, rng, event) {
    const edgeSet = new Set(event.edgeHoles);
    for (let cell = 0; cell < state.board.length; cell++) {
      if (state.board[cell] === null) {
        const colors = refillColors(state.board, cell);
        if (colors.length === 0) continue;
        const picked = colors[rng.randiRange(0, colors.length - 1)];
        const cat = newCat(state, picked, 1);
        state.board[cell] = cat;
        event.spawn.push({
          cell,
          cat: cloneCat(cat),
          edge: edgeSet.has(cell)
        });
      }
    }
    event.after = cloneBoard(state.board);
    event.refillMatches = matches(state.board);
  }
  function previewSwap(state, a, b, modifiers) {
    if (!validSwap(state, a, b)) {
      return { valid: false };
    }
    const copy = cloneState(state);
    const tmp = copy.board[a];
    copy.board[a] = copy.board[b];
    copy.board[b] = tmp;
    return { valid: true, event: roundStep(copy, 1, modifiers) };
  }
  function reshuffle(state, rng) {
    for (let attempt = 0; attempt < 128; attempt++) {
      for (let i = state.board.length - 1; i > 0; i--) {
        const j = rng.randiRange(0, i);
        const tmp = state.board[i];
        state.board[i] = state.board[j];
        state.board[j] = tmp;
      }
      if (matches(state.board).length === 0 && findLegalSwaps(state).length > 0) {
        return "\u65E0\u53EF\u7528\u4EA4\u6362\uFF0C\u68CB\u76D8\u5DF2\u91CD\u6392\uFF08\u4FDD\u7559\u732B\u7684\u7B49\u7EA7\u4E0E\u989C\u8272\uFF09";
      }
    }
    generate(state, rng);
    return "\u91CD\u6392\u672A\u627E\u5230\u53EF\u7528\u5E03\u5C40\uFF0C\u5DF2\u5237\u65B0\u4E3A\u5C0F\u732B\u68CB\u76D8";
  }
  function resolveSwap(state, a, b, modifiers) {
    if (!validSwap(state, a, b)) {
      return {
        valid: false,
        state: cloneState(state),
        swapped: cloneBoard(state.board),
        events: [],
        notice: ""
      };
    }
    const next = cloneState(state);
    const rng = new SeededRng(next.seed, next.rngState);
    const tmp = next.board[a];
    next.board[a] = next.board[b];
    next.board[b] = tmp;
    const swapped = cloneBoard(next.board);
    const events = [];
    let notice = "";
    for (let n = 1; n <= MAX_ROUNDS; n++) {
      if (matches(next.board).length === 0) break;
      const event = roundStep(next, n, modifiers);
      events.push(event);
      if (next.winner >= 0) {
        event.after = cloneBoard(next.board);
        event.refillMatches = [];
        break;
      }
      refill(next, rng, event);
    }
    if (next.winner < 0) {
      if (matches(next.board).length > 0) {
        generate(next, rng);
        notice = "\u8FBE\u5230 100 \u8F6E\u7ED3\u7B97\u4FDD\u62A4\uFF0C\u5DF2\u5237\u65B0\u68CB\u76D8";
      }
      next.player = next.player === 0 ? 1 : 0;
      next.turn += 1;
      if (findLegalSwaps(next).length === 0) {
        notice = reshuffle(next, rng);
      }
    }
    next.rngState = rng.getState();
    return {
      valid: true,
      state: next,
      swapped,
      events,
      notice
    };
  }

  // src/fixtures.ts
  var FIXTURE_NAMES = [
    "3 \u8FDE\u5408\u6210\u5927\u732B",
    "\u5355\u5411\u5BBD\u5149\u675F",
    "\u53CC\u5411\u5BBD\u5149\u675F",
    "V \u5B57\u5BBD\u5149\u675F",
    "\u6536\u7F29\u89E6\u53D1\u8FDE\u9501",
    "\u7559\u7ED9\u5BF9\u624B\u7684\u5927\u732B",
    "V \u5B57\u5408\u6210\u5927\u732B",
    "\u4E8C\u8FDE\u73AF\u4E8C\u6B21\u5F15\u7206",
    "\u4E09\u8FDE\u73AF\u591A\u7C73\u8BFA",
    "4 \u8FDE\u5408\u6210\u53CC\u5927\u732B",
    "5 \u8FDE\u5408\u6210\u70AB\u5F69\u732B",
    "\u70AB\u5F69\u732B 6 \u5411\u5168\u7206",
    "\u4E09 2 \u661F\u5408\u70AB\u5F69",
    "\u53CC 2 \u661F\u5F15\u7206",
    "\u70AB\u5F69+2 \u661F\u5171\u7206",
    "\u6CE2\u53CA\u70AB\u5F69\u4E8C\u6B21\u6838\u7206",
    "\u7206\u53D1\u8986\u76D6\u7EAF\u5408\u6210"
  ];
  function loadFixture(id) {
    var _a, _b;
    const center = index(3, 2);
    const swapFrom = index(4, 1);
    for (let attempt = 0; attempt < 300; attempt++) {
      const state = newGame(8e3 + id * 1e3 + attempt);
      const target = cloneBoard(state.board);
      const [pq, pr] = coord(center);
      let cells;
      if (id === 3 || id === 6) {
        cells = [
          center,
          index(pq, pr + 1),
          index(pq, pr + 2),
          index(pq + 1, pr),
          index(pq + 2, pr)
        ];
      } else if (id === 9) {
        cells = [
          index(pq, pr - 1),
          center,
          index(pq, pr + 1),
          index(pq, pr + 2)
        ];
      } else if (id === 10) {
        cells = [
          index(pq, pr - 2),
          index(pq, pr - 1),
          center,
          index(pq, pr + 1),
          index(pq, pr + 2)
        ];
      } else {
        cells = [index(pq, pr - 1), center, index(pq, pr + 1)];
      }
      for (const cell of cells) {
        target[cell].color = 0;
        target[cell].level = 1;
      }
      target[swapFrom].color = 1;
      if (id === 1 || id === 7 || id === 8 || id === 15 || id === 16) {
        target[cells[0]].level = 2;
      } else if (id === 2 || id === 3) {
        target[center].level = 2;
      } else if (id === 11) {
        target[center].color = 2;
        target[center].level = 3;
      } else if (id === 12) {
        for (const cell of cells) target[cell].level = 2;
      } else if (id === 13) {
        target[cells[0]].level = 2;
        target[cells[1]].level = 2;
      } else if (id === 14) {
        target[cells[0]].level = 2;
        target[cells[1]].color = 2;
        target[cells[1]].level = 3;
      }
      if (id === 15) {
        const chainRainbow = index(pq + 1, pr);
        if (chainRainbow >= 0) {
          target[chainRainbow].color = 2;
          target[chainRainbow].level = 3;
          const safeRing = [
            [pq + 1, pr - 2, 3],
            [pq + 1, pr + 1, 2],
            [pq + 1, pr + 2, 3],
            [pq - 1, pr, 2],
            [pq + 2, pr, 3],
            [pq + 3, pr, 2],
            [pq - 1, pr + 2, 3],
            [pq + 2, pr - 1, 2],
            [pq + 3, pr - 2, 3]
          ];
          for (const [aq, ar, col] of safeRing) {
            const c = index(aq, ar);
            if (c >= 0 && c !== swapFrom && c !== chainRainbow && !cells.includes(c)) {
              target[c].color = col;
              target[c].level = 1;
            }
          }
        }
      }
      if (id === 16) {
        target[swapFrom].color = 2;
        target[swapFrom].level = 1;
        const topG = index(pq + 1, pr - 2);
        const botG = index(pq + 1, pr);
        if (topG >= 0) {
          target[topG].color = 2;
          target[topG].level = 1;
        }
        if (botG >= 0) {
          target[botG].color = 2;
          target[botG].level = 1;
        }
      }
      if (id === 7) {
        const chain1 = index(pq + 1, pr);
        if (chain1 >= 0) {
          target[chain1].color = 2;
          target[chain1].level = 2;
        }
      }
      if (id === 8) {
        const chain1 = index(pq + 1, pr);
        const chain2 = index(pq + 2, pr);
        if (chain1 >= 0) {
          target[chain1].color = 2;
          target[chain1].level = 2;
        }
        if (chain2 >= 0) {
          target[chain2].color = 3;
          target[chain2].level = 2;
        }
      }
      if (id === 10 || id === 12) {
        const around = [
          [pq - 1, pr, 1],
          [pq - 2, pr, 2],
          [pq + 1, pr, 3],
          [pq + 2, pr, 1],
          [pq - 1, pr + 1, 2],
          [pq - 2, pr + 2, 3],
          [pq + 1, pr - 1, 1],
          [pq + 2, pr - 2, 2]
        ];
        for (const [aq, ar, col] of around) {
          const cell = index(aq, ar);
          if (cell >= 0 && cell !== swapFrom && !cells.includes(cell)) {
            target[cell].color = col;
            target[cell].level = 1;
          }
        }
      }
      if (id === 4) {
        const incoming = index(pq, pr - 2);
        target[incoming].color = 2;
        target[index(pq + 1, pr - 1)].color = 2;
        target[index(pq + 2, pr - 1)].color = 2;
      }
      if (id === 5) {
        target[index(pq + 1, pr)].color = 0;
        target[index(pq + 2, pr)].color = 1;
        target[index(pq + 3, pr)].color = 0;
      }
      const tmp = target[center];
      target[center] = target[swapFrom];
      target[swapFrom] = tmp;
      state.board = target;
      if (matches(target).length === 0 && validSwap(state, swapFrom, center)) {
        const preview = previewSwap(state, swapFrom, center);
        if (!preview.valid || !preview.event) continue;
        const expectedLines = id === 3 || id === 6 || id === 16 ? 2 : 1;
        const expectedLen = id === 9 ? 4 : id === 10 ? 5 : 3;
        if (preview.event.lines.length !== expectedLines) continue;
        if (preview.event.lines.some((line) => line.cells.length !== expectedLen)) continue;
        if (id === 9 && preview.event.centers.length !== 2) continue;
        if ((id === 10 || id === 12) && !(preview.event.centers.length === 1 && preview.event.centers[0].resultLevel === 3 && preview.event.waves.length === 0)) {
          continue;
        }
        if ((id === 10 || id === 12) && preview.event.deterministicMatches.length > 0) {
          continue;
        }
        if (id === 11 && !(preview.event.waves.length >= 1 && preview.event.waves[0].kind === "rainbow")) {
          continue;
        }
        if (id === 13 && !(preview.event.waves.length >= 1 && preview.event.rays.length === 3)) {
          continue;
        }
        if (id === 14 && !(preview.event.waves.length >= 1 && preview.event.waves[0].kind === "rainbow" && preview.event.waves[0].sources.length === 2)) {
          continue;
        }
        if (id === 15 && !(preview.event.waves.length >= 2 && preview.event.waves[0].kind === "beam" && preview.event.waves[1].kind === "rainbow")) {
          continue;
        }
        if (id === 16 && !(preview.event.centers.length === 1 && !preview.event.centers[0].survives)) {
          continue;
        }
        if (id === 5) {
          const outcome = resolveSwap(state, swapFrom, center).state;
          const bridge = index(pq + 2, pr);
          const donor = index(pq + 3, pr);
          if (outcome.winner >= 0 || ((_a = outcome.board[center]) == null ? void 0 : _a.level) !== 2) continue;
          if (!validSwap(outcome, bridge, donor)) continue;
          const oppPreview = previewSwap(outcome, bridge, donor);
          if (!oppPreview.valid || !((_b = oppPreview.event) == null ? void 0 : _b.rays.some((path) => path[0] === center))) {
            continue;
          }
        }
        if (id === 4 && preview.event.deterministicMatches.length === 0) {
          continue;
        }
        if (id === 7 && preview.event.waves.length < 2) {
          continue;
        }
        if (id === 8 && preview.event.waves.length < 3) {
          continue;
        }
        state.fixture = id;
        state.suggested = [swapFrom, center];
        return state;
      }
    }
    return newGame(8e3 + id);
  }

  // src/roguelike.ts
  var STAGE_CLEAR_HEAL = 25;
  var BOSSES = [
    {
      id: "orange",
      stage: 1,
      name: "\u5927\u6A58",
      title: "\u7B2C 1 \u5173 \xB7 \u5E72\u996D\u738B",
      tagline: "\u5341\u53EA\u6A58\u732B\u4E5D\u53EA\u80D6\uFF0C\u89C1\u6A58\u5C31\u62A2\uFF01",
      maxHp: 65,
      skillPeriod: 0,
      traitShort: "\u4E13\u62A2\u6A58\u732B \xB7 \u6D88\u6A58\u56DE\u8840",
      accentColor: "#e67e22",
      barFillColor: "#ffd199"
    },
    {
      id: "cow",
      stage: 2,
      name: "\u5976\u725B\u732B",
      title: "\u7B2C 2 \u5173 \xB7 \u5348\u591C\u53D1\u766B\u738B",
      tagline: "\u51CC\u6668\u4E09\u70B9\u8DD1\u9177\uFF0C\u89C1\u5927\u732B\u5C31\u70B8\uFF01",
      maxHp: 95,
      skillPeriod: 2,
      traitShort: "\u4E13\u70B8\u5927\u732B \xB7 \u6BCF2\u56DE\u5408\u9020\u5927\u732B",
      accentColor: "#3d383b",
      barFillColor: "#cbd5e1"
    },
    {
      id: "hakimi",
      stage: 3,
      name: "\u54C8\u57FA\u7C73",
      title: "\u7B2C 3 \u5173 \xB7 \u7EC8\u6781\u732B\u738B",
      tagline: "\u4F18\u96C5\u538B\u8FEB\u611F\uFF0C\u5168\u573A\u6211\u8BF4\u4E86\u7B97\uFF01",
      maxHp: 120,
      skillPeriod: 2,
      traitShort: "\u9AD8\u4F24\u62A2\u7206 \xB7 \u6BCF2\u56DE\u5408\u53E0\u76FE\u9020\u5927\u732B",
      accentColor: "#c0392b",
      barFillColor: "#f5b7c8"
    }
  ];
  var RELICS = [
    // 🔥 爆破流
    {
      id: "chain_detonator",
      branch: "blast",
      branchLabel: "\u7206\u7834\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u8FDE\u73AF\u96F7\u7BA1",
      shortDesc: "\u4E8C\u6B21\u5F15\u7206\u6BCF\u6CE2 +5 \u4F24",
      detailDesc: "\u89E6\u53D1\u8FDE\u9501\u4E8C\u6B21\u5F15\u7206\uFF08Wave 1+\uFF09\u65F6\uFF0C\u6BCF\u591A 1 \u6CE2\u989D\u5916\u9020\u6210 +5 \u70B9\u7206\u7834\u4F24\u5BB3\u3002",
      badgeColor: "#ff6b6b"
    },
    {
      id: "wide_overdrive",
      branch: "blast",
      branchLabel: "\u7206\u7834\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u8FC7\u8F7D\u5BBD\u5149\u675F",
      shortDesc: "\u5927\u732B\u5149\u675F\u5C04\u7A0B +1 \u683C",
      detailDesc: "\u4F60\u7684 2 \u7EA7\u5927\u732B\u5BBD\u5149\u675F\u5C04\u7A0B +1\uFF08\u6700\u5927\u5C04\u7A0B\u63D0\u5347\u81F3 5 \u683C\uFF09\uFF0C\u8F7B\u677E\u5F15\u71C3\u5168\u573A\u3002",
      badgeColor: "#ff8787"
    },
    {
      id: "aftershock_paw",
      branch: "blast",
      branchLabel: "\u7206\u7834\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u4F59\u9707\u732B\u722A",
      shortDesc: "\u6BCF\u6CE2\u7206\u53D1 +3 \u7A7F\u76FE\u771F\u4F24",
      detailDesc: "\u4F60\u89E6\u53D1\u7684\u6BCF\u6B21\u7206\u53D1\u7ED3\u675F\u540E\uFF0C\u8FFD\u52A0\u300C\u7206\u53D1\u6CE2\u6570 \xD7 3\u300D\u70B9\u65E0\u89C6\u62A4\u76FE\u7684\u4F59\u9707\u771F\u4F24\u3002",
      badgeColor: "#f06595"
    },
    // ⭐ 合成流
    {
      id: "paw_shield",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      role: "defense",
      roleLabel: "\u9632\u5FA1",
      roleColor: "#2b7de9",
      name: "\u8089\u57AB\u62A4\u76FE",
      shortDesc: "\u5408\u5927\u732B +6 \u76FE \xB7 \u70AB\u5F69 +15",
      detailDesc: "\u6BCF\u5408\u6210 1 \u53EA 2 \u7EA7\u5927\u732B\u83B7\u5F97 +6 \u62A4\u76FE\uFF0C\u5408\u6210 3 \u7EA7\u70AB\u5F69\u732B\u83B7\u5F97 +15 \u62A4\u76FE\u3002",
      badgeColor: "#f5b82e"
    },
    {
      id: "double_kibble",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u53CC\u500D\u732B\u7CAE",
      shortDesc: "\u5408\u6210\u4F24\u5BB3\u7FFB\u500D",
      detailDesc: "\u4F60\u7684\u7EAF\u5C0F\u732B\u5408\u6210\u4E0E\u5168 2 \u661F\u5408\u6210\u9020\u6210\u7684\u57FA\u7840\u4F24\u5BB3\u7FFB\u500D\uFF083 \u8FDE 4 \u4F24\uFF0C\u4E09 2 \u661F 12 \u4F24\uFF09\u3002",
      badgeColor: "#f59f00"
    },
    {
      id: "calm_defuse",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      role: "defense",
      roleLabel: "\u9632\u5FA1",
      roleColor: "#2b7de9",
      name: "\u4EE5\u5C0F\u535A\u5927",
      shortDesc: "\u5408\u6210\u540E\u4E0B\u56DE\u5408\u51CF\u4F24 30%",
      detailDesc: "\u672C\u56DE\u5408\u53EA\u8981\u5408\u6210\u51FA\u5927\u732B\u6216\u70AB\u5F69\u732B\uFF0C\u4E0B\u4E2A Boss \u56DE\u5408\u4F60\u53D7\u5230\u7684\u4F24\u5BB3\u51CF\u514D 30%\u3002",
      badgeColor: "#eab308"
    },
    {
      id: "whisker_radar",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      role: "utility",
      roleLabel: "\u8F85\u52A9",
      roleColor: "#8b5cf6",
      name: "\u732B\u987B\u96F7\u8FBE",
      shortDesc: "\u53EF\u5408\u6210\u732B\u54AA\u6325\u722A\u63D0\u793A",
      detailDesc: "\u611F\u77E5\u68CB\u76D8\u52A8\u6001\uFF1A\u53EF\u5F15\u7206\u5927\u732B\u6216\u53EF\u5408\u6210\u7684\u732B\u54AA\u4F1A\u671D\u642D\u6863\u6325\u722A\u62DB\u624B\u63D0\u793A\u4EA4\u6362\u3002",
      badgeColor: "#f59e0b"
    },
    // 🌀 收缩流
    {
      id: "gravity_vortex",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u5F15\u529B\u6F29\u6DA1",
      shortDesc: "\u6536\u7F29\u6BCF\u79FB 1 \u732B +1 \u4F24",
      detailDesc: "\u7EAF\u5408\u6210\u89E6\u53D1\u5B9A\u5411\u6536\u7F29\u65F6\uFF0C\u6BCF\u6709 1 \u53EA\u732B\u53D1\u751F\u4F4D\u79FB\uFF0C\u989D\u5916\u5BF9 Boss \u9020\u6210 +1 \u70B9\u6324\u538B\u4F24\u5BB3\u3002",
      badgeColor: "#38b583"
    },
    {
      id: "catnip_combo",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      role: "attack",
      roleLabel: "\u653B\u51FB",
      roleColor: "#e54d42",
      name: "\u732B\u8584\u8377\u8FDE\u51FB",
      shortDesc: "\u591A\u8F6E\u8FDE\u9501\u52A0\u4F24\u7FFB\u500D",
      detailDesc: "\u4F60\u7684\u591A\u8F6E\u8FDE\u9501\u52A0\u4F24\u7FFB\u500D\uFF0C\u7B2C 2/3/4 \u8F6E\u989D\u5916\u4F24\u5BB3\u53D8\u4E3A +4 / +8 / +12\u3002",
      badgeColor: "#20c997"
    },
    {
      id: "combo_heal",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      role: "heal",
      roleLabel: "\u56DE\u8840",
      roleColor: "#1fa866",
      name: "\u987A\u624B\u7275\u732B",
      shortDesc: "\u89E6\u53D1\u8FDE\u9501\u6BCF\u8F6E\u56DE 5 \u8840",
      detailDesc: "\u4F60\u901A\u8FC7\u6536\u7F29\u89E6\u53D1\u7B2C 2 \u8F6E\u53CA\u4EE5\u4E0A\u8FDE\u9501\u65F6\uFF0C\u6BCF\u8F6E\u56DE\u590D\u81EA\u8EAB +5 \u751F\u547D\uFF08\u4E0D\u8D85\u4E0A\u9650\uFF09\u3002",
      badgeColor: "#12b886"
    }
  ];
  function getBossProfile(stageIndex) {
    const clamped = Math.max(0, Math.min(BOSSES.length - 1, stageIndex));
    return BOSSES[clamped];
  }
  function getRelicDef(id) {
    var _a;
    return (_a = RELICS.find((r) => r.id === id)) != null ? _a : RELICS[0];
  }
  function createRoguelikeRun(seed) {
    return {
      seed,
      stageIndex: 0,
      playerHp: HP,
      playerMaxHp: HP,
      playerShield: 0,
      bossShield: 0,
      bossTurnsTaken: 0,
      relics: [],
      calmDefuseActive: false,
      phase: "battle",
      rewardChoices: [],
      totalTurns: 0,
      bestTurnDamage: 0,
      defeatedBosses: []
    };
  }
  function seedOpeningBigCats(state, seed) {
    var _a;
    const rng = new SeededRng(seed + 4099);
    const upgraded = [];
    const swaps = findLegalSwaps(state);
    if (swaps.length > 0) {
      const startIdx = rng.randiRange(0, swaps.length - 1);
      for (let offset = 0; offset < swaps.length && upgraded.length < 1; offset++) {
        const [a, b] = swaps[(startIdx + offset) % swaps.length];
        const prev = previewSwap(state, a, b);
        if (!prev.valid || !prev.event || prev.event.lines.length === 0) continue;
        const candidates = [a, b, ...prev.event.lines[0].cells];
        for (const cell of candidates) {
          const cat = state.board[cell];
          if (!cat || cat.level !== 1) continue;
          cat.level = 2;
          if (matches(state.board).length === 0) {
            const check = previewSwap(state, a, b);
            if (check.valid && check.event && check.event.waves.length > 0) {
              upgraded.push(cell);
              break;
            }
          }
          cat.level = 1;
        }
      }
    }
    const innerCells = [];
    for (let q = 1; q <= 5; q++) {
      for (let r = 1; r <= 5; r++) {
        const c = index(q, r);
        if (c >= 0 && !upgraded.includes(c) && ((_a = state.board[c]) == null ? void 0 : _a.level) === 1) {
          innerCells.push(c);
        }
      }
    }
    for (let i = innerCells.length - 1; i > 0; i--) {
      const j = rng.randiRange(0, i);
      const tmp = innerCells[i];
      innerCells[i] = innerCells[j];
      innerCells[j] = tmp;
    }
    for (const cell of innerCells) {
      if (upgraded.length >= 2) break;
      const cat = state.board[cell];
      if (!cat || cat.level !== 1) continue;
      cat.level = 2;
      if (matches(state.board).length === 0 && findLegalSwaps(state).length > 0) {
        upgraded.push(cell);
      } else {
        cat.level = 1;
      }
    }
  }
  function createStageGameState(run) {
    const boss = getBossProfile(run.stageIndex);
    const stageSeed = run.seed + run.stageIndex * 9973 + 17;
    const st = newGame(stageSeed);
    if (run.stageIndex === 0) {
      seedOpeningBigCats(st, stageSeed);
    }
    st.hp = [run.playerHp, boss.maxHp];
    st.maxHp = [run.playerMaxHp, boss.maxHp];
    st.shield = [run.playerShield, run.bossShield];
    st.player = 0;
    return st;
  }
  function createTutorialScenario(step) {
    if (step === 0) {
      const st2 = loadFixture(0);
      st2.hp = [100, 30];
      st2.maxHp = [100, 30];
      st2.shield = [0, 0];
      st2.player = 0;
      st2.fixture = void 0;
      return {
        step: 0,
        totalSteps: 2,
        badge: "\u6559\u5B66 1/2",
        prompt: "\u62D6\u52A8\u732B\u732B\uFF0C3 \u8FDE\u5408\u6210\u5927\u732B\uFF01",
        successBanner: "\u68D2\uFF01\u5408\u51FA 2 \u7EA7\u5927\u732B\uFF01",
        state: st2,
        guideSwap: st2.suggested
      };
    }
    const st = loadFixture(7);
    st.hp = [100, 30];
    st.maxHp = [100, 30];
    st.shield = [0, 0];
    st.player = 0;
    st.fixture = void 0;
    return {
      step: 1,
      totalSteps: 2,
      badge: "\u6559\u5B66 2/2",
      prompt: "\u7528\u5927\u732B 3 \u8FDE\uFF0C\u8FDE\u9501\u8F70\u70B8\u5168\u573A\uFF01",
      successBanner: "\u5B66\u4F1A\u4E86\uFF01\u6B63\u5F0F\u5F00\u6253\uFF01",
      state: st,
      guideSwap: st.suggested
    };
  }
  function hasHintRelic(relics) {
    return relics.includes("whisker_radar");
  }
  function buildPlayerModifiers(relics) {
    const has = (id) => relics.includes(id);
    return {
      beamRadiusBonus: has("wide_overdrive") ? 1 : 0,
      mergeDamageMultiplier: has("double_kibble") ? 2 : 1,
      waveChainBonus: has("chain_detonator") ? 5 : 0,
      comboStepMultiplier: has("catnip_combo") ? 2 : 1,
      collapseMoveDamage: has("gravity_vortex") ? 1 : 0,
      aftershockPerWave: has("aftershock_paw") ? 3 : 0,
      damageMultiplier: 1
    };
  }
  function buildBossModifiers(run) {
    return {
      damageMultiplier: run.calmDefuseActive ? 0.7 : 1
    };
  }
  function isBossSkillDue(boss, bossTurnsTaken) {
    if (boss.skillPeriod <= 0) return false;
    return (bossTurnsTaken + 1) % boss.skillPeriod === 0;
  }
  function computeBossIntent(state, boss, bossTurnsTaken, damageMultiplier = 1) {
    var _a;
    const probe = cloneState(state);
    probe.player = 1;
    probe.winner = -1;
    const swaps = findLegalSwaps(probe);
    const skillReady = isBossSkillDue(boss, bossTurnsTaken);
    const skillText = boss.id === "orange" ? "\u6D88\u6A58\u56DE\u8840" : boss.id === "cow" ? skillReady ? "\u672C\u56DE\u5408\u9020\u5927\u732B" : "\u4E0B\u56DE\u5408\u9020\u5927\u732B" : skillReady ? "\u672C\u56DE\u5408+8\u76FE\u9020\u5927\u732B" : "\u4E0B\u56DE\u5408\u53E0\u76FE\u9020\u5927\u732B";
    if (swaps.length === 0) {
      return {
        swap: null,
        expectedDamage: 0,
        orangeCount: 0,
        hasBlast: false,
        hasMerge: false,
        skillReady,
        skillText,
        headline: `${boss.name} \u6682\u65F6\u65E0\u8DEF\u53EF\u8D70`
      };
    }
    const candidates = [];
    for (const sw of swaps) {
      const prev = previewSwap(probe, sw[0], sw[1], { damageMultiplier });
      if (!prev.valid || !prev.event) continue;
      const ev = prev.event;
      const hasBlast = ev.waves.length > 0;
      const hasMerge = ev.centers.length > 0;
      let orangeCount = 0;
      for (const c of ev.cleared) {
        if (((_a = ev.before[c]) == null ? void 0 : _a.color) === 0) orangeCount += 1;
      }
      let score = ev.damage;
      if (boss.id === "orange") {
        score = orangeCount > 0 ? 1e3 + orangeCount * 25 + ev.damage : ev.damage;
      } else if (boss.id === "cow") {
        score = hasBlast ? 1e3 + ev.damage * 3 : ev.damage;
      } else {
        score = hasBlast ? 1200 + ev.damage * 4 : ev.damage * 2 + (hasMerge ? 18 : 0);
      }
      candidates.push({
        swap: sw,
        damage: ev.damage,
        orangeCount,
        hasBlast,
        hasMerge,
        score
      });
    }
    if (candidates.length === 0) {
      return {
        swap: swaps[0],
        expectedDamage: 2,
        orangeCount: 0,
        hasBlast: false,
        hasMerge: false,
        skillReady,
        skillText,
        headline: `${boss.name} \u6B63\u5728\u89C2\u5BDF\u68CB\u76D8`
      };
    }
    candidates.sort((a, b) => b.score - a.score);
    let chosen = candidates[0];
    if (boss.id === "cow" && !chosen.hasBlast && candidates.length > 1) {
      const pool = Math.min(4, candidates.length);
      const pick = (state.turn * 7 + bossTurnsTaken * 3 + state.seed) % pool;
      chosen = candidates[pick];
    }
    let actionDesc = "\u51C6\u5907\u8FDB\u653B";
    if (boss.id === "orange" && chosen.orangeCount > 0) {
      actionDesc = chosen.hasBlast ? `\u5927\u6A58\u60F3\u62A2\u7206\uFF01\u9884\u8BA1 ${chosen.damage} \u4F24` : `\u5927\u6A58\u76EF\u4E0A\u6A58\u732B \xB7 \u9884\u8BA1 ${chosen.damage} \u4F24`;
    } else if (chosen.hasBlast) {
      actionDesc = `${boss.name}\u60F3\u62A2\u7206\u5927\u732B\uFF01\u9884\u8BA1 ${chosen.damage} \u4F24`;
    } else if (chosen.hasMerge) {
      actionDesc = `${boss.name}\u60F3\u5408\u5927\u732B \xB7 \u9884\u8BA1 ${chosen.damage} \u4F24`;
    } else {
      actionDesc = `${boss.name}\u51C6\u5907\u51FA\u624B \xB7 \u9884\u8BA1 ${chosen.damage} \u4F24`;
    }
    return {
      swap: chosen.swap,
      expectedDamage: chosen.damage,
      orangeCount: chosen.orangeCount,
      hasBlast: chosen.hasBlast,
      hasMerge: chosen.hasMerge,
      skillReady,
      skillText,
      headline: actionDesc
    };
  }
  function applyBossPreTurnSkill(state, boss, bossTurnsTaken) {
    if (!isBossSkillDue(boss, bossTurnsTaken)) {
      return { triggered: false, banner: "", upgradedCell: -1, shieldGained: 0 };
    }
    const rng = new SeededRng(state.seed + bossTurnsTaken * 131 + state.turn * 17);
    let shieldGained = 0;
    let upgradedCell = -1;
    if (boss.id === "hakimi") {
      shieldGained = 8;
      if (!state.shield) state.shield = [0, 0];
      state.shield[1] += shieldGained;
    }
    if (boss.id === "cow" || boss.id === "hakimi") {
      const level1Cells = [];
      for (let i = 0; i < CELL_COUNT; i++) {
        const cat = state.board[i];
        if (cat && cat.level === 1) {
          level1Cells.push(i);
        }
      }
      for (let i = level1Cells.length - 1; i > 0; i--) {
        const j = rng.randiRange(0, i);
        const tmp = level1Cells[i];
        level1Cells[i] = level1Cells[j];
        level1Cells[j] = tmp;
      }
      for (const cell of level1Cells) {
        const cat = state.board[cell];
        if (!cat) continue;
        cat.level = 2;
        if (matches(state.board).length === 0) {
          upgradedCell = cell;
          break;
        }
        cat.level = 1;
      }
    }
    const banner = boss.id === "cow" ? upgradedCell >= 0 ? "\u5976\u725B\u8DD1\u9177\uFF01\u9020\u51FA 1 \u53EA\u5927\u732B" : "\u5976\u725B\u8DD1\u9177\u6251\u7A7A\u4E86\uFF01" : upgradedCell >= 0 ? `\u54C8\u57FA\u7C73\u54C8\u6C14\uFF01+${shieldGained} \u76FE\u5E76\u9020\u5927\u732B` : `\u54C8\u57FA\u7C73\u54C8\u6C14\uFF01\u83B7\u5F97 +${shieldGained} \u76FE`;
    return {
      triggered: true,
      banner,
      upgradedCell,
      shieldGained
    };
  }
  function applyPlayerPostTurnRelics(state, run, events) {
    const has = (id) => run.relics.includes(id);
    let shieldGained = 0;
    let healed = 0;
    let mergedAny = false;
    const notes = [];
    for (const ev of events) {
      for (const center of ev.centers) {
        if (!center.survives) continue;
        mergedAny = true;
        if (has("paw_shield")) {
          shieldGained += center.resultLevel === 3 ? 15 : 6;
        }
      }
      if (ev.number >= 2 && has("combo_heal")) {
        healed += 5;
      }
    }
    if (shieldGained > 0) {
      if (!state.shield) state.shield = [0, 0];
      state.shield[0] += shieldGained;
      notes.push(`\u8089\u57AB\u62A4\u76FE +${shieldGained}`);
    }
    if (healed > 0) {
      const maxHp = state.maxHp ? state.maxHp[0] : run.playerMaxHp;
      const beforeHp = state.hp[0];
      state.hp[0] = Math.min(maxHp, state.hp[0] + healed);
      const actualHeal = state.hp[0] - beforeHp;
      if (actualHeal > 0) {
        notes.push(`\u987A\u624B\u7275\u732B\u56DE\u8840 +${actualHeal}`);
      }
      healed = actualHeal;
    }
    const calmDefuseArmed = mergedAny && has("calm_defuse");
    if (calmDefuseArmed) {
      notes.push("\u4EE5\u5C0F\u535A\u5927\u5DF2\u5C31\u7EEA\uFF08\u4E0B\u56DE\u5408\u51CF\u4F2430%\uFF09");
    }
    return {
      shieldGained,
      healed,
      calmDefuseArmed,
      notes
    };
  }
  function applyBossPostTurnPassive(state, boss, events) {
    var _a;
    const notes = [];
    let bossHealed = 0;
    if (boss.id === "orange" && state.winner < 0) {
      let orangeCleared = 0;
      for (const ev of events) {
        for (const c of ev.cleared) {
          if (((_a = ev.before[c]) == null ? void 0 : _a.color) === 0) orangeCleared += 1;
        }
      }
      if (orangeCleared > 0) {
        const healAmount = Math.min(8, orangeCleared);
        const maxHp = state.maxHp ? state.maxHp[1] : boss.maxHp;
        const before2 = state.hp[1];
        state.hp[1] = Math.min(maxHp, state.hp[1] + healAmount);
        bossHealed = state.hp[1] - before2;
        if (bossHealed > 0) {
          notes.push(`\u5927\u6A58\u5E72\u996D\u56DE\u8840 +${bossHealed} HP`);
        }
      }
    }
    return { bossHealed, notes };
  }
  function rollRelicChoices(owned, seed) {
    const rng = new SeededRng(seed);
    const ownedSet = new Set(owned);
    const branches = ["blast", "merge", "collapse"];
    const picked = [];
    for (const branch of branches) {
      const pool = RELICS.filter((r) => r.branch === branch && !ownedSet.has(r.id));
      if (pool.length > 0) {
        const chosen = pool[rng.randiRange(0, pool.length - 1)];
        picked.push(chosen.id);
      }
    }
    const remaining = RELICS.filter((r) => !ownedSet.has(r.id) && !picked.includes(r.id));
    while (picked.length < 3 && remaining.length > 0) {
      const idx = rng.randiRange(0, remaining.length - 1);
      picked.push(remaining[idx].id);
      remaining.splice(idx, 1);
    }
    return picked;
  }
  function computeHintSwaps(state, modifiers) {
    const swaps = findLegalSwaps(state);
    if (swaps.length === 0) {
      return { highValue: [], fallback: null };
    }
    const scored = [];
    for (const sw of swaps) {
      if (!validSwap(state, sw[0], sw[1])) continue;
      const prev = previewSwap(state, sw[0], sw[1], modifiers);
      if (!prev.valid || !prev.event) continue;
      const ev = prev.event;
      const hasBlast = ev.waves.length > 0;
      const maxLine = ev.lines.reduce((m, l) => Math.max(m, l.cells.length), 0);
      const hasRainbowMerge = ev.centers.some((c) => c.resultLevel === 3);
      const isHigh = hasBlast || maxLine >= 4 || hasRainbowMerge;
      const score = (hasBlast ? 500 : 0) + (hasRainbowMerge ? 350 : 0) + (maxLine >= 4 ? 220 : 0) + ev.damage * 10;
      scored.push({ swap: sw, isHigh, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const highValue = [];
    const usedCells = /* @__PURE__ */ new Set();
    for (const item of scored) {
      if (!item.isHigh) continue;
      if (usedCells.has(item.swap[0]) || usedCells.has(item.swap[1])) continue;
      highValue.push(item.swap);
      usedCells.add(item.swap[0]);
      usedCells.add(item.swap[1]);
      if (highValue.length >= 2) break;
    }
    return {
      highValue,
      fallback: scored.length > 0 ? scored[0].swap : swaps[0]
    };
  }

  // src/gameApp.ts
  var VIRTUAL_W = 720;
  var VIRTUAL_H = 1220;
  var ORIGIN_X = 76.5;
  var ORIGIN_Y = 266;
  var HEX_STEP = 63;
  var HEX_RADIUS = 59;
  var FONT_FAMILY2 = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';
  var INK2 = "#4e342e";
  var INK_SOFT = "#7a584c";
  var NEST_RIM_COLORS = ["#ffd8ad", "#cde2f5", "#f6e2a1", "#ffd3df", "#cdebd7"];
  var NEST_EMPTY_RIM = "#f4e2c8";
  var NEST_BIG_RIM = "#ffea9c";
  var NEST_LIGHT_STEP = 0.1;
  var NEST_MATCH_RIM = "#ffb938";
  var NEST_CENTER_RIM = "#5fd394";
  var WAVE_COLORS = ["#ff9852", "#ff4d8d", "#a855f7", "#ec4899"];
  var TUTORIAL_DONE_STORAGE_KEY = "cat_boom_tutorial_v1_done";
  function comboDamageTier(dmg) {
    return dmg >= 40 ? 3 : dmg >= 20 ? 2 : dmg >= 10 ? 1 : 0;
  }
  var COMBO_TIER_COLORS = ["#f97316", "#ef4444", "#e11d48", "#a855f7"];
  function easeCubicInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeBackOut(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function drawRoundedRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }
  function traceRoundedHexagon(ctx, cx, cy, radius, cornerRadius) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const angle = k * Math.PI * 2 / 6;
      pts.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const prev = pts[(k + 5) % 6];
      const curr = pts[k];
      const next = pts[(k + 1) % 6];
      const d1x = curr.x - prev.x;
      const d1y = curr.y - prev.y;
      const l1 = Math.hypot(d1x, d1y) || 1;
      const d2x = next.x - curr.x;
      const d2y = next.y - curr.y;
      const l2 = Math.hypot(d2x, d2y) || 1;
      const r = Math.min(cornerRadius, l1 * 0.35, l2 * 0.35);
      const sx = curr.x - d1x / l1 * r;
      const sy = curr.y - d1y / l1 * r;
      const ex = curr.x + d2x / l2 * r;
      const ey = curr.y + d2y / l2 * r;
      if (k === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
      ctx.quadraticCurveTo(curr.x, curr.y, ex, ey);
    }
    ctx.closePath();
  }
  function drawCuteStar(ctx, cx, cy, outerR, fill) {
    const innerR = outerR * 0.48;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = INK2;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }
  var CatBoomApp = class {
    constructor(platform2) {
      this.sound = new SoundEngine();
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.legalCount = 0;
      this.lastSummary = null;
      this.selected = -1;
      this.previewTarget = -1;
      this.preview = { valid: false };
      this.currentEvent = null;
      this.activeEventPhase = "none";
      this.phaseStart = 0;
      // 当前演出阶段开始时刻（用于猫窝依次亮起）
      this.matchOrder = /* @__PURE__ */ new Map();
      // 本轮匹配格 → 亮起顺序（合成中心最后）
      this.activeWaveIndex = -1;
      this.statusText = "";
      this.statusIcon = null;
      // 触控拖动与按住拎起猫咪状态
      this.dragStartCell = -1;
      this.isDragging = false;
      this.hoverPreviewed = false;
      this.grabbedCell = -1;
      this.grabbedCatId = -1;
      this.grabPointerX = 0;
      this.grabPointerY = 0;
      this.grabSmoothX = 0;
      this.grabSmoothY = 0;
      this.grabTilt = 0;
      this.grabElapsed = 0;
      // 模式与肉鸽闯关状态
      this.gameMode = "roguelike";
      this.bossHighlightSwap = null;
      this.hintSet = { highValue: [], fallback: null };
      this.tutorial = null;
      // 控制选项
      this.busy = false;
      this.speed = 1;
      this.shakeEnabled = true;
      this.stepEnabled = false;
      this.stepWaitResolver = null;
      this.showRulesModal = false;
      this.showDebugPanel = false;
      this.showRelicsModal = false;
      this.expandedRewardRelicId = null;
      // 渲染实体与动画
      this.visuals = /* @__PURE__ */ new Map();
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.lastAmbientCatId = -1;
      this.ghosts = [];
      this.shockwaves = [];
      this.floatings = [];
      this.flyers = [];
      this.sparks = [];
      // 血条显示层：与逻辑 state.hp 分离，伤害猫抵达时才扣减
      this.dispHp = null;
      this.trailHp = [0, 0];
      this.trailHold = [0, 0];
      this.dispShield = [0, 0];
      this.inFlightHp = [0, 0];
      this.inFlightShield = [0, 0];
      this.barHit = [0, 0];
      // 回合切换演出：过场色带、阵营氛围色、Boss 思考与瞄准
      this.turnIntro = null;
      this.turnTint = 0;
      // 0=玩家1/你，1=对手/Boss
      this.bossThink = 0;
      // Boss 头像思考蹦跳 1→0
      this.bossAim = null;
      this.comboTracker = null;
      this.tweens = [];
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.bannerText = "";
      this.bannerIcon = null;
      this.bannerLife = 0;
      this.bannerMaxLife = 1.6;
      this.elapsed = 0;
      this.lastFrameMs = 0;
      // 当前帧可点击按钮
      this.buttons = [];
      this.platform = platform2;
      this.assets = loadGameAssets();
      this.computeViewport();
      this.bindInputs();
      const tutorialDone = this.platform.getStorage(TUTORIAL_DONE_STORAGE_KEY) === "1";
      if (!tutorialDone) {
        this.startTutorial();
      } else {
        this.startNewRoguelikeRun(Math.floor(Date.now() % 1e6));
      }
    }
    start() {
      this.lastFrameMs = Date.now();
      const loop = () => {
        const now = Date.now();
        const dt = Math.min(0.05, Math.max(1e-3, (now - this.lastFrameMs) / 1e3));
        this.lastFrameMs = now;
        this.update(dt);
        this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    computeViewport() {
      const availW = this.platform.width;
      const availH = Math.max(240, this.platform.height - this.platform.topInset - this.platform.bottomInset);
      this.scale = Math.min(availW / VIRTUAL_W, availH / VIRTUAL_H);
      this.offsetX = (availW - VIRTUAL_W * this.scale) / 2;
      this.offsetY = this.platform.topInset + (availH - VIRTUAL_H * this.scale) / 2;
    }
    toVirtual(sx, sy) {
      return {
        x: (sx - this.offsetX) / this.scale,
        y: (sy - this.offsetY) / this.scale
      };
    }
    cellPoint(cell) {
      const p = position(cell);
      return {
        x: ORIGIN_X + p.x * HEX_STEP,
        y: ORIGIN_Y + p.y * HEX_STEP
      };
    }
    getGrabLiftY() {
      return this.platform.isTouch ? 48 : 28;
    }
    hitCell(vx, vy) {
      let best = -1;
      let bestDist = 55;
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const p = this.cellPoint(cell);
        const d = Math.hypot(p.x - vx, p.y - vy);
        if (d < bestDist) {
          bestDist = d;
          best = cell;
        }
      }
      return best;
    }
    setStatus(text, icon = null) {
      this.statusText = text;
      this.statusIcon = icon;
    }
    showBanner(text, duration = 1.6, icon = null) {
      this.bannerIcon = icon;
      this.bannerText = text;
      this.bannerMaxLife = duration;
      this.bannerLife = duration;
    }
    isInputBlocked() {
      if (this.busy) return true;
      if (this.showRulesModal || this.showDebugPanel || this.showRelicsModal) return true;
      if (this.tutorial) {
        return this.state.winner >= 0;
      }
      if (this.gameMode === "roguelike") {
        if (this.run.phase !== "battle" || this.state.player !== 0) return true;
      }
      return this.state.winner >= 0;
    }
    getCurrentModifiers(forPlayer) {
      if (this.tutorial || this.gameMode !== "roguelike") return void 0;
      return forPlayer === 0 ? buildPlayerModifiers(this.run.relics) : buildBossModifiers(this.run);
    }
    startTutorial() {
      if (this.busy) return;
      this.gameMode = "roguelike";
      this.showRulesModal = false;
      this.showDebugPanel = false;
      this.showRelicsModal = false;
      this.expandedRewardRelicId = null;
      this.run = createRoguelikeRun(Math.floor(Date.now() % 1e6));
      this.loadTutorialStep(0);
    }
    loadTutorialStep(step) {
      const scenario = createTutorialScenario(step);
      this.tutorial = scenario;
      this.bossHighlightSwap = null;
      this.comboTracker = null;
      this.loadState(scenario.state);
      this.hintSet = { highValue: [scenario.guideSwap], fallback: scenario.guideSwap };
      this.setStatus(scenario.prompt);
    }
    finishTutorial(markCompleted) {
      if (markCompleted) {
        this.platform.setStorage(TUTORIAL_DONE_STORAGE_KEY, "1");
      }
      this.tutorial = null;
      this.busy = false;
      this.startNewRoguelikeRun(
        Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
      );
    }
    startNewRoguelikeRun(seed) {
      if (this.busy) return;
      this.tutorial = null;
      this.gameMode = "roguelike";
      this.showDebugPanel = false;
      this.showRelicsModal = false;
      this.expandedRewardRelicId = null;
      this.comboTracker = null;
      this.run = createRoguelikeRun(seed);
      this.startCurrentStage();
    }
    startCurrentStage() {
      this.run.bossShield = 0;
      this.run.bossTurnsTaken = 0;
      this.run.calmDefuseActive = false;
      this.run.phase = "battle";
      this.bossHighlightSwap = null;
      this.comboTracker = null;
      const stageState = createStageGameState(this.run);
      this.loadState(stageState);
      const boss = getBossProfile(this.run.stageIndex);
      this.showBanner(`\u7B2C ${boss.stage}/3 \u5173 \xB7 ${boss.name} \u767B\u573A\uFF01`, 1.4);
      this.refreshPlayerTurnGuides();
    }
    chooseRewardRelic(id) {
      if (this.gameMode !== "roguelike" || this.run.phase !== "reward") {
        return;
      }
      this.run.relics.push(id);
      this.run.rewardChoices = [];
      this.expandedRewardRelicId = null;
      this.run.stageIndex += 1;
      this.sound.playChime();
      this.startCurrentStage();
    }
    refreshPlayerTurnGuides() {
      if (this.tutorial) {
        this.hintSet = { highValue: [this.tutorial.guideSwap], fallback: this.tutorial.guideSwap };
        return;
      }
      const canShowHints = this.gameMode === "roguelike" && hasHintRelic(this.run.relics);
      this.hintSet = canShowHints ? computeHintSwaps(this.state, this.getCurrentModifiers(0)) : { highValue: [], fallback: null };
      if (this.gameMode === "roguelike" && this.run.phase === "battle" && this.state.winner < 0) {
        this.setStatus("\u8F6E\u5230\u4F60\u4E86\uFF01\u62D6\u52A8\u732B\u732B 3 \u8FDE");
      }
    }
    startNewGame(seed) {
      if (this.busy) return;
      this.tutorial = null;
      this.gameMode = "pvp";
      this.bossHighlightSwap = null;
      this.showRelicsModal = false;
      this.loadState(newGame(seed));
      this.refreshPlayerTurnGuides();
    }
    loadState(next) {
      this.state = cloneState(next);
      this.initialState = cloneState(next);
      this.turnStart = cloneState(next);
      this.lastSummary = null;
      this.selected = -1;
      this.grabbedCell = -1;
      this.grabbedCatId = -1;
      this.previewTarget = -1;
      this.preview = { valid: false };
      this.currentEvent = null;
      this.activeEventPhase = "none";
      this.activeWaveIndex = -1;
      this.shockwaves = [];
      this.clearDamageFlyers();
      this.turnIntro = null;
      this.bossAim = null;
      this.bossThink = 0;
      this.comboTracker = null;
      this.legalCount = findLegalSwaps(this.state).length;
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.syncVisuals(this.state.board);
      this.setStatus(
        this.state.fixture !== void 0 ? `\u5B9E\u9A8C\uFF1A${FIXTURE_NAMES[this.state.fixture]} \xB7 \u6309\u91D1\u8272\u7BAD\u5934\u4EA4\u6362` : "\u70B9\u51FB\u6216\u62D6\u52A8\u76F8\u90BB\u732B\u732B\u4EA4\u6362\u4F4D\u7F6E"
      );
    }
    restartSame() {
      if (this.busy) return;
      this.loadState(this.initialState);
    }
    undoTurn() {
      if (this.busy) return;
      this.state = cloneState(this.turnStart);
      this.selected = -1;
      this.grabbedCell = -1;
      this.grabbedCatId = -1;
      this.previewTarget = -1;
      this.preview = { valid: false };
      this.currentEvent = null;
      this.activeEventPhase = "none";
      this.activeWaveIndex = -1;
      this.shockwaves = [];
      this.clearDamageFlyers();
      this.turnIntro = null;
      this.bossAim = null;
      this.bossThink = 0;
      this.comboTracker = null;
      this.legalCount = findLegalSwaps(this.state).length;
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.syncVisuals(this.state.board);
      this.setStatus(`\u5DF2\u6062\u590D\u7B2C ${this.state.turn} \u56DE\u5408\u5F00\u59CB\u72B6\u6001`);
      this.showDebugPanel = false;
    }
    syncVisuals(board) {
      this.visuals.clear();
      for (let cell = 0; cell < board.length; cell++) {
        const cat = board[cell];
        if (!cat) continue;
        const p = this.cellPoint(cell);
        this.visuals.set(cat.id, {
          id: cat.id,
          color: cat.color,
          level: cat.level,
          x: p.x,
          y: p.y,
          scale: 1,
          alpha: 1
        });
      }
    }
    bindInputs() {
      this.platform.onPointerDown((sx, sy) => {
        this.sound.unlock();
        const { x, y } = this.toVirtual(sx, sy);
        for (let i = this.buttons.length - 1; i >= 0; i--) {
          const b = this.buttons[i];
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            if (!b.disabled) {
              this.platform.vibrate("light");
              b.onClick();
            }
            return;
          }
        }
        if (this.showRulesModal) {
          this.showRulesModal = false;
          return;
        }
        if (this.showRelicsModal) {
          this.showRelicsModal = false;
          return;
        }
        if (this.showDebugPanel) {
          if (x < 36 || x > 684 || y < 220 || y > 960) {
            this.showDebugPanel = false;
          }
          return;
        }
        if (this.isInputBlocked()) return;
        const cell = this.hitCell(x, y);
        this.dragStartCell = cell;
        this.isDragging = false;
        if (cell >= 0 && this.state.board[cell]) {
          const cat = this.state.board[cell];
          const p = this.cellPoint(cell);
          this.grabbedCell = cell;
          this.grabbedCatId = cat.id;
          this.grabPointerX = p.x;
          this.grabPointerY = p.y - this.getGrabLiftY();
          this.grabSmoothX = p.x;
          this.grabSmoothY = p.y - Math.round(this.getGrabLiftY() * 0.35);
          this.grabTilt = 0;
          this.grabElapsed = 0;
          this.sound.playGrab();
          this.platform.vibrate("light");
        }
      });
      this.platform.onPointerMove((sx, sy) => {
        if (this.isInputBlocked()) {
          this.releaseGrab(true);
          return;
        }
        if (this.dragStartCell < 0) return;
        const { x, y } = this.toVirtual(sx, sy);
        if (this.grabbedCell >= 0) {
          this.grabPointerX = x;
          this.grabPointerY = y - this.getGrabLiftY();
        }
        const cell = this.hitCell(x, y);
        if (cell >= 0 && cell !== this.dragStartCell) {
          this.isDragging = true;
          this.selected = this.dragStartCell;
          if (neighbors(this.selected).includes(cell)) {
            this.setPreview(this.selected, cell);
          } else {
            this.clearPreview();
          }
        } else if (cell === this.dragStartCell && this.isDragging) {
          this.clearPreview();
        }
      });
      this.platform.onPointerUp((sx, sy) => {
        var _a, _b;
        if (this.isInputBlocked()) {
          this.dragStartCell = -1;
          this.isDragging = false;
          this.releaseGrab(true);
          return;
        }
        if (this.dragStartCell < 0) {
          this.releaseGrab(true);
          return;
        }
        const { x, y } = this.toVirtual(sx, sy);
        const upCell = this.hitCell(x, y);
        const startCell = this.dragStartCell;
        const wasDragging = this.isDragging;
        this.dragStartCell = -1;
        this.isDragging = false;
        if (wasDragging) {
          if (upCell >= 0 && upCell !== startCell && neighbors(startCell).includes(upCell)) {
            const canSwap = validSwap(this.state, startCell, upCell);
            this.releaseGrab(!canSwap);
            void this.submitSwap(startCell, upCell);
          } else {
            this.releaseGrab(true);
            this.selected = -1;
            this.clearPreview();
          }
          return;
        }
        this.releaseGrab(true);
        if (upCell < 0) {
          this.selected = -1;
          this.clearPreview();
          return;
        }
        if (upCell === this.selected) {
          this.selected = -1;
          this.clearPreview();
          return;
        }
        if (this.selected < 0 || !neighbors(this.selected).includes(upCell)) {
          this.selected = upCell;
          this.clearPreview();
          this.hoverPreviewed = false;
          return;
        }
        if (this.previewTarget === upCell && this.preview.valid || this.hoverPreviewed && this.previewTarget === upCell) {
          void this.submitSwap(this.selected, upCell);
          return;
        }
        if (!validSwap(this.state, this.selected, upCell)) {
          this.setStatus("\u9700\u8981 3 \u53EA\u540C\u8272\u8FDE\u6210\u76F4\u7EBF\u54E6");
          this.clearPreview();
          return;
        }
        this.setPreview(this.selected, upCell);
        this.hoverPreviewed = false;
        const dmg = (_b = (_a = this.preview.event) == null ? void 0 : _a.damage) != null ? _b : 0;
        this.setStatus(`\u9884\u8BA1 ${dmg} \u4F24 \xB7 \u518D\u70B9\u4E00\u6B21\u786E\u8BA4`);
      });
      this.platform.onPointerHover((sx, sy) => {
        if (this.isInputBlocked()) {
          return;
        }
        if (this.selected < 0) return;
        const { x, y } = this.toVirtual(sx, sy);
        const cell = this.hitCell(x, y);
        if (cell >= 0 && neighbors(this.selected).includes(cell)) {
          this.setPreview(this.selected, cell);
          this.hoverPreviewed = true;
        } else if (this.hoverPreviewed) {
          this.clearPreview();
          this.hoverPreviewed = false;
        }
      });
    }
    releaseGrab(snapBack) {
      if (this.grabbedCell < 0) return;
      const cell = this.grabbedCell;
      const catId = this.grabbedCatId;
      const sx = this.grabSmoothX;
      const sy = this.grabSmoothY;
      this.grabbedCell = -1;
      this.grabbedCatId = -1;
      this.grabTilt = 0;
      this.grabElapsed = 0;
      const vis = this.visuals.get(catId);
      if (!vis) return;
      vis.x = sx;
      vis.y = sy;
      if (snapBack) {
        const tp = this.cellPoint(cell);
        if (Math.hypot(tp.x - sx, tp.y - sy) > 1) {
          void this.runTween(0.16, "backOut", (t) => {
            vis.x = sx + (tp.x - sx) * t;
            vis.y = sy + (tp.y - sy) * t;
          });
        } else {
          vis.x = tp.x;
          vis.y = tp.y;
        }
      }
    }
    setPreview(a, b) {
      this.previewTarget = b;
      this.preview = previewSwap(this.state, a, b, this.getCurrentModifiers(this.state.player));
    }
    clearPreview() {
      this.previewTarget = -1;
      this.preview = { valid: false };
    }
    runTween(durationSec, ease, onUpdate) {
      const dur = Math.max(0.01, durationSec / this.speed);
      return new Promise((resolve) => {
        this.tweens.push({
          elapsed: 0,
          duration: dur,
          ease,
          onUpdate,
          resolve
        });
      });
    }
    waitSec(sec) {
      return this.runTween(sec, "linear", () => {
      });
    }
    waitForNextStep() {
      return new Promise((resolve) => {
        this.stepWaitResolver = resolve;
      });
    }
    async animateSwapPair(board, a, b, duration, arc, lift) {
      const items = [];
      [a, b].forEach((cell, i) => {
        const cat = board[cell];
        const vis = cat ? this.visuals.get(cat.id) : void 0;
        if (!vis) return;
        const tp = this.cellPoint(cell);
        items.push({ vis, sx: vis.x, sy: vis.y, tx: tp.x, ty: tp.y, side: i === 0 ? 1 : -1 });
      });
      if (items.length === 0) return;
      await this.runTween(duration, "cubicInOut", (t) => {
        const bump = Math.sin(Math.PI * t);
        for (const it of items) {
          const dx = it.tx - it.sx;
          const dy = it.ty - it.sy;
          const len = Math.hypot(dx, dy) || 1;
          it.vis.x = it.sx + dx * t + -dy / len * arc * bump * it.side;
          it.vis.y = it.sy + dy * t + dx / len * arc * bump * it.side;
          it.vis.scale = 1 + lift * bump;
        }
      });
      for (const it of items) it.vis.scale = 1;
    }
    spawnWaveBurstEffects(event, sources, cells, waveIndex) {
      if (cells.length === 0) return;
      const waveColor = WAVE_COLORS[Math.min(waveIndex, WAVE_COLORS.length - 1)];
      const ringLife = 0.42 / this.speed;
      for (const src of sources) {
        const p = this.cellPoint(src);
        this.shockwaves.push({
          x: p.x,
          y: p.y,
          color: waveColor,
          radius: 28,
          maxRadius: 155 + Math.min(waveIndex, 3) * 28,
          life: ringLife,
          maxLife: ringLife
        });
      }
      const count = Math.min(cells.length, 10);
      for (let k = 0; k < count; k++) {
        const cell = cells[k % cells.length];
        const orig = event.before[cell];
        if (!orig) continue;
        const p = this.cellPoint(cell);
        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 200;
        const maxLife = 0.48 / this.speed;
        this.ghosts.push({
          color: orig.color,
          level: orig.level,
          x: p.x,
          y: p.y,
          vx: Math.cos(angle) * dist,
          vy: Math.sin(angle) * dist,
          rot: 0,
          vRot: (Math.random() - 0.5) * 9,
          life: maxLife,
          maxLife
        });
      }
      this.platform.vibrate("heavy");
      if (this.shakeEnabled) {
        void this.playShake(1 + Math.min(waveIndex, 3) * 0.35);
      }
    }
    async playShake(intensity = 1) {
      this.shakeOffsetX = 5 * intensity;
      this.shakeOffsetY = -4 * intensity;
      await this.waitSec(0.045);
      this.shakeOffsetX = -4 * intensity;
      this.shakeOffsetY = 3 * intensity;
      await this.waitSec(0.045);
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
    spawnFloatingText(text, y, color = "#e54d42", x = 580) {
      const maxLife = 0.85 / this.speed;
      this.floatings.push({
        text,
        x,
        y,
        color,
        life: maxLife,
        maxLife
      });
    }
    /** 血条几何（与 drawPlayerBar 保持一致） */
    barRect(player) {
      return { x: 96, y: player === 1 ? 60 : 1070, w: player === 1 ? 448 : 596, h: 58 };
    }
    maxHpOf(player) {
      return this.state.maxHp ? this.state.maxHp[player] : HP;
    }
    /** 伤害猫追踪目标：护盾徽章中心，或当前显示血量的末端 */
    flyerTarget(f) {
      const r = this.barRect(f.defender);
      if (f.toShield) return { x: r.x + r.w - 9 - 44, y: r.y + r.h / 2 };
      const hp = this.dispHp ? this.dispHp[f.defender] : this.state.hp[f.defender];
      const ratio = Math.max(0, Math.min(1, hp / Math.max(1, this.maxHpOf(f.defender))));
      return { x: r.x + Math.max(26, r.w * ratio - 10), y: r.y + r.h / 2 };
    }
    clearDamageFlyers() {
      this.flyers = [];
      this.sparks = [];
      this.inFlightHp = [0, 0];
      this.inFlightShield = [0, 0];
    }
    /** 从被炸/被合成的格子取出伤害猫起点（数量不足时复用格子，营造密集弹幕感） */
    flyerStarts(event, cells, min, max, at) {
      const valid = cells.filter((c) => event.before[c]);
      if (valid.length === 0) return [];
      const n = Math.max(min, Math.min(max, valid.length));
      const starts = [];
      for (let k = 0; k < n; k++) {
        const cell = valid[k % valid.length];
        const cat = event.before[cell];
        const p = this.cellPoint(at ? at(cell) : cell);
        const jitter = k >= valid.length ? 26 : 0;
        starts.push({
          x: p.x + (Math.random() - 0.5) * jitter,
          y: p.y + (Math.random() - 0.5) * jitter,
          color: cat.color,
          level: cat.level
        });
      }
      return starts;
    }
    /** 把一段扣血/扣盾分给一群伤害猫：逻辑值立即扣减，显示值等猫抵达时才扣减 */
    launchDamageFlyers(starts, defender, hp, shield, trailColor, popupColor) {
      this.state.hp[defender] = Math.max(0, this.state.hp[defender] - hp);
      if (this.state.shield) {
        this.state.shield[defender] = Math.max(0, this.state.shield[defender] - shield);
      }
      if (starts.length === 0 || hp + shield <= 0) return;
      const n = starts.length;
      let nShield = 0;
      if (shield > 0) {
        nShield = hp > 0 ? Math.max(1, Math.min(n - 1, Math.round(n * shield / (hp + shield)))) : n;
      }
      const nHp = n - nShield;
      const share = (total, m, k) => m <= 0 ? 0 : Math.floor(total / m) + (k < total % m ? 1 : 0);
      const popupText = [hp > 0 ? `\u2212${hp}` : "", shield > 0 ? `\u76FE\u2212${shield}` : ""].filter(Boolean).join(" ");
      let si = 0;
      let hi = 0;
      for (let i = 0; i < n; i++) {
        const s = starts[i];
        const toShield = nShield > 0 && Math.floor((i + 1) * nShield / n) > Math.floor(i * nShield / n);
        const fHp = toShield ? 0 : share(hp, nHp, hi++);
        const fShield = toShield ? share(shield, nShield, si++) : nShield === 0 ? i === 0 ? shield : 0 : 0;
        const angle = Math.random() * Math.PI * 2;
        const popDist = 40 + Math.random() * 50;
        this.flyers.push({
          color: s.color,
          level: s.level,
          sx: s.x,
          sy: s.y,
          ox: s.x + Math.cos(angle) * popDist,
          oy: s.y + Math.sin(angle) * popDist,
          bend: (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 230),
          x: s.x,
          y: s.y,
          scale: 0.5,
          rot: 0,
          vRot: (Math.random() - 0.5) * 14,
          delay: (i * 0.026 + Math.random() * 0.02) / this.speed,
          elapsed: 0,
          popDur: 0.16 / this.speed,
          flyDur: (0.5 + Math.random() * 0.14) / this.speed,
          defender,
          hp: fHp,
          shield: fShield,
          toShield,
          trailColor,
          trail: [],
          popupText: i === 0 ? popupText : "",
          popupColor: hp > 0 ? popupColor : "#2563eb"
        });
        this.inFlightHp[defender] += fHp;
        this.inFlightShield[defender] += fShield;
      }
    }
    onFlyerArrive(f, tx, ty) {
      const d = f.defender;
      this.inFlightHp[d] = Math.max(0, this.inFlightHp[d] - f.hp);
      this.inFlightShield[d] = Math.max(0, this.inFlightShield[d] - f.shield);
      this.barHit[d] = 1;
      this.trailHold[d] = 0.4 / this.speed;
      if (f.popupText) {
        this.spawnFloatingText(f.popupText, d === 1 ? 92 : 1070, f.popupColor);
      }
      if (this.sparks.length < 180) {
        const sparkColors = [f.trailColor, "#ffffff", f.toShield ? "#60a5fa" : "#ffd166"];
        for (let k = 0; k < 9; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 140 + Math.random() * 260;
          const maxLife = (0.32 + Math.random() * 0.2) / this.speed;
          this.sparks.push({
            x: tx,
            y: ty,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            size: 3 + Math.random() * 5,
            color: sparkColors[k % sparkColors.length],
            life: maxLife,
            maxLife
          });
        }
      }
    }
    /** 伤害猫：弹出 → 沿二次贝塞尔弧线加速追踪血条末端 */
    updateDamageFlyers(dt) {
      for (let i = this.flyers.length - 1; i >= 0; i--) {
        const f = this.flyers[i];
        f.elapsed += dt;
        const t = f.elapsed - f.delay;
        if (t < 0) continue;
        if (t < f.popDur) {
          const p = 1 - Math.pow(1 - t / f.popDur, 3);
          f.x = f.sx + (f.ox - f.sx) * p;
          f.y = f.sy + (f.oy - f.sy) * p;
          f.scale = 0.5 + 0.3 * p;
          f.rot += f.vRot * 0.4 * dt;
        } else {
          const p = Math.min(1, (t - f.popDur) / f.flyDur);
          const e = p * p * (1.6 - 0.6 * p);
          const tg = this.flyerTarget(f);
          const dx = tg.x - f.ox;
          const dy = tg.y - f.oy;
          const len = Math.hypot(dx, dy) || 1;
          const cx = (f.ox + tg.x) / 2 - dy / len * f.bend;
          const cy = (f.oy + tg.y) / 2 + dx / len * f.bend;
          const u = 1 - e;
          f.x = u * u * f.ox + 2 * u * e * cx + e * e * tg.x;
          f.y = u * u * f.oy + 2 * u * e * cy + e * e * tg.y;
          f.scale = 0.8 - 0.46 * e;
          f.rot += f.vRot * dt;
          if (p >= 1) {
            this.onFlyerArrive(f, tg.x, tg.y);
            this.flyers.splice(i, 1);
            continue;
          }
        }
        f.trail.push({ x: f.x, y: f.y });
        if (f.trail.length > 8) f.trail.shift();
      }
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          this.sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.9;
        s.vy = s.vy * 0.9 + 380 * dt;
      }
    }
    /** 显示血量平滑追随「逻辑血量 + 尚在飞行的伤害」，并带延迟残血 */
    updateHpDisplay(dt) {
      const shieldOf = (p) => this.state.shield ? this.state.shield[p] : 0;
      if (!this.dispHp) {
        this.dispHp = [this.state.hp[0], this.state.hp[1]];
        this.trailHp = [this.state.hp[0], this.state.hp[1]];
        this.dispShield = [shieldOf(0), shieldOf(1)];
      }
      for (const p of [0, 1]) {
        const target = Math.max(0, this.state.hp[p] + this.inFlightHp[p]);
        const cur = this.dispHp[p];
        let next = cur + (target - cur) * Math.min(1, dt * (target < cur ? 16 : 5));
        if (Math.abs(target - next) < 0.05) next = target;
        this.dispHp[p] = next;
        if (this.trailHold[p] > 0) {
          this.trailHold[p] -= dt;
        } else {
          this.trailHp[p] += (next - this.trailHp[p]) * Math.min(1, dt * 4.5);
        }
        if (this.trailHp[p] < next || Math.abs(this.trailHp[p] - next) < 0.05) this.trailHp[p] = next;
        const sTarget = Math.max(0, shieldOf(p) + this.inFlightShield[p]);
        let sNext = this.dispShield[p] + (sTarget - this.dispShield[p]) * Math.min(1, dt * 14);
        if (Math.abs(sTarget - sNext) < 0.05) sNext = sTarget;
        this.dispShield[p] = sNext;
        this.barHit[p] = Math.max(0, this.barHit[p] - dt * 3.2);
      }
    }
    renderDamageFlyers(ctx) {
      for (const f of this.flyers) {
        if (f.elapsed < f.delay) continue;
        ctx.save();
        const n = f.trail.length;
        ctx.fillStyle = f.trailColor;
        for (let k = 0; k < n; k++) {
          const a = (k + 1) / (n + 1);
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(f.trail[k].x, f.trail[k].y, 5 + 22 * a * f.scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(f.x, f.y, 44 * f.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawCatSprite(
          ctx,
          {
            x: f.x,
            y: f.y,
            colorId: f.color,
            level: f.level,
            scale: f.scale,
            rotation: f.rot,
            alpha: 1,
            showBadge: false
          },
          this.assets
        );
      }
      for (const s of this.sparks) {
        const a = Math.max(0, s.life / s.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.strokeStyle = INK2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    /** 回合收尾前等伤害猫全部落地（最多等 1.2 秒），避免结算先于扣血出现 */
    async waitFlyersLanded() {
      let waited = 0;
      while (this.flyers.length > 0 && waited < 1.2) {
        await this.waitSec(0.05);
        waited += 0.05 / this.speed;
      }
    }
    pushComboLog(delta, label, color, deltaText) {
      if (!this.comboTracker) return;
      this.comboTracker.totalDamage = Math.max(0, this.comboTracker.totalDamage + delta);
      this.comboTracker.pulse = 1;
      this.comboTracker.logSlide = 1;
      this.comboTracker.logs.push({
        label,
        deltaText: deltaText != null ? deltaText : delta >= 0 ? `+${delta}` : `${delta}`,
        color
      });
      if (this.comboTracker.logs.length > 6) {
        this.comboTracker.logs.shift();
      }
    }
    isSameSwapPair(a, b, pair) {
      return a === pair[0] && b === pair[1] || a === pair[1] && b === pair[0];
    }
    async submitSwap(a, b, isBossAction = false) {
      if (this.busy && !isBossAction) return;
      if (!validSwap(this.state, a, b)) {
        this.sound.playInvalid();
        this.setStatus(this.tutorial ? "\u6309\u7EFF\u8272\u624B\u6307\u6ED1\u52A8\u8BD5\u8BD5\u770B~" : "\u9700\u8981 3 \u53EA\u540C\u8272\u8FDE\u6210\u76F4\u7EBF\u54E6");
        this.selected = -1;
        this.clearPreview();
        return;
      }
      if (this.tutorial && !isBossAction) {
        if (!this.isSameSwapPair(a, b, this.tutorial.guideSwap)) {
          this.sound.playInvalid();
          this.setStatus("\u5148\u6309\u7EFF\u8272\u624B\u6307\u6ED1\u52A8\u8FD9\u4E24\u53EA\u732B\u54E6~");
          this.selected = -1;
          this.clearPreview();
          return;
        }
      }
      this.busy = true;
      const useSteps = this.stepEnabled && this.gameMode === "pvp";
      const attacker = this.state.player;
      const modifiers = this.getCurrentModifiers(attacker);
      if (!isBossAction) {
        this.turnStart = cloneState(this.state);
      }
      const result = resolveSwap(this.state, a, b, modifiers);
      this.selected = -1;
      this.clearPreview();
      this.hoverPreviewed = false;
      this.bossHighlightSwap = null;
      const actorLabel = this.gameMode === "roguelike" ? attacker === 0 ? "\u4F60" : getBossProfile(this.run.stageIndex).name : `\u73A9\u5BB6 ${attacker + 1}`;
      this.comboTracker = {
        active: true,
        actorLabel,
        isPlayer: attacker === 0,
        totalDamage: 0,
        rounds: 0,
        blastWaves: 0,
        trueDamage: 0,
        shieldBlocked: 0,
        pulse: 0,
        holdLife: 1.5,
        maxHold: 1.5,
        logs: [],
        age: 0,
        shownDamage: 0,
        tickPop: 0,
        tier: 0,
        burst: 0,
        comboShown: 0,
        stampLife: 0,
        shake: 0,
        logSlide: 0,
        sweep: -1
      };
      this.sound.playSwap();
      await this.animateSwapPair(
        result.swapped,
        a,
        b,
        isBossAction ? 0.56 : 0.34,
        isBossAction ? 34 : 18,
        isBossAction ? 0.2 : 0.12
      );
      let turnTotalDamage = 0;
      for (let idx = 0; idx < result.events.length; idx++) {
        const event = result.events[idx];
        turnTotalDamage += event.damage;
        this.currentEvent = event;
        this.activeEventPhase = "match";
        this.activeWaveIndex = -1;
        this.comboTracker.rounds = event.number;
        this.setStatus(`${actorLabel} \xB7 \u7B2C ${event.number} \u8F6E \xB7 ${event.damage} \u4F24`);
        if (idx > 0) {
          this.sound.playCombo(event.number);
          this.showBanner(`\u7B2C ${event.number} \u8F6E\u8FDE\u9501\uFF01`, 0.78, "sparkle");
        }
        this.phaseStart = this.elapsed;
        this.matchOrder = this.computeMatchOrder(event);
        let maxOrder = 0;
        const matchedVis = [];
        for (const [cell, order] of this.matchOrder) {
          maxOrder = Math.max(maxOrder, order);
          const cat = event.before[cell];
          const vis = cat ? this.visuals.get(cat.id) : void 0;
          if (vis) matchedVis.push({ vis, order });
        }
        const matchDur = Math.max(idx > 0 ? 0.62 : 0.55, maxOrder * NEST_LIGHT_STEP + 0.36);
        await this.runTween(matchDur, "linear", (t) => {
          const now = t * matchDur;
          for (const m of matchedVis) {
            const lp = Math.max(0, Math.min(1, (now - m.order * NEST_LIGHT_STEP) / 0.22));
            m.vis.scale = 1 + 0.14 * Math.sin(Math.PI * lp);
          }
        });
        for (const m of matchedVis) m.vis.scale = 1;
        const defender = attacker === 0 ? 1 : 0;
        let hpLeft = Math.max(0, this.state.hp[defender] - event.hp[defender]);
        let shieldLeft = this.state.shield ? Math.max(0, this.state.shield[defender] - event.shield[defender]) : 0;
        const popupColor = event.trueDamage > 0 ? "#9333ea" : "#e54d42";
        let weightLeft = event.waves.reduce((s, wv) => s + Math.max(0, wv.damage), 0);
        const mergeItems = [];
        for (const center of event.centers) {
          const cp = this.cellPoint(center.cell);
          for (const cell of center.members) {
            if (cell === center.cell) continue;
            const cat = event.before[cell];
            if (!cat) continue;
            const vis = this.visuals.get(cat.id);
            if (!vis) continue;
            mergeItems.push({ vis, sx: vis.x, sy: vis.y, tx: cp.x, ty: cp.y });
          }
        }
        if (mergeItems.length > 0) {
          this.activeEventPhase = "merge";
          const hasRainbowCenter = event.centers.some((c) => c.resultLevel === 3);
          this.sound.playMerge(hasRainbowCenter ? 3 : 2);
          await this.runTween(0.42, "cubicInOut", (t) => {
            for (const m of mergeItems) {
              m.vis.x = m.sx + (m.tx - m.sx) * t;
              m.vis.y = m.sy + (m.ty - m.sy) * t;
              m.vis.scale = 1 - 0.8 * t;
            }
          });
          if (event.waves.length > 0) await this.waitSec(0.15);
        }
        let waveShownDamage = 0;
        if (event.waves.length > 0) {
          this.activeEventPhase = "wave";
          for (let w = 0; w < event.waves.length; w++) {
            const wave = event.waves[w];
            this.activeWaveIndex = w;
            const pulseTargets = wave.sources.map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v));
            if (wave.wave > 0) {
              this.setStatus(`${actorLabel} \xB7 ${wave.wave + 1} \u8FDE\u73AF\u5F15\u7206\uFF01`);
              this.showBanner(`${wave.wave + 1} \u8FDE\u7206\uFF01`, 0.65, "blast");
            }
            const chargeDur = wave.wave === 0 ? 0.5 : 0.55;
            const chargeScale = wave.wave === 0 ? 0.24 : 0.38;
            const sourceSet = new Set(wave.sources);
            const shakers = wave.cells.filter((c) => !sourceSet.has(c)).map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v)).map((v) => ({ v, bx: v.x, by: v.y }));
            await this.runTween(chargeDur, "backOut", (t) => {
              for (const v of pulseTargets) v.scale = 1 + chargeScale * t;
              const amp = 3.2 * Math.min(1, t);
              for (const s of shakers) {
                s.v.x = s.bx + Math.sin(this.elapsed * 55 + s.v.id) * amp;
                s.v.y = s.by + Math.cos(this.elapsed * 47 + s.v.id) * amp * 0.6;
              }
            });
            for (const s of shakers) {
              s.v.x = s.bx;
              s.v.y = s.by;
            }
            this.sound.playBlast(wave.wave);
            this.spawnWaveBurstEffects(event, wave.sources, wave.cells, wave.wave);
            this.comboTracker.blastWaves += 1;
            waveShownDamage += wave.damage;
            const waveCol = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
            const waveKindLabel = wave.kind === "rainbow" ? "\u70AB\u5F69\u5168\u5411\u7206" : wave.wave === 0 ? "\u5BBD\u5149\u675F\u7206\u53D1" : `${wave.wave + 1} \u8FDE\u73AF\u5F15\u7206`;
            this.pushComboLog(wave.damage, waveKindLabel, waveCol);
            const isLastWave = w === event.waves.length - 1;
            const wWeight = Math.max(0, wave.damage);
            const frac = weightLeft > 0 ? wWeight / weightLeft : 1 / (event.waves.length - w);
            const hpShare = isLastWave ? hpLeft : Math.round(hpLeft * frac);
            const shieldShare = isLastWave ? shieldLeft : Math.round(shieldLeft * frac);
            hpLeft -= hpShare;
            shieldLeft -= shieldShare;
            weightLeft -= wWeight;
            this.launchDamageFlyers(
              this.flyerStarts(event, wave.cells, 8, 28),
              defender,
              hpShare,
              shieldShare,
              waveCol,
              popupColor
            );
            for (const cell of wave.cells) {
              const orig = event.before[cell];
              if (orig) this.visuals.delete(orig.id);
            }
            await this.waitSec(wave.wave === 0 ? 0.6 : 0.65);
          }
          this.activeWaveIndex = -1;
        } else {
          this.platform.vibrate("light");
          const memberCells = [];
          const centerOf = /* @__PURE__ */ new Map();
          for (const center of event.centers) {
            for (const cell of center.members) {
              if (cell === center.cell) continue;
              memberCells.push(cell);
              centerOf.set(cell, center.cell);
            }
          }
          this.launchDamageFlyers(
            this.flyerStarts(event, memberCells, 6, 20, (c) => {
              var _a;
              return (_a = centerOf.get(c)) != null ? _a : c;
            }),
            defender,
            hpLeft,
            shieldLeft,
            "#ffb347",
            popupColor
          );
          hpLeft = 0;
          shieldLeft = 0;
        }
        this.comboTracker.trueDamage += event.trueDamage;
        this.comboTracker.shieldBlocked += event.shieldBlocked;
        if (event.waves.length === 0) {
          const hasRainbow = event.centers.some((c) => c.resultLevel === 3);
          const mergeTag = hasRainbow ? "\u5408\u6210\u70AB\u5F69\u732B" : "\u5408\u6210\u5927\u732B";
          const comboTag = event.bonus > 0 ? ` \xB7 \u8FDE\u9501+${event.bonus}` : "";
          this.pushComboLog(event.damage, `${mergeTag}${comboTag}`, "#d97706");
        } else {
          const delta = event.damage - waveShownDamage;
          if (delta > 0) {
            const extraTag = event.trueDamage > 0 ? `\u771F\u4F24 +${event.trueDamage}` : event.bonus > 0 ? "\u8FDE\u9501\u52A0\u4F24" : "\u795D\u798F\u589E\u4F24";
            this.pushComboLog(
              delta,
              extraTag,
              event.trueDamage > 0 ? "#9333ea" : "#e54d42"
            );
          } else if (delta < 0) {
            this.pushComboLog(delta, "\u51CF\u4F24\u751F\u6548", "#2563eb", `${delta}`);
          }
        }
        this.activeEventPhase = "collapse";
        this.syncVisuals(event.afterClear);
        this.state.hp = [event.hp[0], event.hp[1]];
        if (this.state.shield) {
          this.state.shield = [event.shield[0], event.shield[1]];
        }
        const newBigs = [];
        for (const center of event.centers) {
          if (!center.survives) continue;
          const cat = event.afterClear[center.cell];
          if (!cat) continue;
          const vis = this.visuals.get(cat.id);
          if (vis) {
            vis.scale = 0.4;
            newBigs.push(vis);
          }
        }
        if (newBigs.length > 0) {
          await this.runTween(0.4, "backOut", (t) => {
            for (const v of newBigs) v.scale = 0.4 + 0.6 * t;
          });
        }
        for (const move of event.moves) {
          const vis = this.visuals.get(move.id);
          if (!vis) continue;
          const sx = vis.x;
          const sy = vis.y;
          const tp = this.cellPoint(move.to);
          await this.runTween(0.075, "cubicInOut", (t) => {
            vis.x = sx + (tp.x - sx) * t;
            vis.y = sy + (tp.y - sy) * t;
          });
        }
        this.syncVisuals(event.afterCollapse);
        if (event.spawn.length > 0) {
          const spawns = [];
          for (const sp of event.spawn) {
            const tp = this.cellPoint(sp.cell);
            let sx = tp.x;
            let sy = tp.y;
            if (sp.edge) {
              const dx = tp.x - 360;
              const dy = tp.y - 620;
              const len = Math.hypot(dx, dy) || 1;
              sx = tp.x + dx / len * 76;
              sy = tp.y + dy / len * 76;
            }
            const vis = {
              id: sp.cat.id,
              color: sp.cat.color,
              level: sp.cat.level,
              x: sx,
              y: sy,
              scale: 0.05,
              alpha: 1
            };
            this.visuals.set(vis.id, vis);
            spawns.push({ vis, sx, sy, tx: tp.x, ty: tp.y });
          }
          await this.runTween(0.36, "backOut", (t) => {
            const posT = Math.min(1, t);
            for (const s of spawns) {
              s.vis.x = s.sx + (s.tx - s.sx) * posT;
              s.vis.y = s.sy + (s.ty - s.sy) * posT;
              s.vis.scale = Math.max(0.05, 0.05 + 0.95 * t);
            }
          });
        }
        this.currentEvent = null;
        this.activeEventPhase = "none";
        this.activeWaveIndex = -1;
        if (idx < result.events.length - 1) {
          if (useSteps) {
            this.statusText += " \xB7 \u70B9\u51FB\u201C\u4E0B\u4E00\u8F6E\u201D\u7EE7\u7EED";
            await this.waitForNextStep();
          } else {
            await this.waitSec(0.42);
          }
        }
      }
      await this.waitFlyersLanded();
      this.state = result.state;
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.syncVisuals(this.state.board);
      this.legalCount = findLegalSwaps(this.state).length;
      this.computeTurnSummary(result.events);
      if (this.comboTracker) {
        this.comboTracker.active = false;
        this.comboTracker.holdLife = 2;
        this.comboTracker.maxHold = 2;
      }
      if (this.tutorial) {
        const completed = this.tutorial;
        this.sound.playChime();
        this.showBanner(completed.successBanner, 1.15, "sparkle");
        this.setStatus(completed.successBanner);
        await this.waitSec(1.1);
        if (!this.tutorial || this.tutorial.step !== completed.step) {
          this.busy = false;
          return;
        }
        if (completed.step === 0) {
          this.loadTutorialStep(1);
          this.busy = false;
        } else {
          this.finishTutorial(true);
        }
        return;
      }
      if (this.gameMode === "roguelike") {
        await this.handleRoguelikePostSwap(attacker, result.events, turnTotalDamage, result.notice);
        return;
      }
      if (this.state.winner >= 0) {
        this.setStatus(`\u73A9\u5BB6 ${this.state.winner + 1} \u83B7\u80DC\uFF01\u53EF\u70B9\u201C\u540C\u5C40\u91CD\u5F00\u201D\u518D\u6218\u4E00\u5C40`);
      } else if (result.notice) {
        this.setStatus(result.notice);
      } else {
        this.setStatus(`\u8F6E\u5230\u73A9\u5BB6 ${this.state.player + 1} \xB7 \u7559\u610F\u5BF9\u624B\u7559\u4E0B\u7684\u5927\u732B`);
      }
      if (this.state.winner < 0) {
        await this.waitSec(0.2);
        await this.playTurnIntro(this.state.player);
      }
      this.refreshPlayerTurnGuides();
      this.busy = false;
    }
    async handleRoguelikePostSwap(attacker, events, turnTotalDamage, notice) {
      const boss = getBossProfile(this.run.stageIndex);
      if (attacker === 0) {
        this.run.totalTurns += 1;
        this.run.bestTurnDamage = Math.max(this.run.bestTurnDamage, turnTotalDamage);
        const post = applyPlayerPostTurnRelics(this.state, this.run, events);
        if (post.shieldGained > 0) {
          this.spawnFloatingText(`+${post.shieldGained} \u76FE`, 1044, "#2563eb", 470);
        }
        if (post.healed > 0) {
          this.spawnFloatingText(`+${post.healed} HP`, 1044, "#16a34a", 330);
        }
        this.run.calmDefuseActive = post.calmDefuseArmed;
        this.run.playerHp = this.state.hp[0];
        this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
        this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
        if (this.state.winner === 0) {
          this.run.defeatedBosses.push(boss.id);
          this.sound.playVictory();
          if (this.run.stageIndex < BOSSES.length - 1) {
            this.run.playerHp = Math.min(this.run.playerMaxHp, this.run.playerHp + STAGE_CLEAR_HEAL);
            this.state.hp[0] = this.run.playerHp;
            this.run.rewardChoices = rollRelicChoices(
              this.run.relics,
              this.run.seed + (this.run.stageIndex + 1) * 7919 + this.run.totalTurns * 13
            );
            this.run.phase = "reward";
            this.expandedRewardRelicId = null;
            this.setStatus(`\u51FB\u8D25 ${boss.name}\uFF01\u9009 1 \u4E2A\u795D\u798F`, "trophy");
            this.showBanner(`\u51FB\u8D25 ${boss.name}\uFF01`, 1.4, "trophy");
          } else {
            this.run.phase = "victory";
            this.setStatus("\u5168\u90E8 Boss \u5DF2\u51FB\u8D25\uFF0C\u901A\u5173\u5927\u6377\uFF01", "trophy");
            this.showBanner("\u901A\u5173\u5927\u6377\uFF01", 1.8, "trophy");
          }
          this.busy = false;
          return;
        }
        if (notice) {
          this.setStatus(notice);
        } else if (post.notes.length > 0) {
          this.setStatus(post.notes.join(" \xB7 "));
        }
        await this.waitSec(0.3);
        await this.runBossTurn();
      } else {
        const bossPost = applyBossPostTurnPassive(this.state, boss, events);
        if (bossPost.bossHealed > 0) {
          this.spawnFloatingText(`+${bossPost.bossHealed} HP`, 92, "#16a34a", 340);
          this.showBanner(`\u5927\u6A58\u5403\u6A58\u56DE\u8840 +${bossPost.bossHealed}`, 1.2, "rice");
        }
        this.run.calmDefuseActive = false;
        this.run.bossTurnsTaken += 1;
        this.run.playerHp = this.state.hp[0];
        this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
        this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
        if (this.state.winner === 1 || this.run.playerHp <= 0) {
          this.run.phase = "defeat";
          this.sound.playDefeat();
          this.setStatus(`\u88AB ${boss.name} \u6320\u8DB4\u5566\uFF01\u70B9\u51FB\u91CD\u65B0\u6311\u6218`);
          this.busy = false;
          return;
        }
        if (notice) {
          this.setStatus(notice);
          await this.waitSec(0.4);
        }
        await this.waitSec(0.2);
        await this.playTurnIntro(0);
        this.refreshPlayerTurnGuides();
        this.busy = false;
      }
    }
    /** 回合切换过场：先收起上一方战报卡，再扫过一条阵营色带 */
    async playTurnIntro(player) {
      const ct = this.comboTracker;
      if (ct) {
        ct.active = false;
        ct.sweep = 2;
        ct.holdLife = Math.min(ct.holdLife, 0.3);
      }
      const dur = 0.9;
      this.turnIntro = { player, t: 0, dur: dur / this.speed };
      this.platform.vibrate("light");
      await this.waitSec(dur);
      this.turnIntro = null;
    }
    async runBossTurn() {
      const boss = getBossProfile(this.run.stageIndex);
      this.setStatus(`\u8F6E\u5230 ${boss.name} \u884C\u52A8\uFF01`);
      await this.playTurnIntro(1);
      const skill = applyBossPreTurnSkill(this.state, boss, this.run.bossTurnsTaken);
      if (skill.triggered) {
        this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
        this.ambientAnims = [];
        this.ambientSpawnTimer = 1.4;
        this.syncVisuals(this.state.board);
        const skillIcon = boss.id === "cow" ? "bolt" : "crown";
        this.showBanner(skill.banner, 1.4, skillIcon);
        this.setStatus(skill.banner, skillIcon);
        if (skill.shieldGained > 0) {
          this.spawnFloatingText(`+${skill.shieldGained} \u76FE`, 92, "#2563eb", 470);
        }
        if (skill.upgradedCell >= 0) {
          const upCat = this.state.board[skill.upgradedCell];
          const vis = upCat ? this.visuals.get(upCat.id) : void 0;
          if (vis) {
            vis.scale = 0.35;
            await this.runTween(0.32, "backOut", (t) => {
              vis.scale = 0.35 + 0.65 * t;
            });
          }
        }
        if (this.shakeEnabled) void this.playShake(0.9);
        await this.waitSec(0.5);
      }
      const mult = this.run.calmDefuseActive ? 0.7 : 1;
      const chosenSwap = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult).swap;
      if (!chosenSwap) {
        this.state.player = 0;
        this.refreshPlayerTurnGuides();
        this.busy = false;
        return;
      }
      this.setStatus(`${boss.name} \u601D\u8003\u4E2D...`);
      this.bossThink = 1;
      await this.waitSec(0.5);
      this.bossHighlightSwap = chosenSwap;
      this.setStatus(`${boss.name} \u884C\u52A8\u4E2D...`);
      const aimDur = 0.62;
      this.bossAim = { a: chosenSwap[0], b: chosenSwap[1], t: 0, dur: aimDur / this.speed };
      await this.waitSec(aimDur);
      this.bossAim = null;
      await this.submitSwap(chosenSwap[0], chosenSwap[1], true);
    }
    computeTurnSummary(events) {
      if (events.length === 0) return;
      let totalDamage = 0;
      let deterministicMatches = 0;
      for (const ev of events) {
        totalDamage += ev.damage;
        deterministicMatches += ev.deterministicMatches.length;
      }
      let opponentBest = 0;
      if (this.state.winner < 0) {
        for (const [sa, sb] of findLegalSwaps(this.state)) {
          const p = previewSwap(this.state, sa, sb);
          if (p.valid && p.event) {
            opponentBest = Math.max(opponentBest, p.event.damage);
          }
        }
      }
      this.lastSummary = {
        directDamage: events[0].damage,
        totalDamage,
        rounds: events.length,
        deterministicMatches,
        opponentBest
      };
    }
    update(dt) {
      this.elapsed += dt;
      this.updateAmbientAnims(dt);
      if (this.grabbedCell >= 0) {
        this.grabElapsed += dt;
        const follow = Math.min(1, dt * 22);
        const vx = this.grabPointerX - this.grabSmoothX;
        const vy = this.grabPointerY - this.grabSmoothY;
        this.grabSmoothX += vx * follow;
        this.grabSmoothY += vy * follow;
        const struggleSway = Math.sin(this.grabElapsed * 15) * 0.055;
        const dragSway = Math.max(-0.22, Math.min(0.22, -vx * 55e-4));
        const targetTilt = struggleSway + dragSway;
        this.grabTilt += (targetTilt - this.grabTilt) * Math.min(1, dt * 16);
      }
      if (this.bannerLife > 0) {
        this.bannerLife = Math.max(0, this.bannerLife - dt);
      }
      if (this.comboTracker) {
        const ct = this.comboTracker;
        ct.age += dt;
        if (ct.pulse > 0) {
          ct.pulse = Math.max(0, ct.pulse - dt * 4.5);
        }
        const prevInt = Math.floor(ct.shownDamage + 1e-4);
        const diff = ct.totalDamage - ct.shownDamage;
        if (Math.abs(diff) > 1e-3) {
          const step = Math.max(14 * dt, Math.abs(diff) * dt * 9);
          ct.shownDamage = Math.abs(diff) <= step ? ct.totalDamage : ct.shownDamage + Math.sign(diff) * step;
        }
        if (Math.floor(ct.shownDamage + 1e-4) !== prevInt) ct.tickPop = 1;
        const newTier = comboDamageTier(Math.floor(ct.shownDamage + 1e-4));
        if (newTier > ct.tier) ct.burst = 1;
        ct.tier = newTier;
        const comboCount = ct.blastWaves > 1 ? ct.blastWaves : ct.rounds > 1 ? ct.rounds : 0;
        if (comboCount > ct.comboShown) {
          ct.comboShown = comboCount;
          ct.stampLife = 1;
          ct.shake = 1;
        }
        ct.tickPop = Math.max(0, ct.tickPop - dt * 7);
        ct.burst = Math.max(0, ct.burst - dt * 1.8);
        ct.stampLife = Math.max(0, ct.stampLife - dt * 3.2);
        ct.shake = Math.max(0, ct.shake - dt * 4);
        ct.logSlide = Math.max(0, ct.logSlide - dt * 5);
        if (!ct.active) {
          if (ct.sweep < 0) ct.sweep = 0;
          ct.sweep = Math.min(2, ct.sweep + dt * 1.5);
          ct.holdLife -= dt;
          if (ct.holdLife <= 0) {
            this.comboTracker = null;
          }
        }
      }
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.elapsed += dt;
        const raw = Math.min(1, tw.elapsed / tw.duration);
        const eased = tw.ease === "cubicInOut" ? easeCubicInOut(raw) : tw.ease === "backOut" ? easeBackOut(raw) : raw;
        tw.onUpdate(eased);
        if (raw >= 1) {
          this.tweens.splice(i, 1);
          tw.resolve();
        }
      }
      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        const g = this.ghosts[i];
        g.life -= dt;
        if (g.life <= 0) {
          this.ghosts.splice(i, 1);
          continue;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vx *= 0.94;
        g.vy *= 0.94;
        g.rot += g.vRot * dt;
      }
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const r = this.shockwaves[i];
        r.life -= dt;
        if (r.life <= 0) {
          this.shockwaves.splice(i, 1);
          continue;
        }
        const p = 1 - Math.max(0, r.life / r.maxLife);
        r.radius = 28 + (r.maxRadius - 28) * easeCubicInOut(p);
      }
      for (let i = this.floatings.length - 1; i >= 0; i--) {
        const f = this.floatings[i];
        f.life -= dt;
        if (f.life <= 0) {
          this.floatings.splice(i, 1);
          continue;
        }
        f.y -= 52 * dt * this.speed;
      }
      this.updateDamageFlyers(dt);
      this.updateHpDisplay(dt);
      if (this.turnIntro) this.turnIntro.t += dt;
      if (this.bossAim) this.bossAim.t += dt;
      this.bossThink = Math.max(0, this.bossThink - dt * 1.6);
      const tintTarget = this.state.winner < 0 && this.state.player === 1 && !this.tutorial ? 1 : 0;
      this.turnTint += (tintTarget - this.turnTint) * Math.min(1, dt * 4);
    }
    /** 阵营主题色：你/P1 暖绿，Boss 红，PvP 的 P2 紫 */
    sideColor(player) {
      if (player === 0) return "#3fb877";
      return this.gameMode === "roguelike" ? "#e53935" : "#8b5cf6";
    }
    /** B. 对手回合时棋盘四周的阵营色暗角 */
    renderTurnTint(ctx) {
      if (this.turnTint < 0.01) return;
      const rgb = this.gameMode === "roguelike" ? "229, 57, 53" : "139, 92, 246";
      const breathe = 0.85 + 0.15 * Math.sin(this.elapsed * 3);
      const g = ctx.createRadialGradient(360, 620, 260, 360, 620, 780);
      g.addColorStop(0, `rgba(${rgb}, 0)`);
      g.addColorStop(1, `rgba(${rgb}, ${0.34 * this.turnTint * breathe})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(-200, -200, VIRTUAL_W + 400, VIRTUAL_H + 400);
      ctx.restore();
    }
    /** C. Boss 瞄准：两格红色准星收拢锁定，随后划出三道爪痕箭头 */
    renderBossAim(ctx) {
      const aim = this.bossAim;
      if (!aim) return;
      const p = Math.min(1, aim.t / aim.dur);
      const lockP = Math.min(1, p / 0.5);
      const lockE = 1 - Math.pow(1 - lockP, 3);
      const pa = this.cellPoint(aim.a);
      const pb = this.cellPoint(aim.b);
      const red = "#e53935";
      ctx.save();
      ctx.lineCap = "round";
      for (const c of [pa, pb]) {
        const r = 86 - 38 * lockE;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate((1 - lockE) * 1.6);
        ctx.globalAlpha = 0.35 + 0.65 * lockE;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = red;
        ctx.lineWidth = 4;
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
          ctx.lineTo(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12));
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 8;
          ctx.stroke();
          ctx.strokeStyle = red;
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.restore();
      }
      if (p > 0.5) {
        const clawP = Math.min(1, (p - 0.5) / 0.38);
        const e = 1 - Math.pow(1 - clawP, 2);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (let k = -1; k <= 1; k++) {
          const off = k * 14;
          const sx = pa.x + nx * off - dx / len * 22;
          const sy = pa.y + ny * off - dy / len * 22;
          const ex = sx + (dx + dx / len * 44) * e;
          const ey = sy + (dy + dy / len * 44) * e;
          const bend = 18 * (1 - Math.abs(k) * 0.3);
          const cx = (sx + ex) / 2 + nx * bend;
          const cy = (sy + ey) / 2 + ny * bend;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cx, cy, ex, ey);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 11 - Math.abs(k) * 2;
          ctx.stroke();
          ctx.strokeStyle = red;
          ctx.lineWidth = 6 - Math.abs(k) * 1.5;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    /** A. 回合切换过场：压暗 + 斜向阵营色带滑入 → 停留 → 滑出 */
    renderTurnIntro(ctx) {
      const ti = this.turnIntro;
      if (!ti) return;
      const p = Math.min(1, ti.t / ti.dur);
      const env = p < 0.18 ? p / 0.18 : p > 0.82 ? (1 - p) / 0.18 : 1;
      const bandX = p < 0.24 ? (1 - easeBackOut(p / 0.24)) * 820 : p > 0.78 ? -Math.pow((p - 0.78) / 0.22, 2) * 900 : 0;
      const textX = bandX * 1.25;
      const isRogue = this.gameMode === "roguelike";
      const boss = isRogue ? getBossProfile(this.run.stageIndex) : null;
      const color = this.sideColor(ti.player);
      const title = ti.player === 0 ? isRogue ? "\u4F60\u7684\u56DE\u5408" : "\u73A9\u5BB6 1 \u7684\u56DE\u5408" : boss ? `${boss.name}\u7684\u56DE\u5408` : "\u73A9\u5BB6 2 \u7684\u56DE\u5408";
      const sub = ti.player === 0 ? isRogue ? "\u62D6\u52A8\u732B\u732B\uFF0C\u6253\u51FA\u8FDE\u7206\uFF01" : "\u8F6E\u5230\u4F60\u51FA\u62DB" : boss ? boss.traitShort : "\u8F6E\u5230\u4F60\u51FA\u62DB";
      const avatar = ti.player === 0 ? this.assets.avatarP1 : boss ? this.assets.bosses[boss.id] : this.assets.avatarP2;
      ctx.save();
      ctx.globalAlpha = env;
      ctx.fillStyle = "rgba(40, 24, 18, 0.32)";
      ctx.fillRect(-200, -200, VIRTUAL_W + 400, VIRTUAL_H + 400);
      const cy = 620;
      const bh = 168;
      const skew = 60;
      const bandPath = (inset) => {
        ctx.beginPath();
        ctx.moveTo(-120 + bandX + skew, cy - bh / 2 - inset);
        ctx.lineTo(VIRTUAL_W + 120 + bandX + skew, cy - bh / 2 - 30 - inset);
        ctx.lineTo(VIRTUAL_W + 120 + bandX - skew, cy + bh / 2 - 30 + inset);
        ctx.lineTo(-120 + bandX - skew, cy + bh / 2 + inset);
        ctx.closePath();
      };
      ctx.globalAlpha = 1;
      bandPath(10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4;
      ctx.stroke();
      bandPath(0);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.save();
      bandPath(0);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#ffffff";
      const off = ti.t * 420 % 56;
      for (let sx = -260 + off; sx < VIRTUAL_W + 260; sx += 56) {
        ctx.beginPath();
        ctx.moveTo(sx + bandX, cy + bh);
        ctx.lineTo(sx + 22 + bandX, cy + bh);
        ctx.lineTo(sx + 22 + 120 + bandX, cy - bh);
        ctx.lineTo(sx + 120 + bandX, cy - bh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (avatar.ready) {
        const bounce = Math.sin(ti.t * 14) * 4 * env;
        const size = 150;
        ctx.drawImage(avatar.el, 70 + textX, cy - size / 2 - 22 + bounce, size, size);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.font = `900 58px ${FONT_FAMILY2}`;
      const tx = 236 + textX;
      ctx.save();
      ctx.translate(tx, cy - 22);
      ctx.transform(1, 0, -0.12, 1, 0, 0);
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 12;
      ctx.strokeText(title, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(title, 0, 0);
      ctx.restore();
      ctx.font = `800 24px ${FONT_FAMILY2}`;
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 6;
      ctx.strokeText(sub, tx + 4, cy + 34);
      ctx.fillStyle = "#fff8e7";
      ctx.fillText(sub, tx + 4, cy + 34);
      ctx.restore();
    }
    /** 全局稀疏点缀：每隔约 1.6~2.8 秒挑 1 只静卧猫轻眨眼或轻甩尾，同屏最多 2 只 */
    updateAmbientAnims(dt) {
      for (let i = this.ambientAnims.length - 1; i >= 0; i--) {
        const a = this.ambientAnims[i];
        a.elapsed += dt;
        if (a.elapsed >= a.duration || !this.visuals.has(a.catId) || a.catId === this.grabbedCatId) {
          this.ambientAnims.splice(i, 1);
        }
      }
      if (this.busy || this.ambientAnims.length >= 2) return;
      this.ambientSpawnTimer -= dt;
      if (this.ambientSpawnTimer > 0) return;
      this.ambientSpawnTimer = 1.6 + Math.random() * 1.2;
      const busyIds = new Set(this.ambientAnims.map((a) => a.catId));
      const candidates = [];
      for (const vis of this.visuals.values()) {
        if (vis.id === this.grabbedCatId || busyIds.has(vis.id)) continue;
        candidates.push(vis.id);
      }
      if (candidates.length === 0) return;
      const preferred = candidates.length > 1 ? candidates.filter((id) => id !== this.lastAmbientCatId) : candidates;
      const catId = preferred[Math.floor(Math.random() * preferred.length)];
      const isBlink = Math.random() < 0.58;
      this.lastAmbientCatId = catId;
      this.ambientAnims.push({
        catId,
        frame: isBlink ? 2 : 1,
        elapsed: 0,
        duration: isBlink ? 0.28 : 0.85
      });
    }
    /** 绘制手绘六边形缝线猫窝 */
    drawCatNest(ctx, cx, cy, rimColor, isSelected, isPreviewTarget) {
      ctx.save();
      traceRoundedHexagon(ctx, cx, cy + 3.5, HEX_RADIUS, 11);
      ctx.fillStyle = "rgba(78, 52, 46, 0.16)";
      ctx.fill();
      if (isSelected || isPreviewTarget) {
        traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS + 3.5, 13);
        ctx.fillStyle = isSelected ? "#fff5c0" : "#d2ffeb";
        ctx.fill();
      }
      traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS, 11);
      ctx.fillStyle = isSelected ? "#ffe58f" : rimColor;
      ctx.fill();
      ctx.strokeStyle = isPreviewTarget ? "#2e9e74" : INK2;
      ctx.lineWidth = isSelected || isPreviewTarget ? 4.2 : 3;
      ctx.stroke();
      traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * 0.8, 9);
      ctx.fillStyle = "#fff8ee";
      ctx.fill();
      ctx.strokeStyle = "rgba(78, 52, 46, 0.36)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    /** 亮起的猫窝：白色光晕 + 高亮布艺边 + 亮起瞬间轻微弹一下 */
    drawLitNest(ctx, cx, cy, color, lp) {
      const pop = 1 + 0.1 * Math.sin(Math.PI * lp);
      ctx.save();
      ctx.globalAlpha = Math.min(1, lp * 2);
      traceRoundedHexagon(ctx, cx, cy, (HEX_RADIUS + 5) * pop, 13);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fill();
      traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * pop, 11);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 3.6;
      ctx.stroke();
      traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * 0.8 * pop, 9);
      ctx.fillStyle = "#fff4d6";
      ctx.fill();
      ctx.strokeStyle = "rgba(78, 52, 46, 0.36)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    /** 每条连线从远离合成中心的一端依次亮向中心；交叉格取较早顺序，合成中心统一最后亮 */
    computeMatchOrder(event) {
      var _a, _b, _c;
      const order = /* @__PURE__ */ new Map();
      const centerCells = new Set(event.centers.map((c) => c.cell));
      for (const line of event.lines) {
        const pts = line.cells.map((c) => ({ c, p: this.cellPoint(c) }));
        let step = Infinity;
        for (const a of pts) {
          for (const b of pts) {
            const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
            if (d > 1 && d < step) step = d;
          }
        }
        const centerCell = (_c = (_b = line.cells.find((c) => centerCells.has(c))) != null ? _b : (_a = event.centers.find((ct) => ct.members.some((m) => line.cells.includes(m)))) == null ? void 0 : _a.cell) != null ? _c : line.cells[0];
        const cp = this.cellPoint(centerCell);
        const dists = pts.map(({ c, p }) => ({ c, d: Math.round(Math.hypot(p.x - cp.x, p.y - cp.y) / step) }));
        const maxD = Math.max(0, ...dists.map((x) => x.d));
        for (const { c, d } of dists) {
          const o = maxD - d;
          const prev = order.get(c);
          order.set(c, prev === void 0 ? o : Math.min(prev, o));
        }
      }
      let maxO = 0;
      for (const o of order.values()) maxO = Math.max(maxO, o);
      for (const c of centerCells) order.set(c, maxO);
      return order;
    }
    /** 绘制手绘星星爆发射线（支持按波次着色） */
    drawStarBlastArrow(ctx, ax, ay, bx, by, strokeColor = "#ff7e70") {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = 19;
      const ang = 0.52;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const drawStroke = (color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - (ux * cos - uy * sin) * head, by - (ux * sin + uy * cos) * head);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - (ux * cos + uy * sin) * head, by - (-ux * sin + uy * cos) * head);
        ctx.stroke();
      };
      ctx.save();
      drawStroke("#ffffff", 14);
      drawStroke(strokeColor, 7.5);
      const starCount = len > 180 ? 3 : 2;
      for (let i = 1; i <= starCount; i++) {
        const t = i / (starCount + 1);
        const sx = ax + dx * t;
        const sy = ay + dy * t;
        drawCuteStar(ctx, sx, sy, i === Math.ceil(starCount / 2) ? 15 : 11, "#ffe066");
      }
      ctx.restore();
    }
    drawSimpleArrow(ctx, ax, ay, bx, by, color, width) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = 14;
      const cos = Math.cos(0.5);
      const sin = Math.sin(0.5);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = width + 4.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - (ux * cos - uy * sin) * head, by - (ux * sin + uy * cos) * head);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - (ux * cos + uy * sin) * head, by - (-ux * sin + uy * cos) * head);
      ctx.stroke();
      ctx.restore();
    }
    drawUiIcon(ctx, key, cx, cy, size) {
      const image = this.assets.icons[key];
      if (!(image == null ? void 0 : image.ready)) return false;
      ctx.drawImage(image.el, cx - size / 2, cy - size / 2, size, size);
      return true;
    }
    drawCenteredIconText(ctx, icon, text, centerX, centerY, iconSize, gap) {
      let textX = centerX;
      if (icon) {
        const iconX = centerX - (ctx.measureText(text).width + gap) / 2;
        if (this.drawUiIcon(ctx, icon, iconX, centerY, iconSize)) {
          textX += (iconSize + gap) / 2;
        }
      }
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, textX, centerY);
      ctx.restore();
    }
    /** 手绘贴纸风按钮 */
    drawStickerButton(ctx, btn) {
      var _a;
      this.buttons.push(btn);
      ctx.save();
      const radius = btn.round ? btn.h / 2 : 16;
      if (!btn.disabled) {
        ctx.fillStyle = "rgba(78, 52, 46, 0.22)";
        drawRoundedRect(ctx, btn.x, btn.y + 4, btn.w, btn.h, radius);
        ctx.fill();
      }
      ctx.fillStyle = btn.disabled ? "#eadfce" : btn.accent ? "#ffe49e" : "#fffaf0";
      ctx.strokeStyle = btn.disabled ? "#b69f90" : INK2;
      ctx.lineWidth = 3.2;
      drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, radius);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = btn.disabled ? "#a1887f" : INK2;
      let fontSize = btn.round ? 30 : 26;
      ctx.font = `900 ${fontSize}px ${FONT_FAMILY2}`;
      if (!btn.round && (!btn.icon || !((_a = this.assets.icons[btn.icon]) == null ? void 0 : _a.ready))) {
        const maxTextW = btn.w - 20;
        while (fontSize > 17 && ctx.measureText(btn.label).width > maxTextW) {
          fontSize -= 1;
          ctx.font = `900 ${fontSize}px ${FONT_FAMILY2}`;
        }
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = btn.x + btn.w / 2;
      const cy = btn.y + btn.h / 2;
      if (!btn.icon || !this.drawUiIcon(ctx, btn.icon, cx, cy, Math.min(btn.w, btn.h) * 0.72)) {
        ctx.fillText(btn.label, cx, cy + 1);
      }
      ctx.restore();
    }
    /** 新手教学专用：翠绿轨迹 + 手绘拖动圆点手指动效 */
    drawTutorialGuide(ctx, swap) {
      const a = this.cellPoint(swap[0]);
      const b = this.cellPoint(swap[1]);
      const cycle = this.elapsed % 1.45 / 1.45;
      const moveT = cycle < 0.72 ? easeCubicInOut(cycle / 0.72) : 1;
      const alpha = cycle < 0.12 ? cycle / 0.12 : cycle > 0.85 ? (1 - cycle) / 0.15 : 1;
      const fx = a.x + (b.x - a.x) * moveT;
      const fy = a.y + (b.y - a.y) * moveT;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 7;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const head = 17;
      const cos = Math.cos(0.55);
      const sin = Math.sin(0.55);
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (ux * cos - uy * sin) * head, b.y - (ux * sin + uy * cos) * head);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (ux * cos + uy * sin) * head, b.y - (-ux * sin + uy * cos) * head);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const ringR = 20 + moveT * 14;
      ctx.strokeStyle = "rgba(34, 197, 94, 0.55)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(fx, fy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(78, 52, 46, 0.25)";
      ctx.beginPath();
      ctx.arc(fx, fy + 4, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(fx, fy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.ellipse(fx, fy + 4, 8, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const toeOffsets = [
        [-8, -5],
        [0, -8],
        [8, -5]
      ];
      for (const [ox, oy] of toeOffsets) {
        ctx.beginPath();
        ctx.arc(fx + ox, fy + oy, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    /** 手绘贴纸风玩家 / Boss 血条（大字号高可读，支持护盾与肉鸽专属 Boss 贴纸头像） */
    drawPlayerBar(ctx, player, y) {
      const isRogue = this.gameMode === "roguelike";
      const boss = isRogue ? getBossProfile(this.tutorial ? 0 : this.run.stageIndex) : null;
      const isTurn = this.state.winner < 0 && this.state.player === player;
      const isWinner = this.state.winner === player;
      const maxHp = this.state.maxHp ? this.state.maxHp[player] : HP;
      const shownHp = this.dispHp ? this.dispHp[player] : this.state.hp[player];
      const hpLabel = Math.round(shownHp);
      const shield = Math.round(
        this.dispHp ? this.dispShield[player] : this.state.shield ? this.state.shield[player] : 0
      );
      const hit = this.barHit[player];
      const barX = 96;
      const barW = player === 1 ? 448 : 596;
      const barH = 58;
      const radius = barH / 2;
      ctx.save();
      if (hit > 0) {
        ctx.translate(Math.sin(this.elapsed * 70) * hit * 5, Math.cos(this.elapsed * 55) * hit * 1.5);
      }
      const showTurnFx = this.state.winner < 0 && !this.tutorial;
      if (showTurnFx && isTurn) {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.25 * Math.sin(this.elapsed * 5);
        ctx.strokeStyle = this.sideColor(player);
        ctx.lineWidth = 12;
        drawRoundedRect(ctx, barX - 10, y - 10, barW + 20, barH + 20, radius + 10);
        ctx.stroke();
        ctx.restore();
      } else if (showTurnFx) {
        ctx.globalAlpha = 0.78;
      }
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, barX - 6, y - 6, barW + 12, barH + 12, radius + 6);
      ctx.fill();
      ctx.fillStyle = "#f5ebe0";
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.fill();
      const ratio = Math.max(0, Math.min(1, shownHp / Math.max(1, maxHp)));
      const trailRatio = this.dispHp ? Math.max(ratio, Math.min(1, this.trailHp[player] / Math.max(1, maxHp))) : ratio;
      if (trailRatio > 0) {
        ctx.save();
        drawRoundedRect(ctx, barX, y, barW, barH, radius);
        ctx.clip();
        if (trailRatio > ratio) {
          ctx.fillStyle = "#ff8a80";
          ctx.fillRect(barX + barW * ratio, y, barW * (trailRatio - ratio), barH);
        }
        ctx.fillStyle = player === 0 ? "#bae8cb" : isRogue && boss ? boss.barFillColor : "#d2c2fa";
        ctx.fillRect(barX, y, barW * ratio, barH);
        if (hit > 0) {
          ctx.globalAlpha = hit * 0.55;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(barX, y, barW, barH);
        }
        ctx.restore();
      }
      ctx.strokeStyle = isTurn || isWinner ? "#d97706" : INK2;
      ctx.lineWidth = isTurn || isWinner ? 4.4 : 3.6;
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.stroke();
      ctx.fillStyle = INK2;
      let label = "";
      if (isRogue && boss) {
        if (player === 1) {
          label = `${boss.name}  ${hpLabel}/${maxHp}`;
        } else {
          const calmTag = this.run.calmDefuseActive ? " \xB7 \u51CF\u4F24" : "";
          label = `\u4F60  ${hpLabel}/${maxHp}${calmTag}`;
        }
      } else {
        const suffix = isWinner ? " \xB7 \u80DC" : isTurn ? " \xB7 \u51FA\u62DB" : "";
        label = `P${player + 1}  ${hpLabel}${suffix}`;
      }
      let barFontSize = 28;
      ctx.font = `900 ${barFontSize}px ${FONT_FAMILY2}`;
      const maxLabelW = shield > 0 ? barW - 126 : barW - 44;
      while (barFontSize > 20 && ctx.measureText(label).width > maxLabelW) {
        barFontSize -= 1;
        ctx.font = `900 ${barFontSize}px ${FONT_FAMILY2}`;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = shield > 0 ? barX + (barW - 98) * 0.5 + 8 : barX + barW * 0.5 + 8;
      ctx.fillText(label, centerX, y + barH / 2 + 1);
      if (shield > 0) {
        const sw = 88;
        const sh = 40;
        const sx = barX + barW - sw - 9;
        const sy = y + (barH - sh) / 2;
        ctx.fillStyle = "#dbeafe";
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, sx, sy, sw, sh, 20);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = `900 22px ${FONT_FAMILY2}`;
        this.drawCenteredIconText(ctx, "shield", `${shield}`, sx + sw / 2, sy + sh / 2 + 1, 26, 5);
      }
      const avatar = player === 0 ? this.assets.avatarP1 : isRogue && boss ? this.assets.bosses[boss.id] : this.assets.avatarP2;
      if (avatar.ready) {
        const avSize = 104;
        const think = player === 1 ? this.bossThink : 0;
        if (think > 0) {
          const s = 1 + 0.16 * Math.abs(Math.sin(think * Math.PI * 3)) * think;
          const cx = 16 + avSize / 2;
          const cy = y - 24 + avSize / 2;
          ctx.save();
          ctx.translate(cx, cy - 10 * Math.abs(Math.sin(think * Math.PI * 3)) * think);
          ctx.scale(s, s);
          ctx.drawImage(avatar.el, -avSize / 2, -avSize / 2, avSize, avSize);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = Math.min(1, think * 3);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = INK2;
          ctx.lineWidth = 3;
          drawRoundedRect(ctx, 100, y - 30, 64, 36, 18);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = INK2;
          for (let k = 0; k < 3; k++) {
            const dotY = y - 12 + Math.sin(this.elapsed * 10 - k * 0.9) * 3;
            ctx.beginPath();
            ctx.arc(118 + k * 14, dotY, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.drawImage(avatar.el, 16, y - 24, avSize, avSize);
        }
      }
      ctx.restore();
    }
    /** 背景铺满整个真实画布（零黑边） */
    drawFullBackground(ctx) {
      const pw = this.platform.width;
      const ph = this.platform.height;
      ctx.fillStyle = "#f3cc9b";
      ctx.fillRect(0, 0, pw, ph);
      if (this.assets.bg.ready) {
        const img = this.assets.bg.el;
        const iw = img.naturalWidth || 720;
        const ih = img.naturalHeight || 1280;
        const coverScale = Math.max(pw / iw, ph / ih);
        const dw = iw * coverScale;
        const dh = ih * coverScale;
        const dx = (pw - dw) / 2;
        const dy = (ph - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      }
    }
    render() {
      const ctx = this.platform.ctx;
      this.buttons = [];
      ctx.save();
      this.drawFullBackground(ctx);
      ctx.translate(this.offsetX, this.offsetY);
      ctx.scale(this.scale, this.scale);
      if (this.tutorial) {
        const tut = this.tutorial;
        ctx.save();
        ctx.fillStyle = "rgba(255, 250, 240, 0.96)";
        ctx.strokeStyle = INK2;
        ctx.lineWidth = 3.2;
        drawRoundedRect(ctx, 24, 34, 496, 56, 28);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#c2610c";
        ctx.font = `900 28px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`\u65B0\u624B\u6559\u5B66  ${tut.step + 1}/${tut.totalSteps}`, 48, 63);
        for (let s = 0; s < tut.totalSteps; s++) {
          const dx = 398 + s * 34;
          const dy = 62;
          ctx.beginPath();
          ctx.arc(dx, dy, s === tut.step ? 10 : 7.5, 0, Math.PI * 2);
          ctx.fillStyle = s < tut.step ? "#22c55e" : s === tut.step ? "#f59e0b" : "#e2d2bf";
          ctx.fill();
          ctx.strokeStyle = INK2;
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }
        ctx.restore();
        this.drawStickerButton(ctx, {
          id: "skip-tutorial",
          x: 536,
          y: 34,
          w: 160,
          h: 56,
          label: "\u8DF3\u8FC7\u6559\u5B66",
          onClick: () => this.finishTutorial(true)
        });
        ctx.save();
        ctx.fillStyle = "rgba(78, 52, 46, 0.16)";
        drawRoundedRect(ctx, 24, 112, 672, 76, 28);
        ctx.fill();
        ctx.fillStyle = "#fff8dc";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, 24, 108, 672, 76, 28);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `900 30px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        this.drawTruncatedText(ctx, this.statusText || tut.prompt, VIRTUAL_W / 2, 147, 636);
        ctx.restore();
      } else {
        if (this.gameMode === "roguelike") {
          const boss = getBossProfile(this.run.stageIndex);
          ctx.save();
          ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
          ctx.strokeStyle = "rgba(78, 52, 46, 0.45)";
          ctx.lineWidth = 2.2;
          drawRoundedRect(ctx, 118, 16, 574, 34, 17);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = boss.accentColor;
          ctx.font = `900 21px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`\u7B2C ${boss.stage}/3 \u5173`, 136, 34);
          for (let s = 0; s < BOSSES.length; s++) {
            const dx = 250 + s * 22;
            const dy = 33;
            ctx.beginPath();
            ctx.arc(dx, dy, s === this.run.stageIndex ? 7.5 : 5.5, 0, Math.PI * 2);
            ctx.fillStyle = s < this.run.stageIndex ? "#38b583" : s === this.run.stageIndex ? boss.accentColor : "#dccbb8";
            ctx.fill();
            ctx.strokeStyle = INK2;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.fillStyle = INK_SOFT;
          ctx.font = `800 21px ${FONT_FAMILY2}`;
          ctx.textAlign = "right";
          this.drawTruncatedText(ctx, boss.traitShort, 674, 34, 340);
          ctx.restore();
        }
        this.drawPlayerBar(ctx, 1, 60);
        this.drawStickerButton(ctx, {
          id: "sound",
          x: 560,
          y: 60,
          w: 58,
          h: 58,
          icon: this.sound.isMuted() ? "sound_off" : "sound_on",
          label: this.sound.isMuted() ? "\u9759" : "\u97F3",
          round: true,
          accent: !this.sound.isMuted(),
          onClick: () => {
            const nowMuted = this.sound.toggleMute();
            if (!nowMuted) {
              this.sound.unlock();
              this.sound.playChime();
            }
          }
        });
        this.drawStickerButton(ctx, {
          id: "rules",
          x: 632,
          y: 60,
          w: 58,
          h: 58,
          label: "?",
          round: true,
          onClick: () => {
            this.showRulesModal = true;
            this.showDebugPanel = false;
            this.showRelicsModal = false;
          }
        });
        ctx.save();
        const isBossTurn = this.gameMode === "roguelike" && this.run.phase === "battle" && this.state.player === 1;
        ctx.fillStyle = isBossTurn ? "rgba(255, 236, 236, 0.96)" : "rgba(255, 250, 240, 0.94)";
        ctx.strokeStyle = isBossTurn ? "#e54d42" : "rgba(78, 52, 46, 0.42)";
        ctx.lineWidth = isBossTurn ? 3.2 : 2.4;
        const pillW = this.stepWaitResolver ? 500 : 672;
        drawRoundedRect(ctx, 24, 134, pillW, 56, 28);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isBossTurn ? "#b91c1c" : INK2;
        ctx.font = `800 26px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (this.statusIcon) {
          this.drawCenteredIconText(ctx, this.statusIcon, this.statusText, 24 + pillW / 2, 163, 30, 8);
        } else {
          this.drawTruncatedText(ctx, this.statusText, 24 + pillW / 2, 163, pillW - 36);
        }
        ctx.restore();
        if (this.stepWaitResolver) {
          this.drawStickerButton(ctx, {
            id: "next-step",
            x: 538,
            y: 136,
            w: 158,
            h: 52,
            label: "\u4E0B\u4E00\u8F6E",
            accent: true,
            onClick: () => {
              const resolve = this.stepWaitResolver;
              this.stepWaitResolver = null;
              resolve == null ? void 0 : resolve();
            }
          });
        }
      }
      ctx.save();
      ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
      const activeHintCells = /* @__PURE__ */ new Set();
      const activeHighCells = /* @__PURE__ */ new Set();
      const hintPartner = /* @__PURE__ */ new Map();
      const hintsUnlocked = Boolean(this.tutorial) || this.gameMode === "roguelike" && hasHintRelic(this.run.relics);
      if (hintsUnlocked && !this.isInputBlocked() && this.selected < 0 && this.grabbedCell < 0) {
        for (const [ha, hb] of this.hintSet.highValue) {
          activeHintCells.add(ha);
          activeHintCells.add(hb);
          activeHighCells.add(ha);
          activeHighCells.add(hb);
          hintPartner.set(ha, hb);
          hintPartner.set(hb, ha);
        }
        if (activeHintCells.size === 0 && this.hintSet.fallback) {
          const [fa, fb] = this.hintSet.fallback;
          activeHintCells.add(fa);
          activeHintCells.add(fb);
          hintPartner.set(fa, fb);
          hintPartner.set(fb, fa);
        }
      }
      const bossLockedCells = /* @__PURE__ */ new Set();
      if (this.bossHighlightSwap) {
        bossLockedCells.add(this.bossHighlightSwap[0]);
        bossLockedCells.add(this.bossHighlightSwap[1]);
      }
      const tutorialFocusCells = /* @__PURE__ */ new Set();
      if (this.tutorial && !this.busy && this.grabbedCell < 0) {
        tutorialFocusCells.add(this.tutorial.guideSwap[0]);
        tutorialFocusCells.add(this.tutorial.guideSwap[1]);
      }
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const p = this.cellPoint(cell);
        const cat = this.state.board[cell];
        const rimColor = !cat ? NEST_EMPTY_RIM : cat.level >= 2 ? NEST_BIG_RIM : NEST_RIM_COLORS[cat.color % NEST_RIM_COLORS.length];
        this.drawCatNest(
          ctx,
          p.x,
          p.y,
          rimColor,
          cell === this.selected,
          cell === this.previewTarget && this.preview.valid
        );
        if (this.currentEvent && (this.activeEventPhase === "match" || this.activeEventPhase === "merge") && this.matchOrder.has(cell)) {
          const order = this.matchOrder.get(cell);
          const isCenter = this.currentEvent.centers.some((c) => c.cell === cell);
          const lp = this.activeEventPhase === "merge" ? 1 : Math.max(
            0,
            Math.min(
              1,
              ((this.elapsed - this.phaseStart) * this.speed - order * NEST_LIGHT_STEP) / 0.22
            )
          );
          if (lp > 0) this.drawLitNest(ctx, p.x, p.y, isCenter ? NEST_CENTER_RIM : NEST_MATCH_RIM, lp);
        }
        if (this.tutorial && !this.busy && (cell === this.tutorial.guideSwap[0] || cell === this.tutorial.guideSwap[1])) {
          const glowAlpha = 0.28 + 0.2 * Math.sin(this.elapsed * 5.6);
          ctx.save();
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
          ctx.fillStyle = `rgba(74, 222, 128, ${glowAlpha.toFixed(2)})`;
          ctx.fill();
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 4.5;
          ctx.stroke();
          ctx.restore();
        } else if (activeHighCells.has(cell)) {
          const glowAlpha = 0.25 + 0.22 * Math.sin(this.elapsed * 5.2);
          ctx.save();
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS - 3, 10);
          ctx.fillStyle = `rgba(255, 224, 102, ${glowAlpha.toFixed(2)})`;
          ctx.fill();
          ctx.restore();
        }
        if (bossLockedCells.has(cell)) {
          const pulseW = this.bossHighlightSwap ? 5.8 : 4 + Math.sin(this.elapsed * 6) * 0.9;
          ctx.save();
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
          ctx.fillStyle = "rgba(239, 68, 68, 0.14)";
          ctx.fill();
          ctx.strokeStyle = this.bossHighlightSwap ? "#dc2626" : "#ef4444";
          ctx.lineWidth = pulseW;
          ctx.setLineDash([8, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
      if (this.grabbedCell >= 0) {
        const op = this.cellPoint(this.grabbedCell);
        const liftDist = Math.hypot(this.grabSmoothX - op.x, this.grabSmoothY - op.y);
        const shadowScale = Math.max(0.55, 1 - liftDist / 260);
        ctx.save();
        ctx.fillStyle = "rgba(78, 52, 46, 0.22)";
        ctx.beginPath();
        ctx.ellipse(op.x, op.y + 18, 28 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const idToCell = /* @__PURE__ */ new Map();
      for (let c = 0; c < this.state.board.length; c++) {
        const cat = this.state.board[c];
        if (cat) idToCell.set(cat.id, c);
      }
      const ambientFrameMap = /* @__PURE__ */ new Map();
      for (const a of this.ambientAnims) {
        ambientFrameMap.set(a.catId, a.frame);
      }
      for (const vis of this.visuals.values()) {
        if (vis.id === this.grabbedCatId) continue;
        const cell = idToCell.get(vis.id);
        let animState = "static";
        let flipX = false;
        let nudgeX = 0;
        let nudgeY = 0;
        let forceFrame;
        if (cell !== void 0 && activeHintCells.has(cell)) {
          animState = "hint";
          const partner = hintPartner.get(cell);
          if (partner !== void 0) {
            const pSelf = this.cellPoint(cell);
            const pOther = this.cellPoint(partner);
            const dx = pOther.x - pSelf.x;
            const dy = pOther.y - pSelf.y;
            if (dx < -4) flipX = true;
            const dist = Math.hypot(dx, dy) || 1;
            const lean = Math.max(0, Math.sin(this.elapsed * 5.2)) * 4.5;
            nudgeX = dx / dist * lean;
            nudgeY = dy / dist * lean;
          }
        } else {
          forceFrame = ambientFrameMap.get(vis.id);
        }
        drawCatSprite(
          ctx,
          {
            x: vis.x + nudgeX,
            y: vis.y + nudgeY,
            colorId: vis.color,
            level: vis.level,
            scale: vis.scale,
            alpha: vis.alpha,
            elapsed: this.elapsed,
            animState,
            seedOffset: vis.id,
            flipX,
            forceFrame
          },
          this.assets
        );
      }
      for (const g of this.ghosts) {
        drawCatSprite(
          ctx,
          {
            x: g.x,
            y: g.y,
            colorId: g.color,
            level: g.level,
            scale: 0.45,
            rotation: g.rot,
            alpha: Math.max(0, g.life / g.maxLife),
            showBadge: false
          },
          this.assets
        );
      }
      for (const ring of this.shockwaves) {
        const alpha = Math.max(0, ring.life / ring.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const previewEvent = this.preview.valid && this.preview.event ? this.preview.event : null;
      const overlayEvent = previewEvent != null ? previewEvent : this.currentEvent;
      if (previewEvent) {
        const cellWaveMap = /* @__PURE__ */ new Map();
        for (const wave of previewEvent.waves) {
          for (const cell of wave.cells) {
            cellWaveMap.set(cell, wave.wave);
          }
        }
        for (const cell of previewEvent.cleared) {
          const p = this.cellPoint(cell);
          const wIdx = cellWaveMap.get(cell);
          ctx.strokeStyle = wIdx !== void 0 ? WAVE_COLORS[Math.min(wIdx, WAVE_COLORS.length - 1)] : "#ff9852";
          ctx.lineWidth = wIdx && wIdx > 0 ? 4.8 : 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 48, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const wave of previewEvent.waves) {
          if (wave.wave > 0) {
            for (const src of wave.sources) {
              const p = this.cellPoint(src);
              ctx.strokeStyle = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
              ctx.lineWidth = 4;
              ctx.setLineDash([6, 5]);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 56, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }
        for (const center of previewEvent.centers) {
          const p = this.cellPoint(center.cell);
          ctx.strokeStyle = "#38b583";
          ctx.lineWidth = 4.5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 52, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (const path of previewEvent.rays) {
          if (path.length >= 2) {
            const a = this.cellPoint(path[0]);
            const b = this.cellPoint(path[path.length - 1]);
            this.drawStarBlastArrow(ctx, a.x, a.y, b.x, b.y);
          }
        }
        for (const move of previewEvent.moves) {
          const a = this.cellPoint(move.from);
          const b = this.cellPoint(move.to);
          this.drawSimpleArrow(ctx, a.x, a.y, b.x, b.y, "#3bb5a5", 3.6);
        }
      } else if (this.currentEvent) {
        const ev = this.currentEvent;
        if (this.activeEventPhase === "wave" && this.activeWaveIndex >= 0) {
          const wave = ev.waves[this.activeWaveIndex];
          if (wave) {
            const col = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
            ctx.save();
            for (const cell of wave.cells) {
              const p = this.cellPoint(cell);
              traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS - 4, 10);
              ctx.globalAlpha = 0.22;
              ctx.fillStyle = col;
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = col;
              ctx.lineWidth = wave.wave > 0 ? 4.8 : 4;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 48, 0, Math.PI * 2);
              ctx.stroke();
            }
            for (const src of wave.sources) {
              const p = this.cellPoint(src);
              ctx.strokeStyle = col;
              ctx.lineWidth = 5;
              ctx.setLineDash([7, 5]);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 58, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.restore();
            for (const path of wave.rays) {
              if (path.length >= 2) {
                const a = this.cellPoint(path[0]);
                const b = this.cellPoint(path[path.length - 1]);
                this.drawStarBlastArrow(ctx, a.x, a.y, b.x, b.y, col);
              }
            }
          }
        }
      }
      if (this.tutorial && tutorialFocusCells.size > 0 && !overlayEvent) {
        ctx.save();
        ctx.fillStyle = "rgba(62, 40, 32, 0.24)";
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          if (tutorialFocusCells.has(cell)) continue;
          const p = this.cellPoint(cell);
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 1, 11);
          ctx.fill();
        }
        ctx.restore();
      }
      if (this.tutorial && !this.busy && this.grabbedCell < 0 && !overlayEvent) {
        this.drawTutorialGuide(ctx, this.tutorial.guideSwap);
      }
      if (!this.tutorial && this.state.suggested && this.state.turn === 1 && !this.busy && this.selected < 0 && !overlayEvent) {
        const a = this.cellPoint(this.state.suggested[0]);
        const b = this.cellPoint(this.state.suggested[1]);
        this.drawSimpleArrow(ctx, a.x, a.y, b.x, b.y, "#f59e0b", 6);
      }
      if (this.grabbedCatId >= 0) {
        const vis = this.visuals.get(this.grabbedCatId);
        if (vis) {
          ctx.save();
          ctx.fillStyle = "rgba(78, 52, 46, 0.24)";
          ctx.beginPath();
          ctx.ellipse(this.grabSmoothX, this.grabSmoothY + 56, 26, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          const popScale = 1 + Math.min(1, this.grabElapsed / 0.1) * 0.18;
          drawCatSprite(
            ctx,
            {
              x: this.grabSmoothX,
              y: this.grabSmoothY,
              colorId: vis.color,
              level: vis.level,
              scale: vis.scale * popScale,
              rotation: this.grabTilt,
              alpha: vis.alpha,
              elapsed: this.elapsed,
              animState: "grabbed",
              seedOffset: vis.id,
              grabElapsed: this.grabElapsed
            },
            this.assets
          );
        }
      }
      this.renderBossAim(ctx);
      ctx.restore();
      this.renderTurnTint(ctx);
      for (const f of this.floatings) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.font = `900 38px ${FONT_FAMILY2}`;
        ctx.textAlign = "right";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
      if (this.tutorial) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 250, 240, 0.94)";
        ctx.strokeStyle = "rgba(78, 52, 46, 0.36)";
        ctx.lineWidth = 2.6;
        drawRoundedRect(ctx, 48, 1084, 624, 64, 32);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `800 25px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        this.drawTruncatedText(ctx, "\u6309\u4F4F\u4E00\u53EA\u53D1\u5149\u732B\u732B\uFF0C\u62D6\u5230\u65C1\u8FB9\u4EA4\u6362\u4F4D\u7F6E", VIRTUAL_W / 2, 1117, 588);
        ctx.restore();
      } else {
        this.drawPlayerBar(ctx, 0, 1070);
        if (this.gameMode === "roguelike" && this.run.relics.length > 0) {
          const count = this.run.relics.length;
          const badgeW = count >= 3 ? 196 : 230;
          const badgeH = 48;
          const gap = 12;
          const startX = count >= 3 ? 100 : 118;
          const badgeY = 1010;
          for (let i = 0; i < count; i++) {
            const def = getRelicDef(this.run.relics[i]);
            const rx = startX + i * (badgeW + gap);
            this.buttons.push({
              id: `relic-badge-${def.id}`,
              x: rx,
              y: badgeY,
              w: badgeW,
              h: badgeH,
              label: def.name,
              onClick: () => {
                this.showRelicsModal = true;
                this.showRulesModal = false;
                this.showDebugPanel = false;
              }
            });
            ctx.save();
            ctx.fillStyle = "rgba(78, 52, 46, 0.14)";
            drawRoundedRect(ctx, rx, badgeY + 3, badgeW, badgeH, 24);
            ctx.fill();
            ctx.fillStyle = "rgba(255, 250, 240, 0.96)";
            ctx.strokeStyle = def.badgeColor;
            ctx.lineWidth = 3;
            drawRoundedRect(ctx, rx, badgeY, badgeW, badgeH, 24);
            ctx.fill();
            ctx.stroke();
            const icon = this.assets.relics[def.branch];
            if (icon.ready) {
              ctx.drawImage(icon.el, rx + 7, badgeY + 4, 40, 40);
            }
            ctx.fillStyle = INK2;
            ctx.font = `900 22px ${FONT_FAMILY2}`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            this.drawTruncatedText(ctx, def.name, rx + 52, badgeY + badgeH / 2 + 1, badgeW - 64);
            ctx.restore();
          }
        }
        const btnY = 1144;
        const btnH = 58;
        if (this.gameMode === "roguelike") {
          this.drawStickerButton(ctx, {
            id: "rogue-new",
            x: 24,
            y: btnY,
            w: 326,
            h: btnH,
            label: "\u91CD\u5F00\u95EF\u5173",
            disabled: this.busy,
            onClick: () => this.startNewRoguelikeRun(
              Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
            )
          });
          this.drawStickerButton(ctx, {
            id: "speed",
            x: 370,
            y: btnY,
            w: 326,
            h: btnH,
            label: `\u901F\u5EA6 ${this.speed}\xD7`,
            accent: this.speed > 1,
            onClick: () => {
              this.speed = this.speed === 1 ? 2 : 1;
            }
          });
        } else {
          this.drawStickerButton(ctx, {
            id: "to-rogue",
            x: 24,
            y: btnY,
            w: 212,
            h: btnH,
            label: "\u8089\u9E3D\u95EF\u5173",
            accent: true,
            disabled: this.busy,
            onClick: () => this.startNewRoguelikeRun(
              Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
            )
          });
          this.drawStickerButton(ctx, {
            id: "new",
            x: 254,
            y: btnY,
            w: 212,
            h: btnH,
            label: "\u65B0\u68CB\u76D8",
            disabled: this.busy,
            onClick: () => this.startNewGame(Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999))
          });
          this.drawStickerButton(ctx, {
            id: "speed",
            x: 484,
            y: btnY,
            w: 212,
            h: btnH,
            label: `\u901F\u5EA6 ${this.speed}\xD7`,
            accent: this.speed > 1,
            onClick: () => {
              this.speed = this.speed === 1 ? 2 : 1;
            }
          });
        }
      }
      if (this.bannerLife > 0 && this.bannerText) {
        const alpha = Math.min(1, this.bannerLife / 0.35, (this.bannerMaxLife - this.bannerLife) / 0.15 + 0.2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        const bw = 610;
        const bh = 70;
        const bx = (VIRTUAL_W - bw) / 2;
        const by = 516;
        ctx.fillStyle = "#fff9e6";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 4.8;
        drawRoundedRect(ctx, bx, by, bw, bh, 35);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `900 28px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        this.drawCenteredIconText(ctx, this.bannerIcon, this.bannerText, VIRTUAL_W / 2, by + bh / 2 + 1, 36, 10);
        ctx.restore();
      }
      if (this.comboTracker && !this.stepWaitResolver) {
        this.renderComboTracker(ctx, this.comboTracker);
      }
      this.renderDamageFlyers(ctx);
      this.renderTurnIntro(ctx);
      if (this.showRulesModal) {
        this.renderRulesModal(ctx);
      } else if (this.showRelicsModal) {
        this.renderRelicsModal(ctx);
      } else if (this.showDebugPanel) {
        this.renderDebugPanel(ctx);
      } else if (!this.tutorial && this.gameMode === "roguelike" && this.run.phase === "reward") {
        this.renderRewardModal(ctx);
      } else if (!this.tutorial && this.gameMode === "roguelike" && (this.run.phase === "victory" || this.run.phase === "defeat")) {
        this.renderRunEndModal(ctx);
      }
      ctx.restore();
    }
    renderComboTracker(ctx, ct) {
      const exitK = ct.active ? 0 : 1 - Math.max(0, Math.min(1, ct.holdLife / 0.45));
      const enterK = Math.min(1, ct.age / 0.34);
      const alpha = Math.min(1, ct.age / 0.12) * (1 - exitK);
      if (alpha <= 0.01) return;
      const x = 24;
      const y = 114;
      const w = 672;
      const h = 94;
      const accent = ct.isPlayer ? "#e67e22" : "#dc2626";
      const tierColor = COMBO_TIER_COLORS[ct.tier];
      const combo = ct.comboShown;
      const isBlast = ct.blastWaves > 1;
      const stampColor = isBlast ? WAVE_COLORS[Math.max(0, Math.min(combo - 1, WAVE_COLORS.length - 1))] : "#d97706";
      ctx.save();
      ctx.globalAlpha = alpha;
      const slideX = (1 - easeBackOut(enterK)) * -120;
      const shakeX = Math.sin(ct.age * 90) * ct.shake * 6;
      const shakeY = Math.cos(ct.age * 70) * ct.shake * 3;
      const cardScale = 1 + 0.035 * Math.sin(ct.pulse * Math.PI);
      ctx.translate(x + w / 2 + slideX + shakeX, y + h / 2 - exitK * 36 + shakeY);
      ctx.scale(cardScale, cardScale);
      ctx.translate(-(x + w / 2), -(y + h / 2));
      if (combo >= 2) {
        const glow = 0.5 + 0.5 * Math.sin(ct.age * 9);
        ctx.save();
        ctx.globalAlpha = alpha * (0.2 + 0.25 * glow);
        ctx.strokeStyle = stampColor;
        ctx.lineWidth = 14;
        drawRoundedRect(ctx, x, y, w, h, 24);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = "rgba(78, 52, 46, 0.18)";
      drawRoundedRect(ctx, x, y + 4, w, h, 24);
      ctx.fill();
      ctx.fillStyle = ct.isPlayer ? "rgba(255, 251, 240, 0.98)" : "rgba(255, 242, 242, 0.98)";
      drawRoundedRect(ctx, x, y, w, h, 24);
      ctx.fill();
      if (combo >= 2) {
        ctx.save();
        drawRoundedRect(ctx, x, y, w, h, 24);
        ctx.clip();
        ctx.globalAlpha = alpha * 0.12;
        ctx.fillStyle = stampColor;
        const gap = 44;
        const off = ct.age * 160 % gap;
        for (let sx = x - h - gap + off; sx < x + w + gap; sx += gap) {
          ctx.beginPath();
          ctx.moveTo(sx, y + h);
          ctx.lineTo(sx + 18, y + h);
          ctx.lineTo(sx + 18 + h * 0.6, y);
          ctx.lineTo(sx + h * 0.6, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.strokeStyle = combo >= 2 ? stampColor : accent;
      ctx.lineWidth = 3.6;
      drawRoundedRect(ctx, x, y, w, h, 24);
      ctx.stroke();
      ctx.fillStyle = INK_SOFT;
      ctx.font = `800 20px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      this.drawTruncatedText(ctx, ct.actorLabel, x + 22, y + 22, 150);
      const numCy = y + 62;
      if (ct.burst > 0) {
        ctx.save();
        ctx.translate(x + 112, numCy);
        ctx.rotate(ct.age * 2.5);
        ctx.globalAlpha = alpha * ct.burst * 0.7;
        ctx.fillStyle = tierColor;
        const R = 40 + 56 * (1 - ct.burst);
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.09) * 14, Math.sin(a - 0.09) * 14);
          ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.lineTo(Math.cos(a + 0.09) * 14, Math.sin(a + 0.09) * 14);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      const dmgInt = Math.floor(ct.shownDamage + 1e-4);
      const numText = `${dmgInt}`;
      ctx.save();
      const pop = 1 + 0.2 * ct.tickPop + 0.12 * Math.sin(ct.pulse * Math.PI);
      ctx.translate(x + 22, numCy);
      ctx.rotate(-0.05 * ct.tickPop);
      ctx.scale(pop, pop);
      ctx.transform(1, 0, -0.14, 1, 0, 0);
      const hasIcon = this.drawUiIcon(ctx, "blast", 18, 0, 36);
      const tx0 = hasIcon ? 42 : 0;
      ctx.font = `900 ${numText.length >= 3 ? 44 : 52}px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const numW = ctx.measureText(numText).width;
      let numFill = tierColor;
      if (ct.tier === 3) {
        const shift = (Math.sin(ct.age * 6) + 1) / 2;
        const g = ctx.createLinearGradient(tx0, -24, tx0 + numW, 24);
        g.addColorStop(0, "#a855f7");
        g.addColorStop(0.3 + 0.4 * shift, "#ec4899");
        g.addColorStop(1, "#f59e0b");
        numFill = g;
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 12;
      ctx.strokeText(numText, tx0, 0);
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 5;
      ctx.strokeText(numText, tx0, 0);
      ctx.fillStyle = numFill;
      ctx.fillText(numText, tx0, 0);
      ctx.font = `900 26px ${FONT_FAMILY2}`;
      const ux = tx0 + numW + 6;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 7;
      ctx.strokeText("\u4F24", ux, 8);
      ctx.fillStyle = INK2;
      ctx.fillText("\u4F24", ux, 8);
      ctx.restore();
      if (combo >= 2) {
        const sl = ct.stampLife;
        const s = 1 + 1.3 * sl * sl;
        const scx = x + 222;
        const scy = y + 30;
        if (sl > 0 && sl < 0.45) {
          const k = 1 - sl / 0.45;
          ctx.save();
          ctx.globalAlpha = alpha * (1 - k) * 0.8;
          ctx.strokeStyle = stampColor;
          ctx.lineWidth = 5 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(scx, scy, 30 + 60 * k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(scx, scy);
        ctx.rotate(-0.16 - 0.5 * sl);
        ctx.scale(s, s);
        ctx.globalAlpha = alpha * (1 - 0.6 * sl);
        const bw = 92;
        const bh = 38;
        ctx.fillStyle = stampColor;
        drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 12);
        ctx.fill();
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = INK2;
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        drawRoundedRect(ctx, -bw / 2 + 4, -bh / 2 + 4, bw - 8, bh - 8, 9);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.font = `900 24px ${FONT_FAMILY2}`;
        ctx.textAlign = "right";
        ctx.fillText(`\xD7${combo}`, 4, 1);
        ctx.font = `900 16px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.fillText(isBlast ? "\u8FDE\u7206" : "\u8FDE\u9501", 6, 2);
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(78, 52, 46, 0.24)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x + 278, y + 14);
      ctx.lineTo(x + 278, y + h - 14);
      ctx.stroke();
      ctx.setLineDash([]);
      const recent = ct.logs.slice(-2);
      if (recent.length === 0) {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `800 24px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("\u653B\u51FB\u7ED3\u7B97\u4E2D...", x + 298, y + h / 2);
      } else {
        const rowH = 36;
        const startY = y + (h - recent.length * rowH) / 2 + rowH / 2;
        const slide = ct.logSlide;
        recent.forEach((entry, idx) => {
          const isLatest = idx === recent.length - 1;
          const baseY = startY + idx * rowH;
          const ry = isLatest ? baseY : baseY + rowH * slide;
          const ox = isLatest ? slide * 70 : 0;
          ctx.save();
          ctx.globalAlpha = alpha * (isLatest ? 1 - slide * 0.9 : 1);
          ctx.fillStyle = isLatest ? INK2 : INK_SOFT;
          ctx.font = `${isLatest ? "900" : "700"} 22px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          this.drawTruncatedText(ctx, entry.label, x + 298 + ox, ry, 256);
          ctx.translate(x + w - 22 + ox, ry);
          const dPop = isLatest ? 1 + 0.5 * slide : 1;
          ctx.scale(dPop, dPop);
          ctx.font = `900 ${isLatest ? 24 : 22}px ${FONT_FAMILY2}`;
          ctx.textAlign = "right";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 5;
          ctx.strokeText(entry.deltaText, 0, 0);
          ctx.fillStyle = entry.color;
          ctx.fillText(entry.deltaText, 0, 0);
          ctx.restore();
        });
      }
      if (ct.sweep >= 0 && ct.sweep < 1) {
        ctx.save();
        drawRoundedRect(ctx, x, y, w, h, 24);
        ctx.clip();
        const bx = x - 120 + (w + 240) * easeCubicInOut(ct.sweep);
        const g = ctx.createLinearGradient(bx - 70, 0, bx + 70, 0);
        g.addColorStop(0, "rgba(255, 255, 255, 0)");
        g.addColorStop(0.5, "rgba(255, 255, 255, 0.8)");
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 70 + 24, y);
        ctx.lineTo(bx + 70 + 24, y);
        ctx.lineTo(bx + 70 - 24, y + h);
        ctx.lineTo(bx - 70 - 24, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    /** 铺满整个真实屏幕的柔和暖棕遮罩，并屏蔽底层按钮穿透点击 */
    drawModalBackdrop(ctx, fillStyle = "rgba(62, 40, 32, 0.36)") {
      this.buttons = [];
      const safeScale = Math.max(0.01, this.scale);
      const left = -this.offsetX / safeScale - 4;
      const top = -this.offsetY / safeScale - 4;
      const fullW = this.platform.width / safeScale + 8;
      const fullH = this.platform.height / safeScale + 8;
      ctx.save();
      ctx.fillStyle = fillStyle;
      ctx.fillRect(left, top, fullW, fullH);
      ctx.restore();
    }
    /** 按像素宽度自动换行（兼容中英文混排） */
    wrapTextLines(ctx, text, maxWidth) {
      const lines = [];
      let current = "";
      for (const ch of text) {
        const next = current + ch;
        if (current.length > 0 && ctx.measureText(next).width > maxWidth) {
          lines.push(current);
          current = ch;
        } else {
          current = next;
        }
      }
      if (current) lines.push(current);
      return lines;
    }
    /** 单行防溢出绘制，超宽自动追加省略号 */
    drawTruncatedText(ctx, text, x, y, maxWidth) {
      if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, x, y);
        return;
      }
      let out = text;
      while (out.length > 1 && ctx.measureText(`${out}\u2026`).width > maxWidth) {
        out = out.slice(0, -1);
      }
      ctx.fillText(`${out}\u2026`, x, y);
    }
    renderRewardModal(ctx) {
      var _a, _b;
      this.drawModalBackdrop(ctx, "rgba(62, 40, 32, 0.38)");
      const clearedBoss = getBossProfile(this.run.stageIndex);
      const nextBoss = getBossProfile(this.run.stageIndex + 1);
      const w = 676;
      const x = (VIRTUAL_W - w) / 2;
      const cardW = 628;
      const cardX = x + (w - cardW) / 2;
      const baseCardH = 186;
      const gap = 18;
      ctx.save();
      ctx.font = `700 21px ${FONT_FAMILY2}`;
      const cardSpecs = this.run.rewardChoices.map((relicId) => {
        const def = getRelicDef(relicId);
        const isExpanded = this.expandedRewardRelicId === relicId;
        const detailLines = isExpanded ? this.wrapTextLines(ctx, def.detailDesc, cardW - 64) : [];
        const detailH = isExpanded ? detailLines.length * 30 + 30 : 0;
        return {
          relicId,
          def,
          isExpanded,
          detailLines,
          detailH,
          height: baseCardH + detailH
        };
      });
      ctx.restore();
      const headerH = 230;
      const cardsTotalH = cardSpecs.reduce((sum, item) => sum + item.height, 0) + Math.max(0, cardSpecs.length - 1) * gap;
      const h = headerH + cardsTotalH + 28;
      const y = Math.max(30, Math.round((VIRTUAL_H - h) / 2));
      ctx.save();
      ctx.fillStyle = "rgba(78, 52, 46, 0.24)";
      drawRoundedRect(ctx, x, y + 8, w, h, 32);
      ctx.fill();
      ctx.fillStyle = "#fff9ee";
      drawRoundedRect(ctx, x, y, w, h, 32);
      ctx.fill();
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, 32);
      ctx.clip();
      ctx.fillStyle = "#ffefc8";
      ctx.fillRect(x, y, w, 132);
      ctx.strokeStyle = "rgba(217, 119, 6, 0.24)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 132);
      ctx.lineTo(x + w - 24, y + 132);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4.5;
      drawRoundedRect(ctx, x, y, w, h, 32);
      ctx.stroke();
      ctx.fillStyle = "#c2610c";
      ctx.font = `900 38px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      this.drawCenteredIconText(
        ctx,
        "trophy",
        `\u51FB\u8D25 ${clearedBoss.name}\uFF01`,
        VIRTUAL_W / 2,
        y + 48,
        44,
        10
      );
      ctx.fillStyle = INK_SOFT;
      ctx.font = `800 24px ${FONT_FAMILY2}`;
      ctx.fillText(
        `\u56DE +${STAGE_CLEAR_HEAL} \u8840 \xB7 \u9009 1 \u4E2A\u795D\u798F`,
        VIRTUAL_W / 2,
        y + 100
      );
      const previewX = cardX;
      const previewY = y + 146;
      const previewW = cardW;
      const previewH = 68;
      ctx.fillStyle = "#fffdf7";
      ctx.strokeStyle = nextBoss.accentColor;
      ctx.lineWidth = 2.8;
      drawRoundedRect(ctx, previewX, previewY, previewW, previewH, 22);
      ctx.fill();
      ctx.stroke();
      const bossAvatar = this.assets.bosses[nextBoss.id];
      if (bossAvatar.ready) {
        ctx.drawImage(bossAvatar.el, previewX + 10, previewY + 6, 56, 56);
      }
      ctx.fillStyle = nextBoss.accentColor;
      ctx.font = `900 23px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `\u7B2C ${nextBoss.stage} \u5173 \xB7 ${nextBoss.name}`,
        previewX + 76,
        previewY + 23
      );
      ctx.fillStyle = INK_SOFT;
      ctx.font = `800 20px ${FONT_FAMILY2}`;
      this.drawTruncatedText(ctx, nextBoss.traitShort, previewX + 76, previewY + 50, previewW - 92);
      const branchBgMap = {
        blast: "#fff0f0",
        merge: "#fff8db",
        collapse: "#e8fbf2"
      };
      let cy = y + headerH;
      for (const spec of cardSpecs) {
        const { relicId, def, isExpanded, detailLines, detailH, height: cardH } = spec;
        this.buttons.push({
          id: `reward-${relicId}`,
          x: cardX,
          y: cy,
          w: cardW,
          h: cardH,
          label: def.name,
          onClick: () => this.chooseRewardRelic(relicId)
        });
        ctx.save();
        ctx.fillStyle = "rgba(78, 52, 46, 0.16)";
        drawRoundedRect(ctx, cardX, cy + 5, cardW, cardH, 24);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
        ctx.fill();
        ctx.save();
        drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
        ctx.clip();
        ctx.fillStyle = def.badgeColor;
        ctx.fillRect(cardX, cy, 12, cardH);
        ctx.restore();
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 3.8;
        drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
        ctx.stroke();
        const iconCx = cardX + 72;
        const iconCy = cy + 93;
        ctx.fillStyle = (_a = branchBgMap[def.branch]) != null ? _a : "#fff4e6";
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(78, 52, 46, 0.14)";
        ctx.lineWidth = 2;
        ctx.stroke();
        const icon = this.assets.relics[def.branch];
        if (icon.ready) {
          ctx.drawImage(icon.el, iconCx - 41, iconCy - 41, 82, 82);
        } else {
          ctx.fillStyle = def.badgeColor;
          ctx.beginPath();
          ctx.arc(iconCx, iconCy, 34, 0, Math.PI * 2);
          ctx.fill();
        }
        const roleX = cardX + 134;
        const roleY = cy + 24;
        const roleW = 76;
        const roleH = 36;
        ctx.fillStyle = def.roleColor;
        drawRoundedRect(ctx, roleX, roleY, roleW, roleH, 18);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 20px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(def.roleLabel, roleX + roleW / 2, roleY + roleH / 2 + 1);
        ctx.fillStyle = INK2;
        ctx.font = `900 32px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        this.drawTruncatedText(ctx, def.name, roleX + roleW + 12, roleY + roleH / 2 + 1, cardW - 300);
        ctx.fillStyle = INK2;
        ctx.font = `800 26px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        this.drawTruncatedText(ctx, def.shortDesc, roleX, cy + 98, cardW - 154);
        ctx.fillStyle = "#f5ece0";
        drawRoundedRect(ctx, roleX, cy + 132, 92, 34, 17);
        ctx.fill();
        ctx.fillStyle = INK_SOFT;
        ctx.font = `800 18px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(def.branchLabel, roleX + 46, cy + 150);
        const pickW = 136;
        const pickH = 38;
        const pickX = cardX + cardW - pickW - 18;
        const pickY = cy + 130;
        ctx.fillStyle = (_b = branchBgMap[def.branch]) != null ? _b : "#fff4e6";
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 2.6;
        drawRoundedRect(ctx, pickX, pickY, pickW, pickH, 19);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `900 21px ${FONT_FAMILY2}`;
        ctx.fillText("\u9009\u62E9\u795D\u798F", pickX + pickW / 2, pickY + pickH / 2 + 1);
        if (isExpanded && detailH > 0) {
          const boxX = cardX + 24;
          const boxY = cy + baseCardH - 4;
          const boxW = cardW - 44;
          const boxH = detailH - 12;
          ctx.fillStyle = "#fdf4e3";
          ctx.strokeStyle = "rgba(78, 52, 46, 0.2)";
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = INK_SOFT;
          ctx.font = `700 21px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          detailLines.forEach((line, li) => {
            ctx.fillText(line, boxX + 16, boxY + 24 + li * 30);
          });
        }
        const infoSize = 46;
        const infoX = cardX + cardW - infoSize - 16;
        const infoY = cy + 18;
        this.buttons.push({
          id: `reward-info-${relicId}`,
          x: infoX - 4,
          y: infoY - 4,
          w: infoSize + 8,
          h: infoSize + 8,
          label: isExpanded ? "\u6536\u8D77\u8BE6\u60C5" : "\u67E5\u770B\u8BE6\u60C5",
          onClick: () => {
            this.expandedRewardRelicId = isExpanded ? null : relicId;
          }
        });
        ctx.fillStyle = isExpanded ? "#ffe49e" : "#f7efe3";
        ctx.strokeStyle = INK2;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(infoX + infoSize / 2, infoY + infoSize / 2, infoSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `900 ${isExpanded ? 26 : 24}px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isExpanded ? "\xD7" : "?", infoX + infoSize / 2, infoY + infoSize / 2 + 1);
        ctx.restore();
        cy += cardH + gap;
      }
      ctx.restore();
    }
    renderRelicsModal(ctx) {
      this.drawModalBackdrop(ctx, "rgba(62, 40, 32, 0.36)");
      const x = 32;
      const y = 188;
      const w = 656;
      const h = 760;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4.5;
      drawRoundedRect(ctx, x, y, w, h, 28);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `900 30px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`\u5DF2\u6536\u96C6\u7684\u795D\u798F (${this.run.relics.length})`, x + 28, y + 58);
      if (this.run.relics.length === 0) {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `700 22px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.fillText("\u5C1A\u672A\u83B7\u5F97\u795D\u798F\uFF0C\u51FB\u8D25 Boss \u540E\u5373\u53EF 3 \u9009 1\uFF01", VIRTUAL_W / 2, y + 340);
      } else {
        let cy = y + 92;
        for (const id of this.run.relics) {
          const def = getRelicDef(id);
          ctx.save();
          ctx.font = `600 18px ${FONT_FAMILY2}`;
          const detailLines = this.wrapTextLines(ctx, def.detailDesc, w - 188);
          const cardH = Math.max(146, 94 + detailLines.length * 26);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = def.badgeColor;
          ctx.lineWidth = 3.2;
          drawRoundedRect(ctx, x + 22, cy, w - 44, cardH, 20);
          ctx.fill();
          ctx.stroke();
          const icon = this.assets.relics[def.branch];
          if (icon.ready) {
            ctx.drawImage(icon.el, x + 36, cy + Math.round((cardH - 84) / 2), 84, 84);
          }
          ctx.fillStyle = def.roleColor;
          drawRoundedRect(ctx, x + 134, cy + 20, 68, 30, 15);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = `900 16px ${FONT_FAMILY2}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(def.roleLabel, x + 168, cy + 36);
          ctx.fillStyle = INK2;
          ctx.font = `900 24px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.fillText(def.name, x + 212, cy + 36);
          ctx.fillStyle = INK_SOFT;
          ctx.font = `700 16px ${FONT_FAMILY2}`;
          ctx.textAlign = "right";
          ctx.fillText(def.branchLabel, x + w - 40, cy + 36);
          ctx.fillStyle = INK2;
          ctx.font = `800 19px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          this.drawTruncatedText(ctx, def.shortDesc, x + 134, cy + 72, w - 180);
          ctx.fillStyle = INK_SOFT;
          ctx.font = `600 18px ${FONT_FAMILY2}`;
          detailLines.forEach((line, idx) => {
            ctx.fillText(line, x + 134, cy + 104 + idx * 26);
          });
          ctx.restore();
          cy += cardH + 16;
        }
      }
      this.drawStickerButton(ctx, {
        id: "close-relics",
        x: VIRTUAL_W / 2 - 110,
        y: y + h - 78,
        w: 220,
        h: 54,
        label: "\u5173\u95ED",
        accent: true,
        onClick: () => {
          this.showRelicsModal = false;
        }
      });
    }
    renderRunEndModal(ctx) {
      const isWin = this.run.phase === "victory";
      this.drawModalBackdrop(ctx, "rgba(62, 40, 32, 0.38)");
      const x = 44;
      const y = 236;
      const w = 632;
      const h = 668;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = isWin ? "#d97706" : "#dc2626";
      ctx.lineWidth = 5;
      drawRoundedRect(ctx, x, y, w, h, 30);
      ctx.fill();
      ctx.stroke();
      const boss = getBossProfile(this.run.stageIndex);
      const avatar = isWin ? this.assets.avatarP1 : this.assets.bosses[boss.id];
      if (avatar.ready) {
        ctx.drawImage(avatar.el, VIRTUAL_W / 2 - 70, y + 26, 140, 140);
      }
      ctx.fillStyle = isWin ? "#b45309" : "#b91c1c";
      ctx.font = `900 34px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      this.drawCenteredIconText(
        ctx,
        isWin ? "trophy" : "paw",
        isWin ? "\u732B\u5C4B\u5927\u6377 \xB7 \u5168\u901A\u5173\uFF01" : "\u88AB\u732B\u732B\u6320\u8DB4\u5566",
        VIRTUAL_W / 2,
        y + 206,
        42,
        10
      );
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 21px ${FONT_FAMILY2}`;
      ctx.fillText(
        isWin ? "\u4F60\u51FB\u8D25\u4E86\u5927\u6A58\u3001\u5976\u725B\u732B\u4E0E\u7EC8\u6781\u732B\u738B\u54C8\u57FA\u7C73\uFF01" : `\u6B62\u6B65\u4E8E\u7B2C ${boss.stage} \u5173 \xB7 ${boss.name}`,
        VIRTUAL_W / 2,
        y + 258
      );
      ctx.fillStyle = "#f7ebd9";
      ctx.strokeStyle = "rgba(78, 52, 46, 0.25)";
      ctx.lineWidth = 2.4;
      drawRoundedRect(ctx, x + 32, y + 292, w - 64, 214, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `800 22px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.fillText(`\u2022 \u603B\u51FA\u62DB\u56DE\u5408\uFF1A${this.run.totalTurns} \u56DE\u5408`, x + 56, y + 340);
      ctx.fillText(`\u2022 \u5355\u56DE\u5408\u6700\u9AD8\u7206\u53D1\uFF1A${this.run.bestTurnDamage} \u4F24\u5BB3`, x + 56, y + 386);
      const relicNames = this.run.relics.length > 0 ? this.run.relics.map((id) => getRelicDef(id).name).join(" / ") : "\u65E0";
      this.drawTruncatedText(ctx, `\u2022 \u6536\u96C6\u795D\u798F\uFF1A${relicNames}`, x + 56, y + 432, w - 112);
      ctx.fillText(`\u2022 \u5269\u4F59\u751F\u547D\uFF1A${this.run.playerHp} / ${this.run.playerMaxHp}`, x + 56, y + 478);
      this.drawStickerButton(ctx, {
        id: "run-again",
        x: VIRTUAL_W / 2 - 130,
        y: y + h - 98,
        w: 260,
        h: 60,
        label: isWin ? "\u518D\u6765\u4E00\u5C40" : "\u91CD\u65B0\u6311\u6218",
        accent: true,
        onClick: () => this.startNewRoguelikeRun(
          Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
        )
      });
    }
    renderRulesModal(ctx) {
      this.drawModalBackdrop(ctx, "rgba(62, 40, 32, 0.36)");
      const x = 28;
      const y = 176;
      const w = 664;
      const h = 768;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4.5;
      drawRoundedRect(ctx, x, y, w, h, 30);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `900 36px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("\u600E\u4E48\u73A9 \xB7 30 \u79D2\u770B\u61C2", x + 32, y + 66);
      const tips = [
        {
          tag: "1. \u5408\u5927\u732B",
          color: "#d97706",
          desc: "\u62D6\u52A8\u76F8\u90BB\u732B\u51D1 3 \u8FDE\u5408\u6210 2 \u7EA7\u5927\u732B\uFF1B4 \u8FDE\u5408 2 \u53EA\uFF0C5 \u8FDE\u5408\u70AB\u5F69\u732B\uFF01"
        },
        {
          tag: "2. \u723D\u8FDE\u7206",
          color: "#e54d42",
          desc: "\u7528\u5927\u732B\u51D1 3 \u8FDE\u4F1A\u70B8\u4E00\u5708 + \u55B7\u5BBD\u5149\u675F\uFF0C\u6CE2\u53CA\u522B\u7684\u5927\u732B\u8FD8\u4F1A\u8FDE\u9501\u7206\uFF01"
        },
        {
          tag: "3. \u9009\u795D\u798F",
          color: "#2563eb",
          desc: "\u4E0E Boss \u8F6E\u6D41\u884C\u52A8\uFF0C\u8FC7\u5173\u56DE\u8840\u5E76 3 \u9009 1 \u795D\u798F\uFF1B\u62BD\u5230\u300C\u732B\u987B\u96F7\u8FBE\u300D\u89E3\u9501\u6325\u722A\u63D0\u793A\u3002"
        }
      ];
      let cy = y + 116;
      for (const tip of tips) {
        ctx.fillStyle = tip.color;
        ctx.font = `900 26px ${FONT_FAMILY2}`;
        ctx.fillText(tip.tag, x + 32, cy);
        cy += 38;
        ctx.fillStyle = INK2;
        ctx.font = `700 24px ${FONT_FAMILY2}`;
        const wrapped = this.wrapTextLines(ctx, tip.desc, w - 68);
        for (const line of wrapped) {
          ctx.fillText(line, x + 32, cy);
          cy += 36;
        }
        cy += 22;
      }
      const btnY = y + h - 86;
      const btnH = 58;
      this.drawStickerButton(ctx, {
        id: "replay-tutorial",
        x: x + 28,
        y: btnY,
        w: 186,
        h: btnH,
        label: "\u91CD\u73A9\u6559\u5B66",
        disabled: this.busy,
        onClick: () => {
          this.showRulesModal = false;
          this.startTutorial();
        }
      });
      const modeLabel = this.gameMode === "roguelike" ? "\u53CC\u4EBA\u6A21\u5F0F" : "\u8089\u9E3D\u95EF\u5173";
      this.drawStickerButton(ctx, {
        id: "switch-mode-in-rules",
        x: x + 234,
        y: btnY,
        w: 186,
        h: btnH,
        label: modeLabel,
        disabled: this.busy,
        onClick: () => {
          this.showRulesModal = false;
          const seed = Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999);
          if (this.gameMode === "roguelike") {
            this.startNewGame(seed);
          } else {
            this.startNewRoguelikeRun(seed);
          }
        }
      });
      this.drawStickerButton(ctx, {
        id: "close-rules",
        x: x + 440,
        y: btnY,
        w: 196,
        h: btnH,
        label: "\u77E5\u9053\u4E86",
        accent: true,
        onClick: () => {
          this.showRulesModal = false;
        }
      });
    }
    renderDebugPanel(ctx) {
      this.drawModalBackdrop(ctx, "rgba(62, 40, 32, 0.36)");
      const x = 36;
      const y = 210;
      const w = 648;
      const h = 760;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4;
      drawRoundedRect(ctx, x, y, w, h, 24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `900 26px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("\u5B9E\u9A8C\u53F0 \xB7 \u6838\u5FC3\u6D4B\u8BD5\u5C40\u9762\uFF08\u5B8C\u6574 17 \u5C40\u9762\u89C1 lab.html\uFF09", x + 28, y + 50);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 18px ${FONT_FAMILY2}`;
      ctx.fillText("\u70B9\u51FB\u4EE5\u4E0B\u6838\u5FC3\u5C40\u9762\u8F7D\u5165\uFF08\u91D1\u8272\u7BAD\u5934\u6307\u793A\u63A8\u8350\u4EA4\u6362\uFF09\uFF1A", x + 28, y + 84);
      const featured = [0, 9, 10, 12, 1, 7, 11, 15];
      const colW = 286;
      const rowH = 48;
      for (let idx = 0; idx < featured.length; idx++) {
        const i = featured[idx];
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = x + 28 + col * (colW + 20);
        const by = y + 106 + row * (rowH + 14);
        this.drawStickerButton(ctx, {
          id: `fixture-${i}`,
          x: bx,
          y: by,
          w: colW,
          h: rowH,
          label: FIXTURE_NAMES[i],
          disabled: this.busy,
          accent: this.state.fixture === i,
          onClick: () => {
            this.loadState(loadFixture(i));
            this.showDebugPanel = false;
          }
        });
      }
      const toolY = y + 372;
      this.drawStickerButton(ctx, {
        id: "undo",
        x: x + 28,
        y: toolY,
        w: 286,
        h: 48,
        label: "\u6062\u590D\u4E0A\u56DE\u5408\u5F00\u59CB",
        disabled: this.busy,
        onClick: () => this.undoTurn()
      });
      this.drawStickerButton(ctx, {
        id: "step-mode",
        x: x + 334,
        y: toolY,
        w: 286,
        h: 48,
        label: `\u9010\u8F6E\u6A21\u5F0F\uFF1A${this.stepEnabled ? "\u5F00" : "\u5173"}`,
        accent: this.stepEnabled,
        onClick: () => {
          this.stepEnabled = !this.stepEnabled;
        }
      });
      const statY = toolY + 74;
      ctx.fillStyle = "#f7ebd9";
      ctx.strokeStyle = "rgba(78, 52, 46, 0.25)";
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x + 28, statY, w - 56, 134, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `700 18px ${FONT_FAMILY2}`;
      ctx.fillText(
        `\u79CD\u5B50\uFF1A${this.state.seed}   \xB7   \u56DE\u5408\uFF1A${this.state.turn}   \xB7   \u5408\u6CD5\u4EA4\u6362\uFF1A${this.legalCount}`,
        x + 44,
        statY + 36
      );
      if (this.lastSummary) {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 17px ${FONT_FAMILY2}`;
        ctx.fillText(
          `\u4E0A\u6B21\u64CD\u4F5C\uFF1A\u9996\u8F6E ${this.lastSummary.directDamage} \u4F24\uFF0C\u603B\u8BA1 ${this.lastSummary.totalDamage} \u4F24\uFF08${this.lastSummary.rounds} \u8F6E\uFF09`,
          x + 44,
          statY + 74
        );
        ctx.fillText(
          `\u6536\u7F29\u540E\u786E\u5B9A\u6027\u5339\u914D\uFF1A${this.lastSummary.deterministicMatches}   \xB7   \u5BF9\u624B\u6700\u5927\u76F4\u63A5\u4F24\u5BB3\uFF1A${this.lastSummary.opponentBest}`,
          x + 44,
          statY + 108
        );
      } else {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 17px ${FONT_FAMILY2}`;
        ctx.fillText("\u5B8C\u6210\u4E00\u6B21\u4EA4\u6362\u540E\uFF0C\u8FD9\u91CC\u5C06\u663E\u793A\u4F24\u5BB3\u4E0E\u8FDE\u9501\u7EDF\u8BA1\u3002", x + 44, statY + 80);
      }
      this.drawStickerButton(ctx, {
        id: "close-debug",
        x: VIRTUAL_W / 2 - 96,
        y: y + h - 70,
        w: 192,
        h: 48,
        label: "\u5173\u95ED",
        onClick: () => {
          this.showDebugPanel = false;
        }
      });
    }
  };

  // src/main.ts
  var platform = createPlatform();
  var app = new CatBoomApp(platform);
  app.start();
})();
