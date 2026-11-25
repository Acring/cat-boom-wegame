"use strict";
(() => {
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
  var FIXTURE_GROUPS = [
    { title: "\u5408\u6210\u7C7B", ids: [0, 9, 10, 6, 12] },
    { title: "\u5F15\u7206\u7C7B", ids: [1, 2, 3, 13, 11, 14] },
    { title: "\u8FDE\u9501\u4E0E\u8FB9\u754C", ids: [7, 8, 15, 4, 16, 5] }
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

  // src/labApp.ts
  var CANVAS_W = 760;
  var CANVAS_H = 840;
  var ORIGIN_X = 96.5;
  var ORIGIN_Y = 104;
  var HEX_STEP = 63;
  var HEX_RADIUS = 56;
  var FONT_FAMILY2 = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';
  var WAVE_COLORS = ["#ff9852", "#ff4d8d", "#a855f7", "#ec4899"];
  function easeCubicInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeBackOut(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  var CatBoomLab = class {
    constructor() {
      this.lastSwap = null;
      this.selected = -1;
      this.hoverCell = -1;
      this.preview = { valid: false };
      this.mode = "play";
      this.paintColor = 0;
      this.paintLevel = 1;
      this.speed = 0.5;
      this.substepEnabled = true;
      this.showOverlay = true;
      this.animPreviewMode = "idle";
      this.busy = false;
      this.nextPhaseResolver = null;
      // 当前演出可视化状态
      this.activeEvent = null;
      this.activeWaveIndex = -1;
      // -1=未开始, 0..N=正在播第几波, 99=波次播完
      this.highlightCells = /* @__PURE__ */ new Set();
      this.activeBeamCells = /* @__PURE__ */ new Set();
      this.activeBeamColor = WAVE_COLORS[0];
      this.visuals = /* @__PURE__ */ new Map();
      this.ghosts = [];
      this.rings = [];
      this.tweens = [];
      this.shakeX = 0;
      this.shakeY = 0;
      this.elapsed = 0;
      this.lastMs = 0;
      // DOM 句柄
      this.statusEl = document.getElementById("phase-status");
      this.logEl = document.getElementById("log-box");
      this.nextBtn = document.getElementById("btn-next-phase");
      this.runSuggestedBtn = document.getElementById("btn-run-suggested");
      this.replayBtn = document.getElementById("btn-replay");
      this.canvas = document.getElementById("lab-canvas");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = CANVAS_W * dpr;
      this.canvas.height = CANVAS_H * dpr;
      this.canvas.style.width = `${CANVAS_W}px`;
      this.canvas.style.height = `${CANVAS_H}px`;
      this.ctx = this.canvas.getContext("2d");
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.assets = loadGameAssets();
      this.bindUI();
      this.bindCanvas();
      this.loadPreset(7);
    }
    start() {
      this.lastMs = performance.now();
      const tick = (now) => {
        const dt = Math.min(0.05, Math.max(1e-3, (now - this.lastMs) / 1e3));
        this.lastMs = now;
        this.update(dt);
        this.render();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    cellPoint(cell) {
      const p = position(cell);
      return {
        x: ORIGIN_X + p.x * HEX_STEP,
        y: ORIGIN_Y + p.y * HEX_STEP
      };
    }
    hitTestCell(x, y) {
      let best = -1;
      let bestDist = HEX_RADIUS * 0.96;
      for (let i = 0; i < CELL_COUNT; i++) {
        const p = this.cellPoint(i);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }
    syncVisuals(board) {
      this.visuals.clear();
      for (let i = 0; i < board.length; i++) {
        const cat = board[i];
        if (!cat) continue;
        const p = this.cellPoint(i);
        this.visuals.set(cat.id, {
          id: cat.id,
          color: cat.color,
          level: cat.level,
          x: p.x,
          y: p.y,
          scale: 1,
          alpha: 1,
          flash: 0
        });
      }
    }
    bindUI() {
      const fixtureContainer = document.getElementById("fixture-buttons");
      FIXTURE_GROUPS.forEach((group) => {
        const wrap = document.createElement("div");
        const title = document.createElement("div");
        title.className = "fixture-group-title";
        title.textContent = group.title;
        wrap.appendChild(title);
        const grid = document.createElement("div");
        grid.className = "btn-grid";
        group.ids.forEach((idx) => {
          const btn = document.createElement("button");
          btn.textContent = FIXTURE_NAMES[idx];
          btn.dataset.fixture = String(idx);
          btn.addEventListener("click", () => this.loadPreset(idx));
          grid.appendChild(btn);
        });
        wrap.appendChild(grid);
        fixtureContainer.appendChild(wrap);
      });
      this.runSuggestedBtn.addEventListener("click", () => {
        if (this.busy) return;
        if (this.state.suggested) {
          void this.playSwap(this.state.suggested[0], this.state.suggested[1]);
        }
      });
      this.replayBtn.addEventListener("click", () => {
        if (this.busy) return;
        if (!this.snapshotBeforeSwap) return;
        this.restoreSnapshot(this.snapshotBeforeSwap);
        if (this.lastSwap) {
          void this.playSwap(this.lastSwap[0], this.lastSwap[1]);
        }
      });
      const speedButtons = document.querySelectorAll("#speed-buttons button");
      speedButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.speed = Number(btn.dataset.speed || 1);
          speedButtons.forEach((b) => b.classList.toggle("active", b === btn));
        });
      });
      const chkSubstep = document.getElementById("chk-substep");
      chkSubstep.addEventListener("change", () => {
        this.substepEnabled = chkSubstep.checked;
        if (!this.substepEnabled && this.nextPhaseResolver) {
          this.releaseNextPhase();
        }
      });
      const chkOverlay = document.getElementById("chk-overlay");
      chkOverlay.addEventListener("change", () => {
        this.showOverlay = chkOverlay.checked;
      });
      const animBtns = document.querySelectorAll("#anim-preview-buttons button");
      animBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.animPreviewMode = btn.dataset.anim || "idle";
          animBtns.forEach((b) => b.classList.toggle("active", b === btn));
        });
      });
      this.nextBtn.addEventListener("click", () => this.releaseNextPhase());
      window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && this.nextPhaseResolver) {
          e.preventDefault();
          this.releaseNextPhase();
        }
      });
      const modePlay = document.getElementById("mode-play");
      const modePaint = document.getElementById("mode-paint");
      const paintTools = document.getElementById("paint-tools");
      const setMode = (m) => {
        this.mode = m;
        this.selected = -1;
        this.preview = { valid: false };
        modePlay.classList.toggle("active", m === "play");
        modePaint.classList.toggle("active", m === "paint");
        paintTools.style.display = m === "paint" ? "flex" : "none";
        this.setStatus(
          m === "paint" ? "\u6446\u68CB\u6A21\u5F0F\uFF1A\u70B9\u51FB\u4EFB\u610F\u683C\u5B50\u4FEE\u6539\u732B\u54AA\u989C\u8272/\u7B49\u7EA7\uFF0C\u6539\u5B8C\u5207\u56DE\u4EA4\u4E92\u6A21\u5F0F\u6D4B\u8BD5" : "\u4EA4\u4E92\u6A21\u5F0F\uFF1A\u9009\u732B\u5E76\u60AC\u505C\u76F8\u90BB\u732B\u9884\u89C8\uFF0C\u70B9\u51FB\u6267\u884C\u4EA4\u6362"
        );
      };
      modePlay.addEventListener("click", () => setMode("play"));
      modePaint.addEventListener("click", () => setMode("paint"));
      const colorBtns = document.querySelectorAll("#color-buttons button");
      colorBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.paintColor = Number(btn.dataset.color || 0);
          colorBtns.forEach((b) => b.classList.toggle("active", b === btn));
        });
      });
      const levelBtns = document.querySelectorAll("#level-buttons button");
      levelBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.paintLevel = Number(btn.dataset.level || 1);
          levelBtns.forEach((b) => b.classList.toggle("active", b === btn));
        });
      });
      document.getElementById("btn-random-board").addEventListener("click", () => {
        if (this.busy) return;
        this.state = newGame(Math.floor(Date.now() % 1e5));
        this.snapshotBeforeSwap = cloneState(this.state);
        this.lastSwap = null;
        this.clearPlaybackState();
        this.syncVisuals(this.state.board);
        this.updateButtons();
        this.setStatus("\u5DF2\u751F\u6210\u968F\u673A\u68CB\u76D8\uFF0C\u53EF\u81EA\u7531\u6446\u68CB\u6216\u76F4\u63A5\u4EA4\u6362\u6D4B\u8BD5");
        this.logEl.textContent = "\u968F\u673A\u68CB\u76D8\u5DF2\u5C31\u7EEA\u3002";
      });
    }
    bindCanvas() {
      const getPos = (ev) => {
        const rect = this.canvas.getBoundingClientRect();
        return {
          x: (ev.clientX - rect.left) / rect.width * CANVAS_W,
          y: (ev.clientY - rect.top) / rect.height * CANVAS_H
        };
      };
      this.canvas.addEventListener("mousemove", (ev) => {
        if (this.busy || this.mode !== "play") return;
        const p = getPos(ev);
        const cell = this.hitTestCell(p.x, p.y);
        this.hoverCell = cell;
        if (this.selected >= 0 && cell >= 0 && cell !== this.selected && neighbors(this.selected).includes(cell)) {
          this.preview = previewSwap(this.state, this.selected, cell);
        } else {
          this.preview = { valid: false };
        }
      });
      this.canvas.addEventListener("mouseleave", () => {
        this.hoverCell = -1;
        this.preview = { valid: false };
      });
      this.canvas.addEventListener("click", (ev) => {
        if (this.busy) return;
        const p = getPos(ev);
        const cell = this.hitTestCell(p.x, p.y);
        if (cell < 0) return;
        if (this.mode === "paint") {
          if (this.paintLevel === 0) {
            this.state.board[cell] = null;
          } else {
            const id = this.state.nextId++;
            this.state.board[cell] = { id, color: this.paintColor, level: this.paintLevel };
          }
          this.state.suggested = void 0;
          this.snapshotBeforeSwap = cloneState(this.state);
          this.syncVisuals(this.state.board);
          this.updateButtons();
          return;
        }
        if (this.selected < 0) {
          if (this.state.board[cell]) {
            this.selected = cell;
          }
          return;
        }
        if (this.selected === cell) {
          this.selected = -1;
          this.preview = { valid: false };
          return;
        }
        if (neighbors(this.selected).includes(cell)) {
          if (validSwap(this.state, this.selected, cell)) {
            void this.playSwap(this.selected, cell);
          } else {
            this.setStatus("\u8FD9\u6B21\u4EA4\u6362\u6CA1\u6709\u5F62\u6210\u540C\u8272\u4E09\u8FDE\uFF0C\u8BF7\u6362\u4E00\u5BF9\u76F8\u90BB\u732B");
            this.selected = cell;
            this.preview = { valid: false };
          }
        } else if (this.state.board[cell]) {
          this.selected = cell;
          this.preview = { valid: false };
        }
      });
    }
    loadPreset(id) {
      if (this.busy) return;
      this.state = loadFixture(id);
      this.snapshotBeforeSwap = cloneState(this.state);
      this.lastSwap = this.state.suggested ? [this.state.suggested[0], this.state.suggested[1]] : null;
      this.clearPlaybackState();
      this.syncVisuals(this.state.board);
      this.updateButtons();
      const btns = document.querySelectorAll("#fixture-buttons button");
      btns.forEach((b) => b.classList.toggle("active", Number(b.dataset.fixture) === id));
      this.setStatus(`\u5DF2\u52A0\u8F7D\u9884\u8BBE\uFF1A${FIXTURE_NAMES[id]}\uFF08\u70B9\u53F3\u4FA7\u201C\u6267\u884C\u63A8\u8350\u4EA4\u6362\u201D\u6216\u76F4\u63A5\u70B9\u51FB\u91D1\u8272\u7BAD\u5934\u4E24\u7AEF\uFF09`);
      this.logEl.textContent = `\u9884\u8BBE\u300C${FIXTURE_NAMES[id]}\u300D\u5DF2\u52A0\u8F7D\u3002
\u63D0\u793A\uFF1A\u5F00\u542F\u201C\u6309\u5B50\u9636\u6BB5\u81EA\u52A8\u6682\u505C\u201D\u540E\uFF0C\u53EF\u7528 Space \u9010\u5E27\u89C2\u5BDF\u6BCF\u4E00\u6CE2\u7206\u70B8\u3002`;
    }
    restoreSnapshot(snap) {
      this.state = cloneState(snap);
      this.clearPlaybackState();
      this.syncVisuals(this.state.board);
      this.updateButtons();
    }
    clearPlaybackState() {
      this.selected = -1;
      this.preview = { valid: false };
      this.activeEvent = null;
      this.activeWaveIndex = -1;
      this.highlightCells.clear();
      this.activeBeamCells.clear();
      this.ghosts = [];
      this.rings = [];
    }
    updateButtons() {
      this.runSuggestedBtn.disabled = this.busy || !this.state.suggested;
      this.replayBtn.disabled = this.busy || !this.lastSwap;
    }
    setStatus(text) {
      this.statusEl.textContent = text;
    }
    appendLog(text) {
      this.logEl.textContent += (this.logEl.textContent ? "\n" : "") + text;
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }
    releaseNextPhase() {
      const r = this.nextPhaseResolver;
      this.nextPhaseResolver = null;
      this.nextBtn.disabled = true;
      r == null ? void 0 : r();
    }
    async pauseIfSubstep(label) {
      if (!this.substepEnabled) return;
      this.setStatus(`\u23F8 \u5DF2\u6682\u505C\uFF1A${label}\uFF08\u6309 Space \u6216\u70B9\u201C\u4E0B\u4E00\u6B65\u201D\u7EE7\u7EED\uFF09`);
      this.nextBtn.disabled = false;
      await new Promise((resolve) => {
        this.nextPhaseResolver = resolve;
      });
    }
    runTween(durationSec, ease, onUpdate) {
      const dur = Math.max(0.015, durationSec / this.speed);
      return new Promise((resolve) => {
        this.tweens.push({ elapsed: 0, duration: dur, ease, onUpdate, resolve });
      });
    }
    waitSec(sec) {
      return this.runTween(sec, "linear", () => {
      });
    }
    async playShake(intensity) {
      this.shakeX = 6 * intensity;
      this.shakeY = -5 * intensity;
      await this.waitSec(0.05);
      this.shakeX = -5 * intensity;
      this.shakeY = 4 * intensity;
      await this.waitSec(0.05);
      this.shakeX = 0;
      this.shakeY = 0;
    }
    spawnParticles(event, cells) {
      const count = Math.min(cells.length * 3, 36);
      for (let k = 0; k < count; k++) {
        const cell = cells[k % cells.length];
        const orig = event.before[cell];
        if (!orig) continue;
        const p = this.cellPoint(cell);
        const ang = Math.random() * Math.PI * 2;
        const spd = 110 + Math.random() * 220;
        const maxLife = 0.55 / this.speed;
        this.ghosts.push({
          color: orig.color,
          level: orig.level,
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          rot: 0,
          vRot: (Math.random() - 0.5) * 10,
          life: maxLife,
          maxLife
        });
      }
    }
    spawnWaveRings(wave) {
      const color = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
      for (const src of wave.sources) {
        const p = this.cellPoint(src);
        if (wave.kind === "rainbow") {
          const rainbowCols = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#a855f7"];
          rainbowCols.forEach((rc, idx) => {
            const maxLife = (0.48 + idx * 0.06) / this.speed;
            this.rings.push({
              x: p.x,
              y: p.y,
              color: rc,
              radius: 20 + idx * 10,
              maxRadius: 210 + idx * 24,
              life: maxLife,
              maxLife
            });
          });
        } else {
          const maxLife = 0.42 / this.speed;
          this.rings.push({
            x: p.x,
            y: p.y,
            color,
            radius: 26,
            maxRadius: wave.kind === "ring" ? 155 : 115,
            life: maxLife,
            maxLife
          });
        }
      }
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
    async playSwap(a, b) {
      if (this.busy) return;
      if (!validSwap(this.state, a, b)) return;
      this.busy = true;
      this.snapshotBeforeSwap = cloneState(this.state);
      this.lastSwap = [a, b];
      this.selected = -1;
      this.preview = { valid: false };
      this.updateButtons();
      this.logEl.textContent = "";
      const result = resolveSwap(this.state, a, b);
      this.setStatus("\u4EA4\u6362\u68CB\u5B50...");
      await this.animateBoardPositions(result.swapped, 0.22);
      let totalDmg = 0;
      for (const event of result.events) {
        this.activeEvent = event;
        this.activeWaveIndex = -1;
        this.highlightCells.clear();
        this.activeBeamCells.clear();
        for (const line of event.lines) {
          for (const c of line.cells) this.highlightCells.add(c);
        }
        this.setStatus(`\u7B2C ${event.number} \u8F6E \xB7 [\u9636\u6BB51] \u5339\u914D\u4EAE\u8D77\uFF08${event.lines.length} \u6761\u7EBF\uFF09`);
        this.appendLog(
          `\u3010\u7B2C ${event.number} \u8F6E\u3011\u5339\u914D ${event.lines.length} \u6761\u7EBF | \u7EAF\u5408\u6210 ${event.centers.length} \u7EC4 | \u7206\u53D1 ${event.waves.length} \u6CE2`
        );
        const matchVisuals = Array.from(this.highlightCells).map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v));
        await this.runTween(0.24, "backOut", (t) => {
          for (const v of matchVisuals) v.scale = 1 + 0.18 * Math.sin(t * Math.PI);
        });
        await this.pauseIfSubstep(`\u7B2C ${event.number} \u8F6E \xB7 \u5339\u914D\u4EAE\u8D77`);
        const mergeItems = [];
        for (const center of event.centers) {
          const cp = this.cellPoint(center.cell);
          for (const cell of center.members) {
            if (cell === center.cell) continue;
            const cat = event.before[cell];
            if (!cat) continue;
            const vis = this.visuals.get(cat.id);
            if (vis) mergeItems.push({ vis, sx: vis.x, sy: vis.y, tx: cp.x, ty: cp.y });
          }
        }
        if (mergeItems.length > 0) {
          this.setStatus(`\u7B2C ${event.number} \u8F6E \xB7 \u7EAF\u5C0F\u732B\u5411\u4E2D\u5FC3\u5408\u6210\u5927\u732B`);
          await this.runTween(0.24, "cubicInOut", (t) => {
            for (const m of mergeItems) {
              m.vis.x = m.sx + (m.tx - m.sx) * t;
              m.vis.y = m.sy + (m.ty - m.sy) * t;
              m.vis.scale = 1 - 0.75 * t;
            }
          });
        }
        for (const wave of event.waves) {
          this.activeWaveIndex = wave.wave;
          this.activeBeamColor = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
          this.activeBeamCells = new Set(wave.affected);
          const waveTitle = wave.kind === "rainbow" ? `Wave ${wave.wave} \u{1F308} \u70AB\u5F69\u732B 6 \u65B9\u5411\u5168\u5411\u5BBD\u5149\u675F\uFF08\u65B0\u6E05 ${wave.cells.length} \u683C\uFF0C\u4F24 ${wave.damage}\uFF09` : wave.wave === 0 ? `Wave 0 \u5BBD\u5149\u675F\u4E3B\u7206\u53D1\uFF08\u6E05 ${wave.cells.length} \u683C\uFF0C\u4F24 ${wave.damage}\uFF09` : `Wave ${wave.wave} \u8FDE\u9501\u4E8C\u6B21\u5F15\u7206\uFF08${wave.sources.length} \u53EA\u5927\u732B\u70B8\u5468\u56F41\u5708\uFF0C\u65B0\u6E05 ${wave.cells.length} \u683C\uFF0C\u4F24 ${wave.damage}\uFF09`;
          this.setStatus(`\u7B2C ${event.number} \u8F6E \xB7 ${waveTitle}`);
          this.appendLog(`  \u21B3 ${waveTitle}`);
          if (wave.wave > 0) {
            const srcVisuals = wave.sources.map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v));
            if (srcVisuals.length > 0) {
              await this.runTween(0.16, "backOut", (t) => {
                for (const v of srcVisuals) {
                  v.scale = 1 + 0.38 * t;
                  v.flash = t;
                }
              });
            }
          }
          const hitVisuals = wave.cells.map((c) => event.before[c]).filter((c) => Boolean(c)).map((c) => this.visuals.get(c.id)).filter((v) => Boolean(v));
          for (const v of hitVisuals) v.flash = 1;
          this.spawnWaveRings(wave);
          await this.waitSec(0.1);
          this.spawnParticles(event, wave.cells);
          void this.playShake(1 + Math.min(wave.wave, 3) * 0.4);
          for (const cell of wave.cells) {
            const orig = event.before[cell];
            if (orig) this.visuals.delete(orig.id);
          }
          await this.waitSec(0.28);
          await this.pauseIfSubstep(`\u7B2C ${event.number} \u8F6E \xB7 Wave ${wave.wave} \u5B8C\u6210`);
        }
        this.activeBeamCells.clear();
        this.highlightCells.clear();
        this.activeWaveIndex = 99;
        this.syncVisuals(event.afterClear);
        totalDmg += event.damage;
        this.appendLog(`  \u2713 \u672C\u8F6E\u603B\u4F24\u5BB3\uFF1A\u57FA\u7840 ${event.baseDamage} + \u8FDE\u51FB ${event.bonus} = ${event.damage}`);
        const newBigs = [];
        for (const center of event.centers) {
          if (!center.survives) continue;
          const cat = event.afterClear[center.cell];
          const vis = cat ? this.visuals.get(cat.id) : void 0;
          if (vis) {
            vis.scale = 0.35;
            newBigs.push(vis);
          }
        }
        if (newBigs.length > 0) {
          await this.runTween(0.26, "backOut", (t) => {
            for (const v of newBigs) v.scale = 0.35 + 0.65 * t;
          });
        }
        if (event.moves.length > 0) {
          this.setStatus(`\u7B2C ${event.number} \u8F6E \xB7 [\u9636\u6BB54] \u5B9A\u5411\u6536\u7F29\uFF08${event.moves.length} \u6B21\u4F4D\u79FB\uFF09`);
          this.appendLog(`  \u21B3 \u5B9A\u5411\u6536\u7F29\uFF1A${event.moves.length} \u53EA\u732B\u538B\u7D27`);
          for (const move of event.moves) {
            const vis = this.visuals.get(move.id);
            if (!vis) continue;
            const sx = vis.x;
            const sy = vis.y;
            const tp = this.cellPoint(move.to);
            await this.runTween(0.08, "cubicInOut", (t) => {
              vis.x = sx + (tp.x - sx) * t;
              vis.y = sy + (tp.y - sy) * t;
            });
          }
          this.syncVisuals(event.afterCollapse);
          await this.pauseIfSubstep(`\u7B2C ${event.number} \u8F6E \xB7 \u5B9A\u5411\u6536\u7F29\u5B8C\u6210`);
        }
        if (event.spawn.length > 0) {
          this.setStatus(`\u7B2C ${event.number} \u8F6E \xB7 [\u9636\u6BB55] \u8865\u732B\u5165\u573A\uFF08${event.spawn.length} \u53EA\uFF09`);
          const spawns = [];
          for (const sp of event.spawn) {
            const tp = this.cellPoint(sp.cell);
            let sx = tp.x;
            let sy = tp.y;
            if (sp.edge) {
              const dx = tp.x - CANVAS_W / 2;
              const dy = tp.y - CANVAS_H / 2;
              const len = Math.hypot(dx, dy) || 1;
              sx = tp.x + dx / len * 70;
              sy = tp.y + dy / len * 70;
            }
            const vis = {
              id: sp.cat.id,
              color: sp.cat.color,
              level: sp.cat.level,
              x: sx,
              y: sy,
              scale: 0.1,
              alpha: 1,
              flash: 0
            };
            this.visuals.set(vis.id, vis);
            spawns.push({ vis, sx, sy, tx: tp.x, ty: tp.y });
          }
          await this.runTween(0.24, "backOut", (t) => {
            const pt = Math.min(1, t);
            for (const s of spawns) {
              s.vis.x = s.sx + (s.tx - s.sx) * pt;
              s.vis.y = s.sy + (s.ty - s.sy) * pt;
              s.vis.scale = Math.max(0.1, 0.1 + 0.9 * t);
            }
          });
          this.syncVisuals(event.after);
          await this.pauseIfSubstep(`\u7B2C ${event.number} \u8F6E \xB7 \u8865\u732B\u5B8C\u6210`);
        }
      }
      this.state = result.state;
      this.activeEvent = null;
      this.activeWaveIndex = -1;
      this.syncVisuals(this.state.board);
      this.busy = false;
      this.updateButtons();
      this.setStatus(`\u7ED3\u7B97\u5B8C\u6210\uFF01\u5171 ${result.events.length} \u8F6E\uFF0C\u7D2F\u8BA1\u4F24\u5BB3 ${totalDmg}\uFF08\u53EF\u70B9\u201C\u91CD\u653E\u521A\u624D\u5C40\u9762\u201D\u53CD\u590D\u89C2\u5BDF\uFF09`);
      this.appendLog(`=== \u672C\u6B21\u4EA4\u6362\u7ED3\u675F\uFF1A\u5171 ${result.events.length} \u8F6E\uFF0C\u603B\u4F24 ${totalDmg} ===`);
    }
    update(dt) {
      this.elapsed += dt;
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
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vy += 320 * dt;
        g.rot += g.vRot * dt;
        if (g.life <= 0) this.ghosts.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        const p = 1 - Math.max(0, r.life / r.maxLife);
        r.radius = 24 + (r.maxRadius - 24) * easeCubicInOut(p);
        if (r.life <= 0) this.rings.splice(i, 1);
      }
    }
    drawHex(ctx, x, y, r) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI / 3 * i;
        const px = x + Math.cos(ang) * r;
        const py = y + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    drawArrow(ctx, ax, ay, bx, by, color, width) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = 15;
      const cos = Math.cos(0.5);
      const sin = Math.sin(0.5);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = width + 4;
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
    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, "#f4d9b4");
      grad.addColorStop(1, "#e6be8c");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.save();
      ctx.translate(this.shakeX, this.shakeY);
      for (let i = 0; i < CELL_COUNT; i++) {
        const p = this.cellPoint(i);
        const cat = this.state.board[i];
        this.drawHex(ctx, p.x, p.y, HEX_RADIUS);
        ctx.fillStyle = "#fff9f0";
        ctx.fill();
        ctx.strokeStyle = i === this.selected ? "#d97706" : i === this.hoverCell ? "#8c5a3c" : (cat == null ? void 0 : cat.level) === 2 ? "#e8a923" : cat ? CAT_PALETTE[cat.color % CAT_PALETTE.length] : "#d8c2a8";
        ctx.lineWidth = i === this.selected ? 5 : 3;
        ctx.stroke();
        if (this.activeBeamCells.has(i)) {
          this.drawHex(ctx, p.x, p.y, HEX_RADIUS - 3);
          ctx.fillStyle = `${this.activeBeamColor}44`;
          ctx.fill();
        }
        if (this.highlightCells.has(i)) {
          this.drawHex(ctx, p.x, p.y, HEX_RADIUS - 3);
          ctx.fillStyle = "rgba(255, 224, 102, 0.36)";
          ctx.fill();
        }
      }
      for (const vis of this.visuals.values()) {
        drawCatSprite(
          ctx,
          {
            x: vis.x,
            y: vis.y,
            colorId: vis.color,
            level: vis.level,
            scale: vis.scale,
            alpha: vis.alpha,
            elapsed: this.elapsed,
            animState: this.animPreviewMode,
            seedOffset: vis.id,
            grabElapsed: this.elapsed
          },
          this.assets
        );
        if (vis.flash > 0.05) {
          ctx.save();
          ctx.globalAlpha = vis.flash * 0.72;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(vis.x, vis.y, 38 * vis.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      for (const r of this.rings) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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
      const overlayEvent = this.preview.valid && this.preview.event ? this.preview.event : this.activeEvent;
      if (this.showOverlay && overlayEvent) {
        const cellWaveMap = /* @__PURE__ */ new Map();
        for (const wave of overlayEvent.waves) {
          for (const c of wave.cells) cellWaveMap.set(c, wave.wave);
        }
        for (const [cell, wIdx] of cellWaveMap.entries()) {
          const p = this.cellPoint(cell);
          const col = WAVE_COLORS[Math.min(wIdx, WAVE_COLORS.length - 1)];
          this.drawHex(ctx, p.x, p.y, HEX_RADIUS - 5);
          ctx.strokeStyle = col;
          ctx.lineWidth = 3.5;
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.roundRect(p.x + 14, p.y - 42, 32, 18, 6);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = `800 11px ${FONT_FAMILY2}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`W${wIdx}`, p.x + 30, p.y - 33);
        }
        for (const center of overlayEvent.centers) {
          const p = this.cellPoint(center.cell);
          ctx.strokeStyle = center.resultLevel === 3 ? "#d946ef" : "#38b583";
          ctx.lineWidth = center.resultLevel === 3 ? 5.5 : 4.5;
          ctx.setLineDash([8, 5]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 48, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (const path of overlayEvent.rays) {
          if (path.length >= 2) {
            const a = this.cellPoint(path[0]);
            const b = this.cellPoint(path[path.length - 1]);
            this.drawArrow(ctx, a.x, a.y, b.x, b.y, "#ff6b35", 5);
          }
        }
        for (const move of overlayEvent.moves) {
          const a = this.cellPoint(move.from);
          const b = this.cellPoint(move.to);
          this.drawArrow(ctx, a.x, a.y, b.x, b.y, "#3bb5a5", 3.5);
        }
      }
      if (this.state.suggested && !this.busy && this.mode === "play" && this.selected < 0) {
        const a = this.cellPoint(this.state.suggested[0]);
        const b = this.cellPoint(this.state.suggested[1]);
        this.drawArrow(ctx, a.x, a.y, b.x, b.y, "#f59e0b", 6);
      }
      ctx.restore();
      ctx.fillStyle = "rgba(78, 52, 46, 0.72)";
      ctx.font = `700 13px ${FONT_FAMILY2}`;
      ctx.textAlign = "left";
      ctx.fillText(
        `\u89C4\u5219 v${this.state.ruleVersion} \xB7 ${this.mode === "paint" ? "\u81EA\u7531\u6446\u68CB\u6A21\u5F0F" : "\u4EA4\u4E92\u6D4B\u8BD5\u6A21\u5F0F"} \xB7 \u500D\u901F ${this.speed}\xD7`,
        18,
        26
      );
    }
  };
  new CatBoomLab().start();
})();
