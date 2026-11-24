"use strict";
(() => {
  // src/platform.ts
  function createPlatform() {
    const isWechat = typeof wx !== "undefined" && typeof wx.createCanvas === "function";
    let canvas;
    let width;
    let height;
    let dpr;
    let topInset = 0;
    if (isWechat && wx) {
      canvas = wx.createCanvas();
      const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
      width = info.windowWidth;
      height = info.windowHeight;
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
        var _a;
        pointerActive = true;
        (_a = canvas.setPointerCapture) == null ? void 0 : _a.call(canvas, e.pointerId);
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
      bg: loadImage("assets/bg_catroom.jpg"),
      avatarP1: loadImage("assets/ui/avatar_p1.png"),
      avatarP2: loadImage("assets/ui/avatar_p2.png"),
      cats: [0, 1, 2, 3].map((color) => ({
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

  // src/catRender.ts
  var CAT_PALETTE = ["#ffb870", "#a9a6f8", "#8cd9b3", "#f9a9be"];
  var ANIM_FRAME_SIZE = 192;
  var ANIM_FRAME_COUNT = 10;
  var INK = "#4e342e";
  var FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';
  function pickCatAnimFrame(animState, elapsed, seedOffset = 0, grabElapsed = 0) {
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
      animState = "idle",
      seedOffset = 0,
      grabElapsed = 0,
      flipX = false,
      forceFrame
    } = opts;
    const idx = (colorId % 4 + 4) % 4;
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
  var COLORS = 4;
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
        const colors = [0, 1, 2, 3];
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
      name: "\u5927\u6A58\xB7\u5E72\u996D\u738B",
      title: "\u7B2C 1 \u5173 \xB7 \u8D2A\u5403\u6A58\u732B",
      tagline: "\u5341\u53EA\u6A58\u732B\u4E5D\u53EA\u80D6\uFF0C\u89C1\u6A58\u5C31\u62A2\uFF01",
      maxHp: 75,
      skillPeriod: 0,
      traitShort: "\u4E13\u62A2\u6A58\u732B \xB7 \u6BCF\u6D881\u53EA\u6A58\u732B\u56DE1\u8840(\u4E0A\u9650+8)",
      accentColor: "#e67e22",
      barFillColor: "#ffd199"
    },
    {
      id: "cow",
      stage: 2,
      name: "\u5976\u725B\u732B\xB7\u5348\u591C\u53D1\u766B\u738B",
      title: "\u7B2C 2 \u5173 \xB7 \u732B\u4E2D\u54C8\u58EB\u5947",
      tagline: "\u51CC\u6668\u4E09\u70B9\u8DD1\u9177\uFF0C\u89C1\u5927\u732B\u5C31\u70B8\uFF01",
      maxHp: 95,
      skillPeriod: 2,
      traitShort: "\u4E13\u70B8\u5927\u732B \xB7 \u6BCF2\u56DE\u5408\u8DD1\u9177\u628A1\u53EA\u5C0F\u732B\u53D8\u5927\u732B",
      accentColor: "#3d383b",
      barFillColor: "#cbd5e1"
    },
    {
      id: "hakimi",
      stage: 3,
      name: "\u54C8\u57FA\u7C73\xB7\u732B\u738B\u672C\u5C0A",
      title: "\u7B2C 3 \u5173 \xB7 \u7EC8\u6781\u732B\u738B",
      tagline: "\u4F18\u96C5\u538B\u8FEB\u611F\uFF0C\u5168\u573A\u6211\u8BF4\u4E86\u7B97\uFF01",
      maxHp: 120,
      skillPeriod: 2,
      traitShort: "\u9AD8\u4F24\u62A2\u7206 \xB7 \u6BCF2\u56DE\u5408\u54C8\u6C14\u53E08\u76FE+\u90201\u5927\u732B",
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
      name: "\u8FDE\u73AF\u96F7\u7BA1",
      shortDesc: "\u4E8C\u6B21\u5F15\u7206\u6BCF\u6CE2 +5 \u4F24",
      detailDesc: "\u89E6\u53D1\u8FDE\u9501\u4E8C\u6B21\u5F15\u7206\uFF08Wave 1+\uFF09\u65F6\uFF0C\u6BCF\u591A 1 \u6CE2\u989D\u5916\u9020\u6210 +5 \u70B9\u7206\u7834\u4F24\u5BB3\u3002",
      badgeColor: "#ff6b6b"
    },
    {
      id: "wide_overdrive",
      branch: "blast",
      branchLabel: "\u7206\u7834\u6D41",
      name: "\u8FC7\u8F7D\u5BBD\u5149\u675F",
      shortDesc: "\u5927\u732B\u5149\u675F\u5C04\u7A0B +1",
      detailDesc: "\u4F60\u7684 2 \u7EA7\u5927\u732B\u5BBD\u5149\u675F\u5C04\u7A0B +1\uFF08\u6700\u5927\u5C04\u7A0B\u63D0\u5347\u81F3 5 \u683C\uFF09\uFF0C\u8F7B\u677E\u5F15\u71C3\u5168\u573A\u3002",
      badgeColor: "#ff8787"
    },
    {
      id: "aftershock_paw",
      branch: "blast",
      branchLabel: "\u7206\u7834\u6D41",
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
      name: "\u8089\u57AB\u62A4\u76FE",
      shortDesc: "\u5408\u5927\u732B +6 \u76FE \xB7 \u5408\u70AB\u5F69 +15 \u76FE",
      detailDesc: "\u6BCF\u5408\u6210 1 \u53EA 2 \u7EA7\u5927\u732B\u83B7\u5F97 +6 \u62A4\u76FE\uFF0C\u5408\u6210 3 \u7EA7\u70AB\u5F69\u732B\u83B7\u5F97 +15 \u62A4\u76FE\u3002",
      badgeColor: "#f5b82e"
    },
    {
      id: "double_kibble",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      name: "\u53CC\u500D\u732B\u7CAE",
      shortDesc: "\u5408\u6210\u57FA\u7840\u4F24\u5BB3\u7FFB\u500D",
      detailDesc: "\u4F60\u7684\u7EAF\u5C0F\u732B\u5408\u6210\u4E0E\u5168 2 \u661F\u5408\u6210\u9020\u6210\u7684\u57FA\u7840\u4F24\u5BB3\u7FFB\u500D\uFF083 \u8FDE 4 \u4F24\uFF0C\u4E09 2 \u661F 12 \u4F24\uFF09\u3002",
      badgeColor: "#f59f00"
    },
    {
      id: "calm_defuse",
      branch: "merge",
      branchLabel: "\u5408\u6210\u6D41",
      name: "\u4EE5\u5C0F\u535A\u5927",
      shortDesc: "\u5408\u6210\u540E\u4E0B\u56DE\u5408\u51CF\u4F24 30%",
      detailDesc: "\u672C\u56DE\u5408\u53EA\u8981\u5408\u6210\u51FA\u5927\u732B\u6216\u70AB\u5F69\u732B\uFF0C\u4E0B\u4E2A Boss \u56DE\u5408\u4F60\u53D7\u5230\u7684\u4F24\u5BB3\u51CF\u514D 30%\u3002",
      badgeColor: "#eab308"
    },
    // 🌀 收缩流
    {
      id: "gravity_vortex",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      name: "\u5F15\u529B\u6F29\u6DA1",
      shortDesc: "\u6536\u7F29\u6BCF\u79FB\u52A8 1 \u732B +1 \u4F24",
      detailDesc: "\u7EAF\u5408\u6210\u89E6\u53D1\u5B9A\u5411\u6536\u7F29\u65F6\uFF0C\u6BCF\u6709 1 \u53EA\u732B\u53D1\u751F\u4F4D\u79FB\uFF0C\u989D\u5916\u5BF9 Boss \u9020\u6210 +1 \u70B9\u6324\u538B\u4F24\u5BB3\u3002",
      badgeColor: "#38b583"
    },
    {
      id: "catnip_combo",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      name: "\u732B\u8584\u8377\u8FDE\u51FB",
      shortDesc: "\u8FDE\u9501\u52A0\u4F24\u7FFB\u500D (+4/+8/+12)",
      detailDesc: "\u4F60\u7684\u591A\u8F6E\u8FDE\u9501\u52A0\u4F24\u7FFB\u500D\uFF0C\u7B2C 2/3/4 \u8F6E\u989D\u5916\u4F24\u5BB3\u53D8\u4E3A +4 / +8 / +12\u3002",
      badgeColor: "#20c997"
    },
    {
      id: "combo_heal",
      branch: "collapse",
      branchLabel: "\u6536\u7F29\u6D41",
      name: "\u987A\u624B\u7275\u732B",
      shortDesc: "\u8FDE\u9501\u7B2C 2 \u8F6E\u8D77\u6BCF\u6B21\u56DE 5 \u8840",
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
  function createStageGameState(run) {
    const boss = getBossProfile(run.stageIndex);
    const stageSeed = run.seed + run.stageIndex * 9973 + 17;
    const st = newGame(stageSeed);
    st.hp = [run.playerHp, boss.maxHp];
    st.maxHp = [run.playerMaxHp, boss.maxHp];
    st.shield = [run.playerShield, run.bossShield];
    st.player = 0;
    return st;
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
    const skillText = boss.id === "orange" ? "\u88AB\u52A8\uFF1A\u6D88\u6A58\u732B\u56DE\u8840" : boss.id === "cow" ? skillReady ? "\u26A1 \u672C\u56DE\u5408\u8DD1\u9177\uFF1A\u53D8 1 \u53EA\u5927\u732B" : "\u8DD1\u9177\u5145\u80FD\u4E2D\uFF08\u4E0B\u56DE\u5408\u53D1\u766B\uFF09" : skillReady ? "\u{1F451} \u672C\u56DE\u5408\u54C8\u6C14\uFF1A+8 \u76FE + \u9020 1 \u5927\u732B" : "\u732B\u738B\u84C4\u529B\u4E2D\uFF08\u4E0B\u56DE\u5408\u54C8\u6C14\uFF09";
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
    let actionDesc = "\u51C6\u5907\u53D1\u8D77\u8FDB\u653B";
    if (boss.id === "orange" && chosen.orangeCount > 0) {
      const estHeal = Math.min(8, chosen.orangeCount);
      actionDesc = chosen.hasBlast ? `\u62A2\u7206\u6A58\u732B\u5927\u62DB\uFF01(\u7EA6 ${chosen.damage} \u4F24 + \u56DE ${estHeal} \u8840)` : `\u62A2\u5403\u6A58\u732B\u5408\u5927\u732B (\u7EA6 ${chosen.damage} \u4F24 + \u56DE ${estHeal} \u8840)`;
    } else if (chosen.hasBlast) {
      actionDesc = `\u9501\u5B9A\u62A2\u7206\u4F60\u7684\u5927\u732B\uFF01(\u7EA6 ${chosen.damage} \u4F24)`;
    } else if (chosen.hasMerge) {
      actionDesc = `\u51C6\u5907\u5408\u6210\u5927\u732B\u57CB\u96F7 (\u7EA6 ${chosen.damage} \u4F24)`;
    } else {
      actionDesc = `\u9884\u8BA1\u9020\u6210 ${chosen.damage} \u4F24`;
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
    const banner = boss.id === "cow" ? upgradedCell >= 0 ? "\u26A1 \u5976\u725B\u732B\u5348\u591C\u8DD1\u9177\uFF01\u628A 1 \u53EA\u5C0F\u732B\u5413\u6210\u4E86 2 \u7EA7\u5927\u732B\uFF01" : "\u26A1 \u5976\u725B\u732B\u5348\u591C\u8DD1\u9177\u6251\u4E86\u4E2A\u7A7A\uFF01" : upgradedCell >= 0 ? `\u{1F451} \u54C8\u57FA\u7C73\u732B\u738B\u54C8\u6C14\uFF01\u83B7\u5F97 +${shieldGained} \u62A4\u76FE\u5E76\u50AC\u751F 1 \u53EA\u5927\u732B\uFF01` : `\u{1F451} \u54C8\u57FA\u7C73\u732B\u738B\u54C8\u6C14\uFF01\u83B7\u5F97 +${shieldGained} \u62A4\u76FE\uFF01`;
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
  var NEST_RIM_COLORS = ["#ffd8ad", "#ddd3fc", "#ccecd4", "#ffd0de"];
  var NEST_EMPTY_RIM = "#f4e2c8";
  var NEST_BIG_RIM = "#ffea9c";
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
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.legalCount = 0;
      this.lastSummary = null;
      this.selected = -1;
      this.previewTarget = -1;
      this.preview = { valid: false };
      this.currentEvent = null;
      this.statusText = "";
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
      this.bossIntent = null;
      this.bossHighlightSwap = null;
      this.hintSet = { highValue: [], fallback: null };
      this.idleSeconds = 0;
      // 控制选项
      this.busy = false;
      this.speed = 1;
      this.shakeEnabled = true;
      this.stepEnabled = false;
      this.stepWaitResolver = null;
      this.showRulesModal = false;
      this.showDebugPanel = false;
      this.showRelicsModal = false;
      // 渲染实体与动画
      this.visuals = /* @__PURE__ */ new Map();
      this.ghosts = [];
      this.floatings = [];
      this.tweens = [];
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.bannerText = "";
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
      this.startNewRoguelikeRun(Math.floor(Date.now() % 1e6));
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
      const availH = Math.max(240, this.platform.height - this.platform.topInset);
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
    showBanner(text, duration = 1.6) {
      this.bannerText = text;
      this.bannerMaxLife = duration;
      this.bannerLife = duration;
    }
    isInputBlocked() {
      if (this.busy) return true;
      if (this.showRulesModal || this.showDebugPanel || this.showRelicsModal) return true;
      if (this.gameMode === "roguelike") {
        if (this.run.phase !== "battle" || this.state.player !== 0) return true;
      }
      return this.state.winner >= 0;
    }
    getCurrentModifiers(forPlayer) {
      if (this.gameMode !== "roguelike") return void 0;
      return forPlayer === 0 ? buildPlayerModifiers(this.run.relics) : buildBossModifiers(this.run);
    }
    startNewRoguelikeRun(seed) {
      if (this.busy) return;
      this.gameMode = "roguelike";
      this.showDebugPanel = false;
      this.showRelicsModal = false;
      this.run = createRoguelikeRun(seed);
      this.startCurrentStage();
    }
    startCurrentStage() {
      this.run.bossShield = 0;
      this.run.bossTurnsTaken = 0;
      this.run.calmDefuseActive = false;
      this.run.phase = "battle";
      this.bossHighlightSwap = null;
      const stageState = createStageGameState(this.run);
      this.loadState(stageState);
      const boss = getBossProfile(this.run.stageIndex);
      this.showBanner(`\u7B2C ${boss.stage}/3 \u5173 \xB7 ${boss.name} \u767B\u573A\uFF01`, 1.8);
      this.refreshPlayerTurnGuides();
    }
    chooseRewardRelic(id) {
      if (this.gameMode !== "roguelike" || this.run.phase !== "reward") return;
      this.run.relics.push(id);
      this.run.rewardChoices = [];
      this.run.stageIndex += 1;
      this.startCurrentStage();
    }
    refreshPlayerTurnGuides() {
      this.idleSeconds = 0;
      this.hintSet = computeHintSwaps(this.state, this.getCurrentModifiers(0));
      if (this.gameMode === "roguelike" && this.run.phase === "battle" && this.state.winner < 0) {
        const boss = getBossProfile(this.run.stageIndex);
        const mult = this.run.calmDefuseActive ? 0.7 : 1;
        this.bossIntent = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult);
        this.statusText = `${boss.name}\u610F\u56FE\uFF1A${this.bossIntent.headline}`;
      } else {
        this.bossIntent = null;
      }
    }
    startNewGame(seed) {
      if (this.busy) return;
      this.gameMode = "pvp";
      this.bossIntent = null;
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
      this.legalCount = findLegalSwaps(this.state).length;
      this.syncVisuals(this.state.board);
      this.statusText = this.state.fixture !== void 0 ? `\u5B9E\u9A8C\uFF1A${FIXTURE_NAMES[this.state.fixture]} \xB7 \u6309\u91D1\u8272\u7BAD\u5934\u4EA4\u6362` : "\u70B9\u51FB\u6216\u62D6\u52A8\u76F8\u90BB\u732B\u732B\u4EA4\u6362\u4F4D\u7F6E";
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
      this.legalCount = findLegalSwaps(this.state).length;
      this.syncVisuals(this.state.board);
      this.statusText = `\u5DF2\u6062\u590D\u7B2C ${this.state.turn} \u56DE\u5408\u5F00\u59CB\u72B6\u6001`;
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
        this.idleSeconds = 0;
        const cell = this.hitCell(x, y);
        this.dragStartCell = cell;
        this.isDragging = false;
        if (cell >= 0 && this.state.board[cell]) {
          const cat = this.state.board[cell];
          const p = this.cellPoint(cell);
          this.grabbedCell = cell;
          this.grabbedCatId = cat.id;
          this.grabPointerX = p.x;
          this.grabPointerY = p.y - 20;
          this.grabSmoothX = p.x;
          this.grabSmoothY = p.y - 6;
          this.grabTilt = 0;
          this.grabElapsed = 0;
          this.platform.vibrate("light");
        }
      });
      this.platform.onPointerMove((sx, sy) => {
        if (this.isInputBlocked()) {
          this.releaseGrab(false);
          return;
        }
        if (this.dragStartCell < 0) return;
        const { x, y } = this.toVirtual(sx, sy);
        if (this.grabbedCell >= 0) {
          this.grabPointerX = x;
          this.grabPointerY = y - 18;
        }
        const cell = this.hitCell(x, y);
        if (cell >= 0 && cell !== this.dragStartCell) {
          this.idleSeconds = 0;
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
            this.releaseGrab(false);
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
          this.statusText = "\u8FD9\u6B21\u4EA4\u6362\u6CA1\u6709\u5F62\u6210\u540C\u8272\u76F4\u7EBF\u4E09\u8FDE\uFF0C\u6362\u4E00\u53EA\u8BD5\u8BD5~";
          this.clearPreview();
          return;
        }
        this.setPreview(this.selected, upCell);
        this.hoverPreviewed = false;
        const dmg = (_b = (_a = this.preview.event) == null ? void 0 : _a.damage) != null ? _b : 0;
        this.statusText = `\u9996\u8F6E\u9884\u8BA1 ${dmg} \u4F24\u5BB3 \xB7 \u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u4EA4\u6362`;
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
    async animateBoardPositions(board, duration) {
      const targets = [];
      for (let cell = 0; cell < board.length; cell++) {
        const cat = board[cell];
        if (!cat) continue;
        const vis = this.visuals.get(cat.id);
        if (!vis) continue;
        const tp = this.cellPoint(cell);
        if (Math.hypot(tp.x - vis.x, tp.y - vis.y) > 0.5) {
          targets.push({ vis, sx: vis.x, sy: vis.y, tx: tp.x, ty: tp.y });
        }
      }
      if (targets.length === 0) return;
      await this.runTween(duration, "cubicInOut", (t) => {
        for (const item of targets) {
          item.vis.x = item.sx + (item.tx - item.sx) * t;
          item.vis.y = item.sy + (item.ty - item.sy) * t;
        }
      });
    }
    spawnWaveBurstEffects(event, cells, waveIndex) {
      if (cells.length === 0) return;
      const count = Math.min(cells.length * 2, 24);
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
    spawnFloatingDamage(event, attacker) {
      const y = attacker === 0 ? 118 : 1074;
      const text = event.shieldBlocked > 0 ? `\u2212${event.damage} (\u76FE\u6321${event.shieldBlocked})` : event.trueDamage > 0 ? `\u2212${event.damage} (\u771F\u4F24${event.trueDamage})` : `\u2212${event.damage}`;
      this.spawnFloatingText(text, y, event.trueDamage > 0 ? "#9333ea" : "#e54d42");
    }
    async submitSwap(a, b, isBossAction = false) {
      if (this.busy && !isBossAction) return;
      if (!validSwap(this.state, a, b)) {
        this.statusText = "\u8FD9\u6B21\u4EA4\u6362\u6CA1\u6709\u5F62\u6210\u540C\u8272\u76F4\u7EBF\u4E09\u8FDE\uFF0C\u6362\u4E00\u53EA\u8BD5\u8BD5~";
        this.selected = -1;
        this.clearPreview();
        return;
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
      await this.animateBoardPositions(result.swapped, 0.2);
      let turnTotalDamage = 0;
      for (let idx = 0; idx < result.events.length; idx++) {
        const event = result.events[idx];
        turnTotalDamage += event.damage;
        this.currentEvent = event;
        const actorLabel = this.gameMode === "roguelike" ? attacker === 0 ? "\u4F60" : getBossProfile(this.run.stageIndex).name : `\u73A9\u5BB6 ${attacker + 1}`;
        this.statusText = `${actorLabel} \xB7 \u7B2C ${event.number} \u8F6E \xB7 \u57FA\u7840 ${event.baseDamage} + \u9644\u52A0 ${event.bonus} = ${event.damage} \u4F24`;
        await this.waitSec(0.24);
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
          await this.runTween(0.22, "cubicInOut", (t) => {
            for (const m of mergeItems) {
              m.vis.x = m.sx + (m.tx - m.sx) * t;
              m.vis.y = m.sy + (m.ty - m.sy) * t;
              m.vis.scale = 1 - 0.8 * t;
            }
          });
        }
        if (event.waves.length > 0) {
          for (const wave of event.waves) {
            if (wave.wave > 0) {
              this.statusText = `${actorLabel} \xB7 \u7B2C ${event.number} \u8F6E \xB7 \u7B2C ${wave.wave} \u6CE2\u8FDE\u9501\u4E8C\u6B21\u5F15\u7206\uFF01`;
              const pulseTargets = wave.sources.map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v));
              if (pulseTargets.length > 0) {
                await this.runTween(0.14, "backOut", (t) => {
                  for (const v of pulseTargets) v.scale = 1 + 0.35 * t;
                });
              }
            }
            this.spawnWaveBurstEffects(event, wave.cells, wave.wave);
            for (const cell of wave.cells) {
              const orig = event.before[cell];
              if (orig) this.visuals.delete(orig.id);
            }
            await this.waitSec(wave.wave === 0 ? 0.3 : 0.28);
          }
        } else {
          this.platform.vibrate("light");
        }
        this.syncVisuals(event.afterClear);
        this.state.hp = [event.hp[0], event.hp[1]];
        if (this.state.shield) {
          this.state.shield = [event.shield[0], event.shield[1]];
        }
        this.spawnFloatingDamage(event, attacker);
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
          void this.runTween(0.28, "backOut", (t) => {
            for (const v of newBigs) v.scale = 0.4 + 0.6 * t;
          });
        }
        for (const move of event.moves) {
          const vis = this.visuals.get(move.id);
          if (!vis) continue;
          const sx = vis.x;
          const sy = vis.y;
          const tp = this.cellPoint(move.to);
          await this.runTween(0.055, "cubicInOut", (t) => {
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
          await this.runTween(0.25, "backOut", (t) => {
            const posT = Math.min(1, t);
            for (const s of spawns) {
              s.vis.x = s.sx + (s.tx - s.sx) * posT;
              s.vis.y = s.sy + (s.ty - s.sy) * posT;
              s.vis.scale = Math.max(0.05, 0.05 + 0.95 * t);
            }
          });
        }
        this.currentEvent = null;
        if (useSteps && idx < result.events.length - 1) {
          this.statusText += " \xB7 \u70B9\u51FB\u201C\u4E0B\u4E00\u8F6E \u25B6\u201D\u7EE7\u7EED";
          await this.waitForNextStep();
        }
      }
      this.state = result.state;
      this.syncVisuals(this.state.board);
      this.legalCount = findLegalSwaps(this.state).length;
      this.computeTurnSummary(result.events);
      if (this.gameMode === "roguelike") {
        await this.handleRoguelikePostSwap(attacker, result.events, turnTotalDamage, result.notice);
        return;
      }
      if (this.state.winner >= 0) {
        this.statusText = `\u73A9\u5BB6 ${this.state.winner + 1} \u83B7\u80DC\uFF01\u53EF\u70B9\u201C\u540C\u5C40\u91CD\u5F00\u201D\u518D\u6218\u4E00\u5C40`;
      } else if (result.notice) {
        this.statusText = result.notice;
      } else {
        this.statusText = `\u8F6E\u5230\u73A9\u5BB6 ${this.state.player + 1} \xB7 \u7559\u610F\u5BF9\u624B\u7559\u4E0B\u7684\u5927\u732B`;
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
          this.bossIntent = null;
          if (this.run.stageIndex < BOSSES.length - 1) {
            this.run.playerHp = Math.min(this.run.playerMaxHp, this.run.playerHp + STAGE_CLEAR_HEAL);
            this.state.hp[0] = this.run.playerHp;
            this.run.rewardChoices = rollRelicChoices(
              this.run.relics,
              this.run.seed + (this.run.stageIndex + 1) * 7919 + this.run.totalTurns * 13
            );
            this.run.phase = "reward";
            this.statusText = `\u51FB\u8D25 ${boss.name}\uFF01\u56DE\u590D +${STAGE_CLEAR_HEAL} HP\uFF0C\u9009 1 \u4E2A\u732B\u732B\u795D\u798F`;
            this.showBanner(`\u{1F389} \u51FB\u8D25 ${boss.name}\uFF01`, 1.5);
          } else {
            this.run.phase = "victory";
            this.statusText = "\u{1F3C6} \u5168\u90E8\u732B\u6897 Boss \u5DF2\u51FB\u8D25\uFF0C\u732B\u5C4B\u5927\u6377\uFF01";
            this.showBanner("\u{1F3C6} \u901A\u5173\u5927\u6377\uFF01", 1.8);
          }
          this.busy = false;
          return;
        }
        if (notice) {
          this.statusText = notice;
        } else if (post.notes.length > 0) {
          this.statusText = `\u795D\u798F\u751F\u6548\uFF1A${post.notes.join(" \xB7 ")}`;
        }
        await this.waitSec(0.45);
        await this.runBossTurn();
      } else {
        const bossPost = applyBossPostTurnPassive(this.state, boss, events);
        if (bossPost.bossHealed > 0) {
          this.spawnFloatingText(`+${bossPost.bossHealed} HP`, 118, "#16a34a", 340);
          this.showBanner(`\u{1F35A} \u5927\u6A58\u5E72\u996D\u56DE\u8840 +${bossPost.bossHealed} HP\uFF01`, 1.2);
        }
        this.run.calmDefuseActive = false;
        this.run.bossTurnsTaken += 1;
        this.run.playerHp = this.state.hp[0];
        this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
        this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
        if (this.state.winner === 1 || this.run.playerHp <= 0) {
          this.run.phase = "defeat";
          this.bossIntent = null;
          this.statusText = `\u88AB ${boss.name} \u6320\u8DB4\u5566\uFF01\u70B9\u51FB\u91CD\u65B0\u6311\u6218`;
          this.busy = false;
          return;
        }
        if (notice) {
          this.statusText = notice;
          await this.waitSec(0.4);
        }
        this.refreshPlayerTurnGuides();
        this.busy = false;
      }
    }
    async runBossTurn() {
      var _a, _b;
      const boss = getBossProfile(this.run.stageIndex);
      this.statusText = `\u8F6E\u5230 ${boss.name} \u884C\u52A8...`;
      const skill = applyBossPreTurnSkill(this.state, boss, this.run.bossTurnsTaken);
      if (skill.triggered) {
        this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
        this.syncVisuals(this.state.board);
        this.showBanner(skill.banner, 1.5);
        this.statusText = skill.banner;
        if (skill.shieldGained > 0) {
          this.spawnFloatingText(`+${skill.shieldGained} \u76FE`, 118, "#2563eb", 470);
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
        await this.waitSec(0.55);
      }
      let chosenSwap = (_b = (_a = this.bossIntent) == null ? void 0 : _a.swap) != null ? _b : null;
      if (!chosenSwap || !validSwap(this.state, chosenSwap[0], chosenSwap[1])) {
        if (chosenSwap) {
          this.showBanner("\u{1F3AF} \u610F\u56FE\u88AB\u4F60\u62C6\u7A7F\uFF01Boss \u4E34\u65F6\u6362\u62DB\uFF01", 1.3);
          this.statusText = `\u{1F3AF} \u4F60\u62C6\u7A7F\u4E86 ${boss.name} \u7684\u8BA1\u5212\uFF0C\u5B83\u6B63\u5728\u91CD\u65B0\u627E\u6B65...`;
          await this.waitSec(0.42);
        }
        const mult = this.run.calmDefuseActive ? 0.7 : 1;
        const fresh = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult);
        chosenSwap = fresh.swap;
      }
      if (!chosenSwap) {
        this.state.player = 0;
        this.refreshPlayerTurnGuides();
        this.busy = false;
        return;
      }
      this.bossHighlightSwap = chosenSwap;
      this.statusText = `${boss.name} \u51FA\u624B\u4EA4\u6362\uFF01`;
      await this.waitSec(0.38);
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
      if (!this.busy && !this.isInputBlocked()) {
        this.idleSeconds += dt;
      }
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
      for (let i = this.floatings.length - 1; i >= 0; i--) {
        const f = this.floatings[i];
        f.life -= dt;
        if (f.life <= 0) {
          this.floatings.splice(i, 1);
          continue;
        }
        f.y -= 52 * dt * this.speed;
      }
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
    /** 绘制手绘珊瑚粉星星爆发射线（还原概念图核心特效） */
    drawStarBlastArrow(ctx, ax, ay, bx, by) {
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
      drawStroke("#ff7e70", 7.5);
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
    /** 手绘贴纸风按钮 */
    drawStickerButton(ctx, btn) {
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
      ctx.font = `800 ${btn.round ? 26 : 18}px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
      ctx.restore();
    }
    /** 手绘贴纸风玩家 / Boss 血条（支持护盾与肉鸽专属 Boss 贴纸头像） */
    drawPlayerBar(ctx, player, y) {
      const isRogue = this.gameMode === "roguelike";
      const boss = isRogue ? getBossProfile(this.run.stageIndex) : null;
      const isTurn = this.state.winner < 0 && this.state.player === player;
      const isWinner = this.state.winner === player;
      const maxHp = this.state.maxHp ? this.state.maxHp[player] : HP;
      const shield = this.state.shield ? this.state.shield[player] : 0;
      const barX = 96;
      const barW = player === 1 ? 522 : 596;
      const barH = 48;
      const radius = barH / 2;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, barX - 6, y - 6, barW + 12, barH + 12, radius + 6);
      ctx.fill();
      ctx.fillStyle = "#f5ebe0";
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.fill();
      const ratio = Math.max(0, Math.min(1, this.state.hp[player] / Math.max(1, maxHp)));
      if (ratio > 0) {
        ctx.save();
        drawRoundedRect(ctx, barX, y, barW, barH, radius);
        ctx.clip();
        ctx.fillStyle = player === 0 ? "#bae8cb" : isRogue && boss ? boss.barFillColor : "#d2c2fa";
        ctx.fillRect(barX, y, barW * ratio, barH);
        ctx.restore();
      }
      ctx.strokeStyle = isTurn || isWinner ? "#d97706" : INK2;
      ctx.lineWidth = isTurn || isWinner ? 4.2 : 3.4;
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `900 22px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = barX + barW * 0.5;
      let label = "";
      if (isRogue && boss) {
        if (player === 1) {
          label = `${boss.name}  ${this.state.hp[1]}/${maxHp}`;
        } else {
          const calmTag = this.run.calmDefuseActive ? " \xB7 \u51CF\u4F2430%" : "";
          label = `\u4F60  ${this.state.hp[0]}/${maxHp}${calmTag}`;
        }
      } else {
        const suffix = isWinner ? "  \u2605 \u83B7\u80DC" : isTurn ? "  \xB7 \u5F53\u524D\u56DE\u5408" : "";
        label = `P${player + 1}  ${this.state.hp[player]}${suffix}`;
      }
      ctx.fillText(label, centerX, y + barH / 2 + 1);
      if (shield > 0) {
        const sw = 74;
        const sh = 30;
        const sx = barX + barW - sw - 8;
        const sy = y + (barH - sh) / 2;
        ctx.fillStyle = "#dbeafe";
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2.6;
        drawRoundedRect(ctx, sx, sy, sw, sh, 15);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = `900 16px ${FONT_FAMILY2}`;
        ctx.fillText(`\u{1F6E1} ${shield}`, sx + sw / 2, sy + sh / 2 + 1);
      }
      const avatar = player === 0 ? this.assets.avatarP1 : isRogue && boss ? this.assets.bosses[boss.id] : this.assets.avatarP2;
      if (avatar.ready) {
        const avSize = 98;
        ctx.drawImage(avatar.el, 22, y - 28, avSize, avSize);
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
      var _a, _b, _c;
      const ctx = this.platform.ctx;
      this.buttons = [];
      ctx.save();
      this.drawFullBackground(ctx);
      ctx.translate(this.offsetX, this.offsetY);
      ctx.scale(this.scale, this.scale);
      if (this.gameMode === "roguelike") {
        const boss = getBossProfile(this.run.stageIndex);
        ctx.save();
        ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
        ctx.strokeStyle = INK2;
        ctx.lineWidth = 2.4;
        drawRoundedRect(ctx, 118, 42, 496, 36, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = boss.accentColor;
        ctx.font = `900 16px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`\u7B2C ${boss.stage}/3 \u5173`, 134, 61);
        ctx.fillStyle = INK_SOFT;
        ctx.font = `700 15px ${FONT_FAMILY2}`;
        const skillBadge = boss.id === "orange" ? boss.traitShort : this.bossIntent ? this.bossIntent.skillText : boss.traitShort;
        ctx.fillText(`\xB7  ${skillBadge}`, 212, 61);
        for (let s = 0; s < BOSSES.length; s++) {
          const dx = 550 + s * 20;
          const dy = 60;
          ctx.beginPath();
          ctx.arc(dx, dy, s === this.run.stageIndex ? 6.5 : 5, 0, Math.PI * 2);
          ctx.fillStyle = s < this.run.stageIndex ? "#38b583" : s === this.run.stageIndex ? boss.accentColor : "#dccbb8";
          ctx.fill();
          ctx.strokeStyle = INK2;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.restore();
      }
      this.drawPlayerBar(ctx, 1, 92);
      this.drawStickerButton(ctx, {
        id: "rules",
        x: 636,
        y: 88,
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
      const isDangerIntent = this.gameMode === "roguelike" && !this.busy && this.bossIntent !== null && this.bossIntent.hasBlast;
      ctx.fillStyle = isDangerIntent ? "rgba(255, 236, 236, 0.94)" : "rgba(255, 250, 240, 0.9)";
      ctx.strokeStyle = isDangerIntent ? "#e54d42" : "rgba(78, 52, 46, 0.35)";
      ctx.lineWidth = isDangerIntent ? 2.6 : 2;
      const pillW = this.stepWaitResolver ? 500 : 672;
      drawRoundedRect(ctx, 24, 160, pillW, 42, 21);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isDangerIntent ? "#b91c1c" : INK2;
      ctx.font = `700 17px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(this.statusText, 42, 182);
      ctx.restore();
      if (this.stepWaitResolver) {
        this.drawStickerButton(ctx, {
          id: "next-step",
          x: 538,
          y: 158,
          w: 158,
          h: 46,
          label: "\u4E0B\u4E00\u8F6E \u25B6",
          accent: true,
          onClick: () => {
            const resolve = this.stepWaitResolver;
            this.stepWaitResolver = null;
            resolve == null ? void 0 : resolve();
          }
        });
      }
      ctx.save();
      ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
      const activeHintCells = /* @__PURE__ */ new Set();
      const activeHighCells = /* @__PURE__ */ new Set();
      const hintPartner = /* @__PURE__ */ new Map();
      if (!this.isInputBlocked() && this.selected < 0 && this.grabbedCell < 0) {
        for (const [ha, hb] of this.hintSet.highValue) {
          activeHintCells.add(ha);
          activeHintCells.add(hb);
          activeHighCells.add(ha);
          activeHighCells.add(hb);
          hintPartner.set(ha, hb);
          hintPartner.set(hb, ha);
        }
        if (activeHintCells.size === 0 && this.idleSeconds >= 3.5 && this.hintSet.fallback) {
          const [fa, fb] = this.hintSet.fallback;
          activeHintCells.add(fa);
          activeHintCells.add(fb);
          hintPartner.set(fa, fb);
          hintPartner.set(fb, fa);
        }
      }
      const bossLockedCells = /* @__PURE__ */ new Set();
      const activeBossSwap = (_c = this.bossHighlightSwap) != null ? _c : this.gameMode === "roguelike" && !this.busy && this.selected < 0 && this.run.phase === "battle" ? (_b = (_a = this.bossIntent) == null ? void 0 : _a.swap) != null ? _b : null : null;
      if (activeBossSwap) {
        bossLockedCells.add(activeBossSwap[0]);
        bossLockedCells.add(activeBossSwap[1]);
      }
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const p = this.cellPoint(cell);
        const cat = this.state.board[cell];
        const rimColor = !cat ? NEST_EMPTY_RIM : cat.level >= 2 ? NEST_BIG_RIM : NEST_RIM_COLORS[cat.color % 4];
        this.drawCatNest(
          ctx,
          p.x,
          p.y,
          rimColor,
          cell === this.selected,
          cell === this.previewTarget && this.preview.valid
        );
        if (activeHighCells.has(cell)) {
          const glowAlpha = 0.25 + 0.22 * Math.sin(this.elapsed * 5.2);
          ctx.save();
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS - 3, 10);
          ctx.fillStyle = `rgba(255, 224, 102, ${glowAlpha.toFixed(2)})`;
          ctx.fill();
          ctx.restore();
        }
        if (bossLockedCells.has(cell)) {
          const pulseW = this.bossHighlightSwap ? 5.5 : 3.6 + Math.sin(this.elapsed * 6) * 0.8;
          ctx.save();
          traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
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
      for (const vis of this.visuals.values()) {
        if (vis.id === this.grabbedCatId) continue;
        const cell = idToCell.get(vis.id);
        let animState = "idle";
        let flipX = false;
        let nudgeX = 0;
        let nudgeY = 0;
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
            flipX
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
      const overlayEvent = this.preview.valid && this.preview.event ? this.preview.event : this.currentEvent;
      if (overlayEvent) {
        const waveColors = ["#ff9852", "#ff4d8d", "#a855f7", "#ec4899"];
        const cellWaveMap = /* @__PURE__ */ new Map();
        for (const wave of overlayEvent.waves) {
          for (const cell of wave.cells) {
            cellWaveMap.set(cell, wave.wave);
          }
        }
        for (const cell of overlayEvent.cleared) {
          const p = this.cellPoint(cell);
          const wIdx = cellWaveMap.get(cell);
          ctx.strokeStyle = wIdx !== void 0 ? waveColors[Math.min(wIdx, waveColors.length - 1)] : "#ff9852";
          ctx.lineWidth = wIdx && wIdx > 0 ? 4.8 : 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 48, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const wave of overlayEvent.waves) {
          if (wave.wave > 0) {
            for (const src of wave.sources) {
              const p = this.cellPoint(src);
              ctx.strokeStyle = waveColors[Math.min(wave.wave, waveColors.length - 1)];
              ctx.lineWidth = 4;
              ctx.setLineDash([6, 5]);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 56, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }
        for (const center of overlayEvent.centers) {
          const p = this.cellPoint(center.cell);
          ctx.strokeStyle = "#38b583";
          ctx.lineWidth = 4.5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 52, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (const path of overlayEvent.rays) {
          if (path.length >= 2) {
            const a = this.cellPoint(path[0]);
            const b = this.cellPoint(path[path.length - 1]);
            this.drawStarBlastArrow(ctx, a.x, a.y, b.x, b.y);
          }
        }
        if (!this.currentEvent) {
          for (const move of overlayEvent.moves) {
            const a = this.cellPoint(move.from);
            const b = this.cellPoint(move.to);
            this.drawSimpleArrow(ctx, a.x, a.y, b.x, b.y, "#3bb5a5", 3.6);
          }
        }
      }
      if (activeBossSwap && !overlayEvent) {
        const a = this.cellPoint(activeBossSwap[0]);
        const b = this.cellPoint(activeBossSwap[1]);
        this.drawSimpleArrow(
          ctx,
          a.x,
          a.y,
          b.x,
          b.y,
          this.bossHighlightSwap ? "#dc2626" : "#ef4444",
          this.bossHighlightSwap ? 6 : 4.2
        );
      }
      if (this.state.suggested && this.state.turn === 1 && !this.busy && this.selected < 0 && !overlayEvent) {
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
          ctx.ellipse(this.grabSmoothX, this.grabSmoothY + 52, 26, 10, 0, 0, Math.PI * 2);
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
      ctx.restore();
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
      this.drawPlayerBar(ctx, 0, 1054);
      if (this.gameMode === "roguelike" && this.run.relics.length > 0) {
        const startX = 128;
        const badgeY = 1e3;
        for (let i = 0; i < this.run.relics.length; i++) {
          const def = getRelicDef(this.run.relics[i]);
          const rx = startX + i * 192;
          ctx.save();
          ctx.fillStyle = "rgba(255, 250, 240, 0.94)";
          ctx.strokeStyle = def.badgeColor;
          ctx.lineWidth = 2.6;
          drawRoundedRect(ctx, rx, badgeY, 182, 38, 19);
          ctx.fill();
          ctx.stroke();
          const icon = this.assets.relics[def.branch];
          if (icon.ready) {
            ctx.drawImage(icon.el, rx + 5, badgeY + 2, 34, 34);
          }
          ctx.fillStyle = INK2;
          ctx.font = `800 15px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(def.name, rx + 44, badgeY + 20);
          ctx.restore();
        }
      }
      const btnY = 1124;
      const btnH = 50;
      if (this.gameMode === "roguelike") {
        this.drawStickerButton(ctx, {
          id: "rogue-new",
          x: 24,
          y: btnY,
          w: 132,
          h: btnH,
          label: "\u91CD\u5F00\u95EF\u5173",
          disabled: this.busy,
          onClick: () => this.startNewRoguelikeRun(
            Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
          )
        });
        this.drawStickerButton(ctx, {
          id: "relics",
          x: 166,
          y: btnY,
          w: 130,
          h: btnH,
          label: `\u795D\u798F(${this.run.relics.length})`,
          accent: this.showRelicsModal || this.run.relics.length > 0,
          onClick: () => {
            this.showRelicsModal = !this.showRelicsModal;
            this.showRulesModal = false;
            this.showDebugPanel = false;
          }
        });
        this.drawStickerButton(ctx, {
          id: "speed",
          x: 306,
          y: btnY,
          w: 122,
          h: btnH,
          label: `\u901F\u5EA6 ${this.speed}\xD7`,
          onClick: () => {
            this.speed = this.speed === 1 ? 2 : 1;
          }
        });
        this.drawStickerButton(ctx, {
          id: "to-pvp",
          x: 438,
          y: btnY,
          w: 124,
          h: btnH,
          label: "\u53CC\u4EBA\u6A21\u5F0F",
          disabled: this.busy,
          onClick: () => this.startNewGame(Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999))
        });
        this.drawStickerButton(ctx, {
          id: "shake",
          x: 572,
          y: btnY,
          w: 124,
          h: btnH,
          label: `\u9707\u5C4F ${this.shakeEnabled ? "\u5F00" : "\u5173"}`,
          onClick: () => {
            this.shakeEnabled = !this.shakeEnabled;
          }
        });
      } else {
        this.drawStickerButton(ctx, {
          id: "to-rogue",
          x: 24,
          y: btnY,
          w: 126,
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
          x: 160,
          y: btnY,
          w: 112,
          h: btnH,
          label: "\u65B0\u68CB\u76D8",
          disabled: this.busy,
          onClick: () => this.startNewGame(Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999))
        });
        this.drawStickerButton(ctx, {
          id: "speed",
          x: 282,
          y: btnY,
          w: 122,
          h: btnH,
          label: `\u901F\u5EA6 ${this.speed}\xD7`,
          onClick: () => {
            this.speed = this.speed === 1 ? 2 : 1;
          }
        });
        this.drawStickerButton(ctx, {
          id: "debug",
          x: 414,
          y: btnY,
          w: 124,
          h: btnH,
          label: "\u5B9E\u9A8C\u53F0",
          accent: this.showDebugPanel,
          onClick: () => {
            this.showDebugPanel = !this.showDebugPanel;
            this.showRulesModal = false;
            this.selected = -1;
            this.clearPreview();
          }
        });
        this.drawStickerButton(ctx, {
          id: "shake",
          x: 548,
          y: btnY,
          w: 148,
          h: btnH,
          label: `\u9707\u5C4F ${this.shakeEnabled ? "\u5F00" : "\u5173"}`,
          onClick: () => {
            this.shakeEnabled = !this.shakeEnabled;
          }
        });
      }
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 14px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const footerText = this.gameMode === "roguelike" ? `CAT BOOM \u8089\u9E3D MVP  \xB7  \u7B2C ${this.run.stageIndex + 1}/3 \u5173  \xB7  \u5DF2\u9009\u795D\u798F ${this.run.relics.length}  \xB7  \u5408\u6CD5\u4EA4\u6362 ${this.legalCount}` : `CAT BOOM \u53CC\u4EBA\u6A21\u5F0F  \xB7  \u56DE\u5408 ${this.state.turn}  \xB7  SEED ${this.state.seed}  \xB7  \u5408\u6CD5\u4EA4\u6362 ${this.legalCount}`;
      ctx.fillText(footerText, VIRTUAL_W / 2, 1204);
      if (this.bannerLife > 0 && this.bannerText) {
        const alpha = Math.min(1, this.bannerLife / 0.35, (this.bannerMaxLife - this.bannerLife) / 0.15 + 0.2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        const bw = 590;
        const bh = 62;
        const bx = (VIRTUAL_W - bw) / 2;
        const by = 520;
        ctx.fillStyle = "#fff9e6";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 4.5;
        drawRoundedRect(ctx, bx, by, bw, bh, 31);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK2;
        ctx.font = `900 22px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.bannerText, VIRTUAL_W / 2, by + bh / 2 + 1);
        ctx.restore();
      }
      if (this.showRulesModal) {
        this.renderRulesModal(ctx);
      } else if (this.showRelicsModal) {
        this.renderRelicsModal(ctx);
      } else if (this.showDebugPanel) {
        this.renderDebugPanel(ctx);
      } else if (this.gameMode === "roguelike" && this.run.phase === "reward") {
        this.renderRewardModal(ctx);
      } else if (this.gameMode === "roguelike" && (this.run.phase === "victory" || this.run.phase === "defeat")) {
        this.renderRunEndModal(ctx);
      }
      ctx.restore();
    }
    renderRewardModal(ctx) {
      ctx.fillStyle = "rgba(78, 52, 46, 0.56)";
      ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      const x = 32;
      const y = 148;
      const w = 656;
      const h = 860;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 4.5;
      drawRoundedRect(ctx, x, y, w, h, 28);
      ctx.fill();
      ctx.stroke();
      const clearedBoss = getBossProfile(this.run.stageIndex);
      const nextBoss = getBossProfile(this.run.stageIndex + 1);
      ctx.fillStyle = "#d97706";
      ctx.font = `900 30px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`\u{1F389} \u51FB\u8D25 ${clearedBoss.name}\uFF01`, VIRTUAL_W / 2, y + 58);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 18px ${FONT_FAMILY2}`;
      ctx.fillText(
        `\u5DF2\u56DE\u590D +${STAGE_CLEAR_HEAL} HP\uFF08\u5F53\u524D ${this.run.playerHp}/${this.run.playerMaxHp}\uFF09 \xB7 \u9009\u62E9 1 \u4E2A\u6D41\u6D3E\u795D\u798F`,
        VIRTUAL_W / 2,
        y + 96
      );
      ctx.fillStyle = "#b45309";
      ctx.font = `700 16px ${FONT_FAMILY2}`;
      ctx.fillText(`\u4E0B\u4E00\u5173\u9884\u544A\uFF1A\u7B2C ${nextBoss.stage} \u5173 ${nextBoss.name}\uFF08${nextBoss.traitShort}\uFF09`, VIRTUAL_W / 2, y + 128);
      const cardW = 596;
      const cardH = 192;
      const cardX = x + (w - cardW) / 2;
      const startY = y + 160;
      const gap = 22;
      this.run.rewardChoices.forEach((relicId, idx) => {
        const def = getRelicDef(relicId);
        const cy = startY + idx * (cardH + gap);
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
        drawRoundedRect(ctx, cardX, cy + 5, cardW, cardH, 22);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, cardX, cy, cardW, cardH, 22);
        ctx.fill();
        ctx.stroke();
        const icon = this.assets.relics[def.branch];
        if (icon.ready) {
          ctx.drawImage(icon.el, cardX + 20, cy + 44, 104, 104);
        } else {
          ctx.fillStyle = def.badgeColor;
          ctx.beginPath();
          ctx.arc(cardX + 72, cy + 96, 44, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = def.badgeColor;
        drawRoundedRect(ctx, cardX + 144, cy + 26, 86, 28, 14);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 14px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(def.branchLabel, cardX + 187, cy + 41);
        ctx.fillStyle = INK2;
        ctx.font = `900 26px ${FONT_FAMILY2}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(def.name, cardX + 242, cy + 49);
        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 18px ${FONT_FAMILY2}`;
        const desc = def.detailDesc;
        const line1 = desc.slice(0, 21);
        const line2 = desc.slice(21);
        ctx.fillText(line1, cardX + 144, cy + 98);
        if (line2) {
          ctx.fillText(line2, cardX + 144, cy + 128);
        }
        ctx.fillStyle = def.badgeColor;
        ctx.font = `800 16px ${FONT_FAMILY2}`;
        ctx.textAlign = "right";
        ctx.fillText("\u70B9\u51FB\u9009\u62E9\u6B64\u795D\u798F \u25B6", cardX + cardW - 22, cy + cardH - 20);
        ctx.restore();
      });
    }
    renderRelicsModal(ctx) {
      ctx.fillStyle = "rgba(78, 52, 46, 0.48)";
      ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      const x = 44;
      const y = 220;
      const w = 632;
      const h = 660;
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
      ctx.fillText(`\u5DF2\u6536\u96C6\u7684\u732B\u732B\u795D\u798F (${this.run.relics.length})`, x + 28, y + 52);
      if (this.run.relics.length === 0) {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `700 20px ${FONT_FAMILY2}`;
        ctx.textAlign = "center";
        ctx.fillText("\u5C1A\u672A\u83B7\u5F97\u795D\u798F\uFF0C\u51FB\u8D25\u5F53\u524D Boss \u540E\u5373\u53EF 3 \u9009 1\uFF01", VIRTUAL_W / 2, y + 290);
      } else {
        let cy = y + 92;
        for (const id of this.run.relics) {
          const def = getRelicDef(id);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = def.badgeColor;
          ctx.lineWidth = 3;
          drawRoundedRect(ctx, x + 24, cy, w - 48, 128, 18);
          ctx.fill();
          ctx.stroke();
          const icon = this.assets.relics[def.branch];
          if (icon.ready) {
            ctx.drawImage(icon.el, x + 38, cy + 22, 82, 82);
          }
          ctx.fillStyle = INK2;
          ctx.font = `900 22px ${FONT_FAMILY2}`;
          ctx.textAlign = "left";
          ctx.fillText(`[${def.branchLabel}] ${def.name}`, x + 136, cy + 44);
          ctx.fillStyle = INK_SOFT;
          ctx.font = `600 16px ${FONT_FAMILY2}`;
          ctx.fillText(def.detailDesc.slice(0, 24), x + 136, cy + 78);
          if (def.detailDesc.length > 24) {
            ctx.fillText(def.detailDesc.slice(24), x + 136, cy + 104);
          }
          cy += 144;
        }
      }
      this.drawStickerButton(ctx, {
        id: "close-relics",
        x: VIRTUAL_W / 2 - 96,
        y: y + h - 72,
        w: 192,
        h: 48,
        label: "\u5173\u95ED",
        accent: true,
        onClick: () => {
          this.showRelicsModal = false;
        }
      });
    }
    renderRunEndModal(ctx) {
      const isWin = this.run.phase === "victory";
      ctx.fillStyle = "rgba(78, 52, 46, 0.56)";
      ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      const x = 56;
      const y = 260;
      const w = 608;
      const h = 610;
      ctx.fillStyle = "#fffaf0";
      ctx.strokeStyle = isWin ? "#d97706" : "#dc2626";
      ctx.lineWidth = 5;
      drawRoundedRect(ctx, x, y, w, h, 28);
      ctx.fill();
      ctx.stroke();
      const boss = getBossProfile(this.run.stageIndex);
      const avatar = isWin ? this.assets.avatarP1 : this.assets.bosses[boss.id];
      if (avatar.ready) {
        ctx.drawImage(avatar.el, VIRTUAL_W / 2 - 68, y + 28, 136, 136);
      }
      ctx.fillStyle = isWin ? "#b45309" : "#b91c1c";
      ctx.font = `900 32px ${FONT_FAMILY2}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(isWin ? "\u{1F3C6} \u732B\u5C4B\u5927\u6377 \xB7 \u5168\u901A\u5173\uFF01" : "\u{1F43E} \u88AB\u732B\u732B\u6320\u8DB4\u5566", VIRTUAL_W / 2, y + 214);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 18px ${FONT_FAMILY2}`;
      ctx.fillText(
        isWin ? "\u4F60\u51FB\u8D25\u4E86\u5927\u6A58\u3001\u5976\u725B\u732B\u4E0E\u7EC8\u6781\u732B\u738B\u54C8\u57FA\u7C73\uFF01" : `\u6B62\u6B65\u4E8E\u7B2C ${boss.stage} \u5173 \xB7 ${boss.name}`,
        VIRTUAL_W / 2,
        y + 252
      );
      ctx.fillStyle = "#f7ebd9";
      ctx.strokeStyle = "rgba(78, 52, 46, 0.25)";
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x + 36, y + 284, w - 72, 186, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK2;
      ctx.font = `800 19px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.fillText(`\u2022 \u603B\u51FA\u62DB\u56DE\u5408\uFF1A${this.run.totalTurns} \u56DE\u5408`, x + 64, y + 328);
      ctx.fillText(`\u2022 \u5355\u56DE\u5408\u6700\u9AD8\u7206\u53D1\uFF1A${this.run.bestTurnDamage} \u4F24\u5BB3`, x + 64, y + 368);
      ctx.fillText(
        `\u2022 \u6536\u96C6\u795D\u798F\uFF1A${this.run.relics.length > 0 ? this.run.relics.map((id) => getRelicDef(id).name).join(" / ") : "\u65E0"}`,
        x + 64,
        y + 408
      );
      ctx.fillText(`\u2022 \u5269\u4F59\u751F\u547D\uFF1A${this.run.playerHp} / ${this.run.playerMaxHp}`, x + 64, y + 448);
      this.drawStickerButton(ctx, {
        id: "run-again",
        x: VIRTUAL_W / 2 - 120,
        y: y + h - 92,
        w: 240,
        h: 56,
        label: isWin ? "\u518D\u6765\u4E00\u5C40 \u25B6" : "\u91CD\u65B0\u6311\u6218 \u25B6",
        accent: true,
        onClick: () => this.startNewRoguelikeRun(
          Math.floor(Date.now() % 1e6) + Math.floor(Math.random() * 999)
        )
      });
    }
    renderRulesModal(ctx) {
      ctx.fillStyle = "rgba(78, 52, 46, 0.45)";
      ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
      const x = 36;
      const y = 186;
      const w = 648;
      const h = 790;
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
      ctx.fillText("Cat Boom \xB7 \u732B\u6897\u8089\u9E3D\u73A9\u6CD5\u8BF4\u660E", x + 30, y + 52);
      const lines = [
        "\u3010\u6838\u5FC3\u5408\u6210\u4E0E\u8FDE\u73AF\u5F15\u7206\u3011",
        "\u2022 3 \u8FDE / V \u5B57\u5408 1 \u53EA 2 \u7EA7\u5927\u732B\uFF1B\u76F4\u7EBF 4 \u8FDE\u5408 2 \u53EA\u5927\u732B\u3002",
        "\u2022 \u76F4\u7EBF 5 \u8FDE \u6216 \u4E09\u53EA 2 \u7EA7\u5927\u732B\u4E09\u8FDE \u2192 \u5408 1 \u53EA 3 \u7EA7\u70AB\u5F69\u732B\uFF01",
        "\u2022 \u5927\u732B\u6DF7\u6D88\uFF1A\u70B8\u5468\u56F4 1 \u5708 + 3 \u683C\u5BBD\u5149\u675F\uFF1B\u70AB\u5F69\u732B 6 \u65B9\u5411\u5168\u7206\uFF01",
        "\u2022 \u8FDE\u9501\u4E8C\u6B21\u5F15\u7206\uFF1A\u88AB\u6CE2\u53CA\u7684\u5927\u732B/\u70AB\u5F69\u732B\u4F1A\u9010\u6CE2\u8FDE\u73AF\u70B8\u5F00\uFF01",
        "",
        "\u3010\u732B\u6897 Boss \u610F\u56FE\u4E0E\u535A\u5F08\u3011",
        "\u2022 \u7EA2\u865A\u7EBF\u6846\u6807\u51FA Boss \u4E0B\u56DE\u5408\u51C6\u5907\u52A8\u54EA\u4E24\u53EA\u732B\uFF0C\u53EF\u62A2\u5148\u62C6\u62DB\uFF01",
        "\u2022 \u5927\u6A58\uFF1A\u4E13\u62A2\u6A58\u732B\u5E76\u5E72\u996D\u56DE\u8840 \uFF5C \u5976\u725B\u732B\uFF1A\u6BCF2\u56DE\u5408\u8DD1\u9177\u53D8\u5927\u732B",
        "\u2022 \u54C8\u57FA\u7C73\uFF1A\u6BCF2\u56DE\u5408\u54C8\u6C14\u53E0 8 \u76FE + \u9020\u5927\u732B\uFF0C\u9AD8\u4F24\u62A2\u7206\uFF01",
        "\u2022 \u51FB\u8D25 Boss \u56DE\u590D +25 \u8840\uFF0C\u5E76\u5728\u4E09\u5927\u6D41\u6D3E\u4E2D 3 \u9009 1 \u795D\u798F\u3002",
        "",
        "\u3010\u64CD\u4F5C\u4E0E\u5FAE\u52A8\u63D0\u793A\u3011",
        "\u2022 \u8F7B\u5FAE\u6643\u52A8\u7684\u732B = \u9AD8\u4EF7\u503C\u53EF\u5F15\u7206/\u591A\u8FDE\u63D0\u793A\uFF0C\u62D6\u52A8\u6216\u70B9\u9009\u5373\u53EF\u6362\u3002",
        "\u2022 \u7EFF\u865A\u73AF = \u5408\u6210\u4E2D\u5FC3 \uFF5C \u6A59/\u7C89\u5708 = \u9010\u6CE2\u7206\u53D1 \uFF5C \u9752\u7BAD = \u6536\u7F29\u3002"
      ];
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 18px ${FONT_FAMILY2}`;
      let cy = y + 96;
      for (const line of lines) {
        ctx.fillText(line, x + 30, cy);
        cy += line === "" ? 14 : 38;
      }
      this.drawStickerButton(ctx, {
        id: "close-rules",
        x: VIRTUAL_W / 2 - 96,
        y: y + h - 72,
        w: 192,
        h: 48,
        label: "\u77E5\u9053\u4E86",
        accent: true,
        onClick: () => {
          this.showRulesModal = false;
        }
      });
    }
    renderDebugPanel(ctx) {
      ctx.fillStyle = "rgba(78, 52, 46, 0.45)";
      ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
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
      ctx.font = `900 25px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("\u5B9E\u9A8C\u53F0 \xB7 \u6838\u5FC3\u6D4B\u8BD5\u5C40\u9762\uFF08\u5B8C\u6574 17 \u5C40\u9762\u89C1 lab.html\uFF09", x + 28, y + 50);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 16px ${FONT_FAMILY2}`;
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
      ctx.font = `700 17px ${FONT_FAMILY2}`;
      ctx.fillText(
        `\u79CD\u5B50\uFF1A${this.state.seed}   \xB7   \u56DE\u5408\uFF1A${this.state.turn}   \xB7   \u5408\u6CD5\u4EA4\u6362\uFF1A${this.legalCount}`,
        x + 44,
        statY + 36
      );
      if (this.lastSummary) {
        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 16px ${FONT_FAMILY2}`;
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
        ctx.font = `600 16px ${FONT_FAMILY2}`;
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
