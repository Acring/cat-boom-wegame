import { GameAssets, loadGameAssets } from './assets';
import { CAT_PALETTE, CatAnimState, drawCatSprite } from './catRender';
import { FIXTURE_GROUPS, FIXTURE_NAMES, loadFixture } from './fixtures';
import {
  BlastWave,
  Board,
  CatData,
  CatLevel,
  CELL_COUNT,
  cloneState,
  GameState,
  neighbors,
  newGame,
  position,
  PreviewResult,
  previewSwap,
  resolveSwap,
  RoundEvent,
  validSwap,
} from './rules';

const CANVAS_W = 760;
const CANVAS_H = 840;
const ORIGIN_X = 96.5;
const ORIGIN_Y = 104;
const HEX_STEP = 63.0;
const HEX_RADIUS = 56.0;
const INK = '#4e342e';
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';
const WAVE_COLORS = ['#ff9852', '#ff4d8d', '#a855f7', '#ec4899'];

interface CatVisual {
  id: number;
  color: number;
  level: CatLevel;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  flash: number;
}

interface GhostParticle {
  color: number;
  level: CatLevel;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  color: string;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface ActiveTween {
  elapsed: number;
  duration: number;
  ease: 'linear' | 'cubicInOut' | 'backOut';
  onUpdate: (t: number) => void;
  resolve: () => void;
}

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeBackOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

class CatBoomLab {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private assets: GameAssets;

  private state!: GameState;
  private snapshotBeforeSwap!: GameState;
  private lastSwap: [number, number] | null = null;

  private selected = -1;
  private hoverCell = -1;
  private preview: PreviewResult = { valid: false };

  private mode: 'play' | 'paint' = 'play';
  private paintColor = 0;
  private paintLevel: 0 | CatLevel = 1;

  private speed = 0.5;
  private substepEnabled = true;
  private showOverlay = true;
  private animPreviewMode: CatAnimState = 'idle';
  private busy = false;
  private nextPhaseResolver: (() => void) | null = null;

  // 当前演出可视化状态
  private activeEvent: RoundEvent | null = null;
  private activeWaveIndex = -1; // -1=未开始, 0..N=正在播第几波, 99=波次播完
  private highlightCells = new Set<number>();
  private activeBeamCells = new Set<number>();
  private activeBeamColor = WAVE_COLORS[0];

  private visuals = new Map<number, CatVisual>();
  private ghosts: GhostParticle[] = [];
  private rings: ShockwaveRing[] = [];
  private tweens: ActiveTween[] = [];
  private shakeX = 0;
  private shakeY = 0;
  private elapsed = 0;
  private lastMs = 0;

  // DOM 句柄
  private statusEl = document.getElementById('phase-status')!;
  private logEl = document.getElementById('log-box')!;
  private nextBtn = document.getElementById('btn-next-phase') as HTMLButtonElement;
  private runSuggestedBtn = document.getElementById('btn-run-suggested') as HTMLButtonElement;
  private replayBtn = document.getElementById('btn-replay') as HTMLButtonElement;

  constructor() {
    this.canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CANVAS_W * dpr;
    this.canvas.height = CANVAS_H * dpr;
    this.canvas.style.width = `${CANVAS_W}px`;
    this.canvas.style.height = `${CANVAS_H}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.assets = loadGameAssets();
    this.bindUI();
    this.bindCanvas();
    // 默认加载 7 号“二连环二次引爆”，进实验室一眼就能测试新规则
    this.loadPreset(7);
  }

  public start(): void {
    this.lastMs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastMs) / 1000));
      this.lastMs = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private cellPoint(cell: number): { x: number; y: number } {
    const p = position(cell);
    return {
      x: ORIGIN_X + p.x * HEX_STEP,
      y: ORIGIN_Y + p.y * HEX_STEP,
    };
  }

  private hitTestCell(x: number, y: number): number {
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

  private syncVisuals(board: Board): void {
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
        flash: 0,
      });
    }
  }

  private bindUI(): void {
    const fixtureContainer = document.getElementById('fixture-buttons')!;
    FIXTURE_GROUPS.forEach((group) => {
      const wrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'fixture-group-title';
      title.textContent = group.title;
      wrap.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'btn-grid';
      group.ids.forEach((idx) => {
        const btn = document.createElement('button');
        btn.textContent = FIXTURE_NAMES[idx];
        btn.dataset.fixture = String(idx);
        btn.addEventListener('click', () => this.loadPreset(idx));
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
      fixtureContainer.appendChild(wrap);
    });

    this.runSuggestedBtn.addEventListener('click', () => {
      if (this.busy) return;
      if (this.state.suggested) {
        void this.playSwap(this.state.suggested[0], this.state.suggested[1]);
      }
    });

    this.replayBtn.addEventListener('click', () => {
      if (this.busy) return;
      if (!this.snapshotBeforeSwap) return;
      this.restoreSnapshot(this.snapshotBeforeSwap);
      if (this.lastSwap) {
        void this.playSwap(this.lastSwap[0], this.lastSwap[1]);
      }
    });

    const speedButtons = document.querySelectorAll<HTMLButtonElement>('#speed-buttons button');
    speedButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.speed = Number(btn.dataset.speed || 1);
        speedButtons.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const chkSubstep = document.getElementById('chk-substep') as HTMLInputElement;
    chkSubstep.addEventListener('change', () => {
      this.substepEnabled = chkSubstep.checked;
      if (!this.substepEnabled && this.nextPhaseResolver) {
        this.releaseNextPhase();
      }
    });

    const chkOverlay = document.getElementById('chk-overlay') as HTMLInputElement;
    chkOverlay.addEventListener('change', () => {
      this.showOverlay = chkOverlay.checked;
    });

    const animBtns = document.querySelectorAll<HTMLButtonElement>('#anim-preview-buttons button');
    animBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.animPreviewMode = (btn.dataset.anim || 'idle') as CatAnimState;
        animBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    this.nextBtn.addEventListener('click', () => this.releaseNextPhase());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.nextPhaseResolver) {
        e.preventDefault();
        this.releaseNextPhase();
      }
    });

    const modePlay = document.getElementById('mode-play')!;
    const modePaint = document.getElementById('mode-paint')!;
    const paintTools = document.getElementById('paint-tools')!;
    const setMode = (m: 'play' | 'paint') => {
      this.mode = m;
      this.selected = -1;
      this.preview = { valid: false };
      modePlay.classList.toggle('active', m === 'play');
      modePaint.classList.toggle('active', m === 'paint');
      paintTools.style.display = m === 'paint' ? 'flex' : 'none';
      this.setStatus(
        m === 'paint'
          ? '摆棋模式：点击任意格子修改猫咪颜色/等级，改完切回交互模式测试'
          : '交互模式：选猫并悬停相邻猫预览，点击执行交换'
      );
    };
    modePlay.addEventListener('click', () => setMode('play'));
    modePaint.addEventListener('click', () => setMode('paint'));

    const colorBtns = document.querySelectorAll<HTMLButtonElement>('#color-buttons button');
    colorBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.paintColor = Number(btn.dataset.color || 0);
        colorBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const levelBtns = document.querySelectorAll<HTMLButtonElement>('#level-buttons button');
    levelBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.paintLevel = Number(btn.dataset.level || 1) as 0 | CatLevel;
        levelBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('btn-random-board')!.addEventListener('click', () => {
      if (this.busy) return;
      this.state = newGame(Math.floor(Date.now() % 100000));
      this.snapshotBeforeSwap = cloneState(this.state);
      this.lastSwap = null;
      this.clearPlaybackState();
      this.syncVisuals(this.state.board);
      this.updateButtons();
      this.setStatus('已生成随机棋盘，可自由摆棋或直接交换测试');
      this.logEl.textContent = '随机棋盘已就绪。';
    });
  }

  private bindCanvas(): void {
    const getPos = (ev: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - rect.left) / rect.width) * CANVAS_W,
        y: ((ev.clientY - rect.top) / rect.height) * CANVAS_H,
      };
    };

    this.canvas.addEventListener('mousemove', (ev) => {
      if (this.busy || this.mode !== 'play') return;
      const p = getPos(ev);
      const cell = this.hitTestCell(p.x, p.y);
      this.hoverCell = cell;
      if (this.selected >= 0 && cell >= 0 && cell !== this.selected && neighbors(this.selected).includes(cell)) {
        this.preview = previewSwap(this.state, this.selected, cell);
      } else {
        this.preview = { valid: false };
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverCell = -1;
      this.preview = { valid: false };
    });

    this.canvas.addEventListener('click', (ev) => {
      if (this.busy) return;
      const p = getPos(ev);
      const cell = this.hitTestCell(p.x, p.y);
      if (cell < 0) return;

      if (this.mode === 'paint') {
        if (this.paintLevel === 0) {
          this.state.board[cell] = null;
        } else {
          const id = this.state.nextId++;
          this.state.board[cell] = { id, color: this.paintColor, level: this.paintLevel };
        }
        this.state.suggested = undefined;
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
          this.setStatus('这次交换没有形成同色三连，请换一对相邻猫');
          this.selected = cell;
          this.preview = { valid: false };
        }
      } else if (this.state.board[cell]) {
        this.selected = cell;
        this.preview = { valid: false };
      }
    });
  }

  private loadPreset(id: number): void {
    if (this.busy) return;
    this.state = loadFixture(id);
    this.snapshotBeforeSwap = cloneState(this.state);
    this.lastSwap = this.state.suggested ? [this.state.suggested[0], this.state.suggested[1]] : null;
    this.clearPlaybackState();
    this.syncVisuals(this.state.board);
    this.updateButtons();

    const btns = document.querySelectorAll<HTMLButtonElement>('#fixture-buttons button');
    btns.forEach((b) => b.classList.toggle('active', Number(b.dataset.fixture) === id));

    this.setStatus(`已加载预设：${FIXTURE_NAMES[id]}（点右侧“执行推荐交换”或直接点击金色箭头两端）`);
    this.logEl.textContent = `预设「${FIXTURE_NAMES[id]}」已加载。\n提示：开启“按子阶段自动暂停”后，可用 Space 逐帧观察每一波爆炸。`;
  }

  private restoreSnapshot(snap: GameState): void {
    this.state = cloneState(snap);
    this.clearPlaybackState();
    this.syncVisuals(this.state.board);
    this.updateButtons();
  }

  private clearPlaybackState(): void {
    this.selected = -1;
    this.preview = { valid: false };
    this.activeEvent = null;
    this.activeWaveIndex = -1;
    this.highlightCells.clear();
    this.activeBeamCells.clear();
    this.ghosts = [];
    this.rings = [];
  }

  private updateButtons(): void {
    this.runSuggestedBtn.disabled = this.busy || !this.state.suggested;
    this.replayBtn.disabled = this.busy || !this.lastSwap;
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private appendLog(text: string): void {
    this.logEl.textContent += (this.logEl.textContent ? '\n' : '') + text;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private releaseNextPhase(): void {
    const r = this.nextPhaseResolver;
    this.nextPhaseResolver = null;
    this.nextBtn.disabled = true;
    r?.();
  }

  private async pauseIfSubstep(label: string): Promise<void> {
    if (!this.substepEnabled) return;
    this.setStatus(`⏸ 已暂停：${label}（按 Space 或点“下一步”继续）`);
    this.nextBtn.disabled = false;
    await new Promise<void>((resolve) => {
      this.nextPhaseResolver = resolve;
    });
  }

  private runTween(
    durationSec: number,
    ease: 'linear' | 'cubicInOut' | 'backOut',
    onUpdate: (t: number) => void
  ): Promise<void> {
    const dur = Math.max(0.015, durationSec / this.speed);
    return new Promise((resolve) => {
      this.tweens.push({ elapsed: 0, duration: dur, ease, onUpdate, resolve });
    });
  }

  private waitSec(sec: number): Promise<void> {
    return this.runTween(sec, 'linear', () => {});
  }

  private async playShake(intensity: number): Promise<void> {
    this.shakeX = 6 * intensity;
    this.shakeY = -5 * intensity;
    await this.waitSec(0.05);
    this.shakeX = -5 * intensity;
    this.shakeY = 4 * intensity;
    await this.waitSec(0.05);
    this.shakeX = 0;
    this.shakeY = 0;
  }

  private spawnParticles(event: RoundEvent, cells: number[]): void {
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
        maxLife,
      });
    }
  }

  private spawnWaveRings(wave: BlastWave): void {
    const color = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
    for (const src of wave.sources) {
      const p = this.cellPoint(src);
      if (wave.kind === 'rainbow') {
        // 炫彩猫 6 方向全向爆发：3 道彩虹冲击波扩散
        const rainbowCols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#a855f7'];
        rainbowCols.forEach((rc, idx) => {
          const maxLife = (0.48 + idx * 0.06) / this.speed;
          this.rings.push({
            x: p.x,
            y: p.y,
            color: rc,
            radius: 20 + idx * 10,
            maxRadius: 210 + idx * 24,
            life: maxLife,
            maxLife,
          });
        });
      } else {
        const maxLife = 0.42 / this.speed;
        this.rings.push({
          x: p.x,
          y: p.y,
          color,
          radius: 26,
          maxRadius: wave.kind === 'ring' ? 155 : 115,
          life: maxLife,
          maxLife,
        });
      }
    }
  }

  private async animateBoardPositions(board: Board, duration: number): Promise<void> {
    const targets: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number }> = [];
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
    await this.runTween(duration, 'cubicInOut', (t) => {
      for (const item of targets) {
        item.vis.x = item.sx + (item.tx - item.sx) * t;
        item.vis.y = item.sy + (item.ty - item.sy) * t;
      }
    });
  }

  private async playSwap(a: number, b: number): Promise<void> {
    if (this.busy) return;
    if (!validSwap(this.state, a, b)) return;

    this.busy = true;
    this.snapshotBeforeSwap = cloneState(this.state);
    this.lastSwap = [a, b];
    this.selected = -1;
    this.preview = { valid: false };
    this.updateButtons();
    this.logEl.textContent = '';

    const result = resolveSwap(this.state, a, b);
    this.setStatus('交换棋子...');
    await this.animateBoardPositions(result.swapped, 0.22);

    let totalDmg = 0;

    for (const event of result.events) {
      this.activeEvent = event;
      this.activeWaveIndex = -1;
      this.highlightCells.clear();
      this.activeBeamCells.clear();

      // 子阶段 1：匹配亮起
      for (const line of event.lines) {
        for (const c of line.cells) this.highlightCells.add(c);
      }
      this.setStatus(`第 ${event.number} 轮 · [阶段1] 匹配亮起（${event.lines.length} 条线）`);
      this.appendLog(
        `【第 ${event.number} 轮】匹配 ${event.lines.length} 条线 | 纯合成 ${event.centers.length} 组 | 爆发 ${event.waves.length} 波`
      );
      const matchVisuals = Array.from(this.highlightCells)
        .map((c) => event.before[c])
        .filter((c): c is CatData => Boolean(c))
        .map((c) => this.visuals.get(c.id))
        .filter((v): v is CatVisual => Boolean(v));
      await this.runTween(0.24, 'backOut', (t) => {
        for (const v of matchVisuals) v.scale = 1 + 0.18 * Math.sin(t * Math.PI);
      });
      await this.pauseIfSubstep(`第 ${event.number} 轮 · 匹配亮起`);

      // 纯小猫合成汇聚
      const mergeItems: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number }> = [];
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
        this.setStatus(`第 ${event.number} 轮 · 纯小猫向中心合成大猫`);
        await this.runTween(0.24, 'cubicInOut', (t) => {
          for (const m of mergeItems) {
            m.vis.x = m.sx + (m.tx - m.sx) * t;
            m.vis.y = m.sy + (m.ty - m.sy) * t;
            m.vis.scale = 1 - 0.75 * t;
          }
        });
      }

      // 子阶段 2 & 3：逐波爆发（Wave 0 宽光束 → Wave 1+ 周围 1 圈连锁引爆）
      for (const wave of event.waves) {
        this.activeWaveIndex = wave.wave;
        this.activeBeamColor = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
        this.activeBeamCells = new Set(wave.affected);

        const waveTitle =
          wave.kind === 'rainbow'
            ? `Wave ${wave.wave} 🌈 炫彩猫 6 方向全向宽光束（新清 ${wave.cells.length} 格，伤 ${wave.damage}）`
            : wave.wave === 0
              ? `Wave 0 宽光束主爆发（清 ${wave.cells.length} 格，伤 ${wave.damage}）`
              : `Wave ${wave.wave} 连锁二次引爆（${wave.sources.length} 只大猫炸周围1圈，新清 ${wave.cells.length} 格，伤 ${wave.damage}）`;

        this.setStatus(`第 ${event.number} 轮 · ${waveTitle}`);
        this.appendLog(`  ↳ ${waveTitle}`);

        if (wave.wave > 0) {
          // 二次引爆预警脉冲
          const srcVisuals = wave.sources
            .map((c) => event.before[c])
            .filter((c): c is CatData => Boolean(c))
            .map((c) => this.visuals.get(c.id))
            .filter((v): v is CatVisual => Boolean(v));
          if (srcVisuals.length > 0) {
            await this.runTween(0.16, 'backOut', (t) => {
              for (const v of srcVisuals) {
                v.scale = 1 + 0.38 * t;
                v.flash = t;
              }
            });
          }
        }

        // 受击格闪白顿帧
        const hitVisuals = wave.cells
          .map((c) => event.before[c])
          .filter((c): c is CatData => Boolean(c))
          .map((c) => this.visuals.get(c.id))
          .filter((v): v is CatVisual => Boolean(v));
        for (const v of hitVisuals) v.flash = 1;
        this.spawnWaveRings(wave);
        await this.waitSec(0.1);

        // 炸裂飞散 + 震屏
        this.spawnParticles(event, wave.cells);
        void this.playShake(1 + Math.min(wave.wave, 3) * 0.4);
        for (const cell of wave.cells) {
          const orig = event.before[cell];
          if (orig) this.visuals.delete(orig.id);
        }
        await this.waitSec(0.28);
        await this.pauseIfSubstep(`第 ${event.number} 轮 · Wave ${wave.wave} 完成`);
      }

      this.activeBeamCells.clear();
      this.highlightCells.clear();
      this.activeWaveIndex = 99;
      this.syncVisuals(event.afterClear);
      totalDmg += event.damage;
      this.appendLog(`  ✓ 本轮总伤害：基础 ${event.baseDamage} + 连击 ${event.bonus} = ${event.damage}`);

      // 新大猫弹跳出现
      const newBigs: CatVisual[] = [];
      for (const center of event.centers) {
        if (!center.survives) continue;
        const cat = event.afterClear[center.cell];
        const vis = cat ? this.visuals.get(cat.id) : undefined;
        if (vis) {
          vis.scale = 0.35;
          newBigs.push(vis);
        }
      }
      if (newBigs.length > 0) {
        await this.runTween(0.26, 'backOut', (t) => {
          for (const v of newBigs) v.scale = 0.35 + 0.65 * t;
        });
      }

      // 子阶段 4：收缩压紧
      if (event.moves.length > 0) {
        this.setStatus(`第 ${event.number} 轮 · [阶段4] 定向收缩（${event.moves.length} 次位移）`);
        this.appendLog(`  ↳ 定向收缩：${event.moves.length} 只猫压紧`);
        for (const move of event.moves) {
          const vis = this.visuals.get(move.id);
          if (!vis) continue;
          const sx = vis.x;
          const sy = vis.y;
          const tp = this.cellPoint(move.to);
          await this.runTween(0.08, 'cubicInOut', (t) => {
            vis.x = sx + (tp.x - sx) * t;
            vis.y = sy + (tp.y - sy) * t;
          });
        }
        this.syncVisuals(event.afterCollapse);
        await this.pauseIfSubstep(`第 ${event.number} 轮 · 定向收缩完成`);
      }

      // 子阶段 5：补猫入场
      if (event.spawn.length > 0) {
        this.setStatus(`第 ${event.number} 轮 · [阶段5] 补猫入场（${event.spawn.length} 只）`);
        const spawns: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number }> = [];
        for (const sp of event.spawn) {
          const tp = this.cellPoint(sp.cell);
          let sx = tp.x;
          let sy = tp.y;
          if (sp.edge) {
            const dx = tp.x - CANVAS_W / 2;
            const dy = tp.y - CANVAS_H / 2;
            const len = Math.hypot(dx, dy) || 1;
            sx = tp.x + (dx / len) * 70;
            sy = tp.y + (dy / len) * 70;
          }
          const vis: CatVisual = {
            id: sp.cat.id,
            color: sp.cat.color,
            level: sp.cat.level,
            x: sx,
            y: sy,
            scale: 0.1,
            alpha: 1,
            flash: 0,
          };
          this.visuals.set(vis.id, vis);
          spawns.push({ vis, sx, sy, tx: tp.x, ty: tp.y });
        }
        await this.runTween(0.24, 'backOut', (t) => {
          const pt = Math.min(1, t);
          for (const s of spawns) {
            s.vis.x = s.sx + (s.tx - s.sx) * pt;
            s.vis.y = s.sy + (s.ty - s.sy) * pt;
            s.vis.scale = Math.max(0.1, 0.1 + 0.9 * t);
          }
        });
        this.syncVisuals(event.after);
        await this.pauseIfSubstep(`第 ${event.number} 轮 · 补猫完成`);
      }
    }

    this.state = result.state;
    this.activeEvent = null;
    this.activeWaveIndex = -1;
    this.syncVisuals(this.state.board);
    this.busy = false;
    this.updateButtons();
    this.setStatus(`结算完成！共 ${result.events.length} 轮，累计伤害 ${totalDmg}（可点“重放刚才局面”反复观察）`);
    this.appendLog(`=== 本次交换结束：共 ${result.events.length} 轮，总伤 ${totalDmg} ===`);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      const raw = Math.min(1, tw.elapsed / tw.duration);
      const eased =
        tw.ease === 'cubicInOut'
          ? easeCubicInOut(raw)
          : tw.ease === 'backOut'
            ? easeBackOut(raw)
            : raw;
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

  private drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      const px = x + Math.cos(ang) * r;
      const py = y + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: string,
    width: number
  ): void {
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
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
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

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 暖木桌面背景
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#f4d9b4');
    grad.addColorStop(1, '#e6be8c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // 1. 六边形格子底槽
    for (let i = 0; i < CELL_COUNT; i++) {
      const p = this.cellPoint(i);
      const cat = this.state.board[i];
      this.drawHex(ctx, p.x, p.y, HEX_RADIUS);
      ctx.fillStyle = '#fff9f0';
      ctx.fill();
      ctx.strokeStyle =
        i === this.selected
          ? '#d97706'
          : i === this.hoverCell
            ? '#8c5a3c'
            : cat?.level === 2
              ? '#e8a923'
              : cat
                ? CAT_PALETTE[cat.color % 4]
                : '#d8c2a8';
      ctx.lineWidth = i === this.selected ? 5 : 3;
      ctx.stroke();

      // 正在爆发的宽光束/周围1圈高亮底色
      if (this.activeBeamCells.has(i)) {
        this.drawHex(ctx, p.x, p.y, HEX_RADIUS - 3);
        ctx.fillStyle = `${this.activeBeamColor}44`;
        ctx.fill();
      }
      if (this.highlightCells.has(i)) {
        this.drawHex(ctx, p.x, p.y, HEX_RADIUS - 3);
        ctx.fillStyle = 'rgba(255, 224, 102, 0.36)';
        ctx.fill();
      }
    }

    // 2. 猫咪精灵
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
          grabElapsed: this.elapsed,
        },
        this.assets
      );
      if (vis.flash > 0.05) {
        ctx.save();
        ctx.globalAlpha = vis.flash * 0.72;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(vis.x, vis.y, 38 * vis.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. 冲击波环
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

    // 4. 炸裂飞散粒子
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
          showBadge: false,
        },
        this.assets
      );
    }

    // 5. 调试范围与波次标签（悬停预览或播放中）
    const overlayEvent =
      this.preview.valid && this.preview.event ? this.preview.event : this.activeEvent;
    if (this.showOverlay && overlayEvent) {
      const cellWaveMap = new Map<number, number>();
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

        // 波次徽章 W0 / W1 / W2
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(p.x + 14, p.y - 42, 32, 18, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 11px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`W${wIdx}`, p.x + 30, p.y - 33);
      }

      for (const center of overlayEvent.centers) {
        const p = this.cellPoint(center.cell);
        ctx.strokeStyle = center.resultLevel === 3 ? '#d946ef' : '#38b583';
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
          this.drawArrow(ctx, a.x, a.y, b.x, b.y, '#ff6b35', 5);
        }
      }

      for (const move of overlayEvent.moves) {
        const a = this.cellPoint(move.from);
        const b = this.cellPoint(move.to);
        this.drawArrow(ctx, a.x, a.y, b.x, b.y, '#3bb5a5', 3.5);
      }
    }

    // 6. 推荐交换箭头
    if (this.state.suggested && !this.busy && this.mode === 'play' && this.selected < 0) {
      const a = this.cellPoint(this.state.suggested[0]);
      const b = this.cellPoint(this.state.suggested[1]);
      this.drawArrow(ctx, a.x, a.y, b.x, b.y, '#f59e0b', 6);
    }

    ctx.restore();

    // 左上角模式水印
    ctx.fillStyle = 'rgba(78, 52, 46, 0.72)';
    ctx.font = `700 13px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `规则 v${this.state.ruleVersion} · ${this.mode === 'paint' ? '自由摆棋模式' : '交互测试模式'} · 倍速 ${this.speed}×`,
      18,
      26
    );
  }
}

new CatBoomLab().start();
