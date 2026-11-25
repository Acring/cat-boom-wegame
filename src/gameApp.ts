import { GameAssets, loadGameAssets, type UiIconKey } from './assets';
import { SoundEngine } from './audio';
import { CatAnimState, drawCatSprite } from './catRender';
import { FIXTURE_NAMES, loadFixture } from './fixtures';
import type { Platform } from './platform';
import {
  applyBossPostTurnPassive,
  applyBossPreTurnSkill,
  applyPlayerPostTurnRelics,
  BOSSES,
  BossIntent,
  buildBossModifiers,
  buildPlayerModifiers,
  computeBossIntent,
  computeHintSwaps,
  createRoguelikeRun,
  createStageGameState,
  getBossProfile,
  getRelicDef,
  hasHintRelic,
  HintSet,
  RelicId,
  RoguelikeRun,
  rollRelicChoices,
  STAGE_CLEAR_HEAL,
} from './roguelike';
import {
  Board,
  CatData,
  CatLevel,
  CELL_COUNT,
  cloneState,
  findLegalSwaps,
  GameState,
  HP,
  neighbors,
  newGame,
  position,
  PreviewResult,
  previewSwap,
  resolveSwap,
  RoundEvent,
  RuleModifiers,
  validSwap,
} from './rules';

const VIRTUAL_W = 720;
const VIRTUAL_H = 1220;
const ORIGIN_X = 76.5;
const ORIGIN_Y = 266;
const HEX_STEP = 63.0;
const HEX_RADIUS = 59.0;
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';

// 阳光猫屋手绘贴纸配色表
const INK = '#4e342e';
const INK_SOFT = '#7a584c';
const NEST_RIM_COLORS = ['#ffd8ad', '#cde2f5', '#f6e2a1', '#ffd3df', '#cdebd7'] as const;
const NEST_EMPTY_RIM = '#f4e2c8';
const NEST_BIG_RIM = '#ffea9c';
const WAVE_COLORS = ['#ff9852', '#ff4d8d', '#a855f7', '#ec4899'] as const;

interface ButtonRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  icon?: UiIconKey;
  disabled?: boolean;
  accent?: boolean;
  round?: boolean;
  onClick: () => void;
}

interface CatVisual {
  id: number;
  color: number;
  level: CatLevel;
  x: number;
  y: number;
  scale: number;
  alpha: number;
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

interface FloatingDamage {
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
}

interface AmbientCatAnim {
  catId: number;
  frame: 1 | 2; // 1=轻甩尾, 2=轻眨眼
  elapsed: number;
  duration: number;
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

interface ComboLogEntry {
  label: string;
  deltaText: string;
  color: string;
}

interface ComboTracker {
  active: boolean;
  actorLabel: string;
  isPlayer: boolean;
  totalDamage: number;
  rounds: number;
  blastWaves: number;
  trueDamage: number;
  shieldBlocked: number;
  pulse: number;
  holdLife: number;
  maxHold: number;
  logs: ComboLogEntry[];
}

interface ActiveTween {
  elapsed: number;
  duration: number;
  ease: 'linear' | 'cubicInOut' | 'backOut';
  onUpdate: (t: number) => void;
  resolve: () => void;
}

interface LastTurnSummary {
  directDamage: number;
  totalDamage: number;
  rounds: number;
  deterministicMatches: number;
  opponentBest: number;
}

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeBackOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
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

/** 绘制圆角平顶六边形路径（用于手绘猫窝） */
function traceRoundedHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  cornerRadius: number
): void {
  const pts: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 6; k++) {
    const angle = (k * Math.PI * 2) / 6;
    pts.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
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

    const sx = curr.x - (d1x / l1) * r;
    const sy = curr.y - (d1y / l1) * r;
    const ex = curr.x + (d2x / l2) * r;
    const ey = curr.y + (d2y / l2) * r;

    if (k === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(curr.x, curr.y, ex, ey);
  }
  ctx.closePath();
}

function drawCuteStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  fill: string
): void {
  const innerR = outerR * 0.48;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = Math.cos(ang) * r;
    const py = Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

export class CatBoomApp {
  private readonly platform: Platform;
  private readonly assets: GameAssets;
  private readonly sound = new SoundEngine();
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private state!: GameState;
  private initialState!: GameState;
  private turnStart!: GameState;
  private legalCount = 0;
  private lastSummary: LastTurnSummary | null = null;

  private selected = -1;
  private previewTarget = -1;
  private preview: PreviewResult = { valid: false };
  private currentEvent: RoundEvent | null = null;
  private activeEventPhase: 'none' | 'match' | 'merge' | 'wave' | 'collapse' = 'none';
  private activeWaveIndex = -1;
  private statusText = '';
  private statusIcon: UiIconKey | null = null;

  // 触控拖动与按住拎起猫咪状态
  private dragStartCell = -1;
  private isDragging = false;
  private hoverPreviewed = false;
  private grabbedCell = -1;
  private grabbedCatId = -1;
  private grabPointerX = 0;
  private grabPointerY = 0;
  private grabSmoothX = 0;
  private grabSmoothY = 0;
  private grabTilt = 0;
  private grabElapsed = 0;

  // 模式与肉鸽闯关状态
  private gameMode: 'roguelike' | 'pvp' = 'roguelike';
  private run!: RoguelikeRun;
  private bossIntent: BossIntent | null = null;
  private bossHighlightSwap: [number, number] | null = null;
  private hintSet: HintSet = { highValue: [], fallback: null };

  // 控制选项
  private busy = false;
  private speed = 1.0;
  private shakeEnabled = true;
  private stepEnabled = false;
  private stepWaitResolver: (() => void) | null = null;
  private showRulesModal = false;
  private showDebugPanel = false;
  private showRelicsModal = false;

  // 渲染实体与动画
  private visuals = new Map<number, CatVisual>();
  private ambientAnims: AmbientCatAnim[] = [];
  private ambientSpawnTimer = 1.4;
  private lastAmbientCatId = -1;
  private ghosts: GhostParticle[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private floatings: FloatingDamage[] = [];
  private comboTracker: ComboTracker | null = null;
  private tweens: ActiveTween[] = [];
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private bannerText = '';
  private bannerIcon: UiIconKey | null = null;
  private bannerLife = 0;
  private bannerMaxLife = 1.6;
  private elapsed = 0;
  private lastFrameMs = 0;

  // 当前帧可点击按钮
  private buttons: ButtonRect[] = [];

  constructor(platform: Platform) {
    this.platform = platform;
    this.assets = loadGameAssets();
    this.computeViewport();
    this.bindInputs();
    this.startNewRoguelikeRun(Math.floor(Date.now() % 1000000));
  }

  public start(): void {
    this.lastFrameMs = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
      this.lastFrameMs = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private computeViewport(): void {
    const availW = this.platform.width;
    const availH = Math.max(240, this.platform.height - this.platform.topInset - this.platform.bottomInset);
    this.scale = Math.min(availW / VIRTUAL_W, availH / VIRTUAL_H);
    this.offsetX = (availW - VIRTUAL_W * this.scale) / 2;
    this.offsetY = this.platform.topInset + (availH - VIRTUAL_H * this.scale) / 2;
  }

  private toVirtual(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  private cellPoint(cell: number): { x: number; y: number } {
    const p = position(cell);
    return {
      x: ORIGIN_X + p.x * HEX_STEP,
      y: ORIGIN_Y + p.y * HEX_STEP,
    };
  }

  private getGrabLiftY(): number {
    return this.platform.isTouch ? 48 : 28;
  }

  private hitCell(vx: number, vy: number): number {
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

  private setStatus(text: string, icon: UiIconKey | null = null): void {
    this.statusText = text;
    this.statusIcon = icon;
  }

  private showBanner(text: string, duration = 1.6, icon: UiIconKey | null = null): void {
    this.bannerIcon = icon;
    this.bannerText = text;
    this.bannerMaxLife = duration;
    this.bannerLife = duration;
  }

  private isInputBlocked(): boolean {
    if (this.busy) return true;
    if (this.showRulesModal || this.showDebugPanel || this.showRelicsModal) return true;
    if (this.gameMode === 'roguelike') {
      if (this.run.phase !== 'battle' || this.state.player !== 0) return true;
    }
    return this.state.winner >= 0;
  }

  private getCurrentModifiers(forPlayer: 0 | 1): RuleModifiers | undefined {
    if (this.gameMode !== 'roguelike') return undefined;
    return forPlayer === 0 ? buildPlayerModifiers(this.run.relics) : buildBossModifiers(this.run);
  }

  private startNewRoguelikeRun(seed: number): void {
    if (this.busy) return;
    this.gameMode = 'roguelike';
    this.showDebugPanel = false;
    this.showRelicsModal = false;
    this.comboTracker = null;
    this.run = createRoguelikeRun(seed);
    // 先加载第 1 关棋盘作为开局起手 3 选 1 弹窗后的暖系背景
    const openingState = createStageGameState(this.run);
    this.loadState(openingState);
    this.bossIntent = null;
    this.setStatus('猫神起手礼：先选 1 个初始流派祝福开启闯关！', 'gift');
  }

  private startCurrentStage(): void {
    this.run.bossShield = 0;
    this.run.bossTurnsTaken = 0;
    this.run.calmDefuseActive = false;
    this.run.phase = 'battle';
    this.bossHighlightSwap = null;
    this.comboTracker = null;
    const stageState = createStageGameState(this.run);
    this.loadState(stageState);
    const boss = getBossProfile(this.run.stageIndex);
    this.showBanner(`第 ${boss.stage}/3 关 · ${boss.name} 登场！`, 1.8);
    this.refreshPlayerTurnGuides();
  }

  private chooseRewardRelic(id: RelicId): void {
    if (
      this.gameMode !== 'roguelike' ||
      (this.run.phase !== 'opening_reward' && this.run.phase !== 'reward')
    ) {
      return;
    }
    const isOpening = this.run.phase === 'opening_reward';
    this.run.relics.push(id);
    this.run.rewardChoices = [];
    if (!isOpening) {
      this.run.stageIndex += 1;
    }
    this.sound.playChime();
    this.startCurrentStage();
  }

  private refreshPlayerTurnGuides(): void {
    const canShowHints = this.gameMode === 'roguelike' && hasHintRelic(this.run.relics);
    this.hintSet = canShowHints
      ? computeHintSwaps(this.state, this.getCurrentModifiers(0))
      : { highValue: [], fallback: null };
    if (this.gameMode === 'roguelike' && this.run.phase === 'battle' && this.state.winner < 0) {
      const boss = getBossProfile(this.run.stageIndex);
      const mult = this.run.calmDefuseActive ? 0.7 : 1;
      this.bossIntent = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult);
      this.setStatus(`${boss.name}意图：${this.bossIntent.headline}`);
    } else {
      this.bossIntent = null;
    }
  }

  private startNewGame(seed: number): void {
    if (this.busy) return;
    this.gameMode = 'pvp';
    this.bossIntent = null;
    this.bossHighlightSwap = null;
    this.showRelicsModal = false;
    this.loadState(newGame(seed));
    this.refreshPlayerTurnGuides();
  }

  private loadState(next: GameState): void {
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
    this.activeEventPhase = 'none';
    this.activeWaveIndex = -1;
    this.shockwaves = [];
    this.comboTracker = null;
    this.legalCount = findLegalSwaps(this.state).length;
    this.ambientAnims = [];
    this.ambientSpawnTimer = 1.4;
    this.syncVisuals(this.state.board);
    this.setStatus(
      this.state.fixture !== undefined
        ? `实验：${FIXTURE_NAMES[this.state.fixture]} · 按金色箭头交换`
        : '点击或拖动相邻猫猫交换位置'
    );
  }

  private restartSame(): void {
    if (this.busy) return;
    this.loadState(this.initialState);
  }

  private undoTurn(): void {
    if (this.busy) return;
    this.state = cloneState(this.turnStart);
    this.selected = -1;
    this.grabbedCell = -1;
    this.grabbedCatId = -1;
    this.previewTarget = -1;
    this.preview = { valid: false };
    this.currentEvent = null;
    this.activeEventPhase = 'none';
    this.activeWaveIndex = -1;
    this.shockwaves = [];
    this.comboTracker = null;
    this.legalCount = findLegalSwaps(this.state).length;
    this.ambientAnims = [];
    this.ambientSpawnTimer = 1.4;
    this.syncVisuals(this.state.board);
    this.setStatus(`已恢复第 ${this.state.turn} 回合开始状态`);
    this.showDebugPanel = false;
  }

  private syncVisuals(board: Board): void {
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
        alpha: 1,
      });
    }
  }

  private bindInputs(): void {
    this.platform.onPointerDown((sx, sy) => {
      this.sound.unlock();
      const { x, y } = this.toVirtual(sx, sy);

      for (let i = this.buttons.length - 1; i >= 0; i--) {
        const b = this.buttons[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (!b.disabled) {
            this.platform.vibrate('light');
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
        const cat = this.state.board[cell]!;
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
        this.platform.vibrate('light');
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
          // 保持猫咪从当前拎起的悬空位置直接丝滑落入目标格交换
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

      if (
        (this.previewTarget === upCell && this.preview.valid) ||
        (this.hoverPreviewed && this.previewTarget === upCell)
      ) {
        void this.submitSwap(this.selected, upCell);
        return;
      }

      if (!validSwap(this.state, this.selected, upCell)) {
        this.setStatus('这次交换没有形成同色直线三连，换一只试试~');
        this.clearPreview();
        return;
      }

      this.setPreview(this.selected, upCell);
      this.hoverPreviewed = false;
      const dmg = this.preview.event?.damage ?? 0;
      this.setStatus(`首轮预计 ${dmg} 伤害 · 再点一次确认交换`);
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

  private releaseGrab(snapBack: boolean): void {
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
        void this.runTween(0.16, 'backOut', (t) => {
          vis.x = sx + (tp.x - sx) * t;
          vis.y = sy + (tp.y - sy) * t;
        });
      } else {
        vis.x = tp.x;
        vis.y = tp.y;
      }
    }
  }

  private setPreview(a: number, b: number): void {
    this.previewTarget = b;
    this.preview = previewSwap(this.state, a, b, this.getCurrentModifiers(this.state.player));
  }

  private clearPreview(): void {
    this.previewTarget = -1;
    this.preview = { valid: false };
  }

  private runTween(
    durationSec: number,
    ease: 'linear' | 'cubicInOut' | 'backOut',
    onUpdate: (t: number) => void
  ): Promise<void> {
    const dur = Math.max(0.01, durationSec / this.speed);
    return new Promise((resolve) => {
      this.tweens.push({
        elapsed: 0,
        duration: dur,
        ease,
        onUpdate,
        resolve,
      });
    });
  }

  private waitSec(sec: number): Promise<void> {
    return this.runTween(sec, 'linear', () => {});
  }

  private waitForNextStep(): Promise<void> {
    return new Promise((resolve) => {
      this.stepWaitResolver = resolve;
    });
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

  private spawnWaveBurstEffects(
    event: RoundEvent,
    sources: number[],
    cells: number[],
    waveIndex: number
  ): void {
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
        maxLife: ringLife,
      });
    }
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
        maxLife,
      });
    }
    this.platform.vibrate('heavy');
    if (this.shakeEnabled) {
      void this.playShake(1 + Math.min(waveIndex, 3) * 0.35);
    }
  }

  private async playShake(intensity = 1): Promise<void> {
    this.shakeOffsetX = 5 * intensity;
    this.shakeOffsetY = -4 * intensity;
    await this.waitSec(0.045);
    this.shakeOffsetX = -4 * intensity;
    this.shakeOffsetY = 3 * intensity;
    await this.waitSec(0.045);
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  private spawnFloatingText(text: string, y: number, color = '#e54d42', x = 580): void {
    const maxLife = 0.85 / this.speed;
    this.floatings.push({
      text,
      x,
      y,
      color,
      life: maxLife,
      maxLife,
    });
  }

  private spawnFloatingDamage(event: RoundEvent, attacker: 0 | 1): void {
    const y = attacker === 0 ? 118 : 1074;
    const text =
      event.shieldBlocked > 0
        ? `−${event.damage} (盾挡${event.shieldBlocked})`
        : event.trueDamage > 0
          ? `−${event.damage} (真伤${event.trueDamage})`
          : `−${event.damage}`;
    this.spawnFloatingText(text, y, event.trueDamage > 0 ? '#9333ea' : '#e54d42');
  }

  private pushComboLog(delta: number, label: string, color: string, deltaText?: string): void {
    if (!this.comboTracker) return;
    this.comboTracker.totalDamage = Math.max(0, this.comboTracker.totalDamage + delta);
    this.comboTracker.pulse = 1;
    this.comboTracker.logs.push({
      label,
      deltaText: deltaText ?? (delta >= 0 ? `+${delta}` : `${delta}`),
      color,
    });
    if (this.comboTracker.logs.length > 6) {
      this.comboTracker.logs.shift();
    }
  }

  private async submitSwap(a: number, b: number, isBossAction = false): Promise<void> {
    if (this.busy && !isBossAction) return;
    if (!validSwap(this.state, a, b)) {
      this.sound.playInvalid();
      this.setStatus('这次交换没有形成同色直线三连，换一只试试~');
      this.selected = -1;
      this.clearPreview();
      return;
    }

    this.busy = true;
    const useSteps = this.stepEnabled && this.gameMode === 'pvp';
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

    const actorLabel =
      this.gameMode === 'roguelike'
        ? attacker === 0
          ? '你'
          : getBossProfile(this.run.stageIndex).name
        : `玩家 ${attacker + 1}`;
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
    };

    this.sound.playSwap();
    await this.animateBoardPositions(result.swapped, 0.22);

    let turnTotalDamage = 0;

    for (let idx = 0; idx < result.events.length; idx++) {
      const event = result.events[idx];
      turnTotalDamage += event.damage;
      this.currentEvent = event;
      this.activeEventPhase = 'match';
      this.activeWaveIndex = -1;
      this.comboTracker.rounds = event.number;
      this.setStatus(`${actorLabel} · 第 ${event.number} 轮 · 基础 ${event.baseDamage} + 附加 ${event.bonus} = ${event.damage} 伤`);
      if (idx > 0) {
        this.sound.playCombo(event.number);
        this.showBanner(`第 ${event.number} 轮连锁！`, 0.78, 'sparkle');
      }
      await this.waitSec(idx > 0 ? 0.36 : 0.28);

      const mergeItems: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number }> = [];
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
        this.activeEventPhase = 'merge';
        const hasRainbowCenter = event.centers.some((c) => c.resultLevel === 3);
        this.sound.playMerge(hasRainbowCenter ? 3 : 2);
        await this.runTween(0.26, 'cubicInOut', (t) => {
          for (const m of mergeItems) {
            m.vis.x = m.sx + (m.tx - m.sx) * t;
            m.vis.y = m.sy + (m.ty - m.sy) * t;
            m.vis.scale = 1 - 0.8 * t;
          }
        });
      }

      let waveShownDamage = 0;
      if (event.waves.length > 0) {
        this.activeEventPhase = 'wave';
        for (let w = 0; w < event.waves.length; w++) {
          const wave = event.waves[w];
          this.activeWaveIndex = w;
          const pulseTargets = wave.sources
            .map((c) => event.before[c])
            .filter((c): c is CatData => Boolean(c))
            .map((c) => this.visuals.get(c.id))
            .filter((v): v is CatVisual => Boolean(v));

          if (wave.wave > 0) {
            this.setStatus(`${actorLabel} · 第 ${event.number} 轮 · 第 ${wave.wave} 波连锁二次引爆！`);
            this.showBanner(`${wave.wave + 1} 连爆！`, 0.65, 'blast');
          }

          // 先点亮本波射线/范围并让起爆源大猫蓄力膨胀，眼睛锁定起爆点后再炸开
          const chargeDur = wave.wave === 0 ? 0.18 : 0.28;
          const chargeScale = wave.wave === 0 ? 0.24 : 0.38;
          if (pulseTargets.length > 0) {
            await this.runTween(chargeDur, 'backOut', (t) => {
              for (const v of pulseTargets) v.scale = 1 + chargeScale * t;
            });
          } else {
            await this.waitSec(chargeDur);
          }

          this.sound.playBlast(wave.wave);
          this.spawnWaveBurstEffects(event, wave.sources, wave.cells, wave.wave);
          this.comboTracker.blastWaves += 1;
          waveShownDamage += wave.damage;
          const waveCol = WAVE_COLORS[Math.min(wave.wave, WAVE_COLORS.length - 1)];
          const waveKindLabel =
            wave.kind === 'rainbow'
              ? '炫彩全爆'
              : wave.wave === 0
                ? 'W0 宽光束起爆'
                : `↳ W${wave.wave} 二次引爆`;
          this.pushComboLog(wave.damage, `R${event.number} ${waveKindLabel}`, waveCol);

          for (const cell of wave.cells) {
            const orig = event.before[cell];
            if (orig) this.visuals.delete(orig.id);
          }
          await this.waitSec(wave.wave === 0 ? 0.36 : 0.42);
        }
        this.activeWaveIndex = -1;
      } else {
        this.platform.vibrate('light');
      }

      // 将本轮最终结算伤害（含纯合成/连锁加成/真伤/减伤修正）精确对齐至战报卡
      this.comboTracker.trueDamage += event.trueDamage;
      this.comboTracker.shieldBlocked += event.shieldBlocked;
      if (event.waves.length === 0) {
        const hasRainbow = event.centers.some((c) => c.resultLevel === 3);
        const mergeTag = hasRainbow ? '合成炫彩猫' : '合成大猫';
        const comboTag = event.bonus > 0 ? ` · 连锁+${event.bonus}` : '';
        this.pushComboLog(event.damage, `R${event.number} ${mergeTag}${comboTag}`, '#d97706');
      } else {
        const delta = event.damage - waveShownDamage;
        if (delta > 0) {
          const extraTag =
            event.trueDamage > 0
              ? `真伤+${event.trueDamage} / 加成`
              : event.bonus > 0
                ? `连锁/祝福加成`
                : '祝福增伤';
          this.pushComboLog(
            delta,
            `R${event.number} ${extraTag}`,
            event.trueDamage > 0 ? '#9333ea' : '#e54d42'
          );
        } else if (delta < 0) {
          this.pushComboLog(delta, `R${event.number} 减伤生效`, '#2563eb', `${delta}`);
        }
      }

      this.activeEventPhase = 'collapse';
      this.syncVisuals(event.afterClear);
      this.state.hp = [event.hp[0], event.hp[1]];
      if (this.state.shield) {
        this.state.shield = [event.shield[0], event.shield[1]];
      }
      this.spawnFloatingDamage(event, attacker);

      const newBigs: CatVisual[] = [];
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
        await this.runTween(0.28, 'backOut', (t) => {
          for (const v of newBigs) v.scale = 0.4 + 0.6 * t;
        });
      }

      for (const move of event.moves) {
        const vis = this.visuals.get(move.id);
        if (!vis) continue;
        const sx = vis.x;
        const sy = vis.y;
        const tp = this.cellPoint(move.to);
        await this.runTween(0.055, 'cubicInOut', (t) => {
          vis.x = sx + (tp.x - sx) * t;
          vis.y = sy + (tp.y - sy) * t;
        });
      }

      this.syncVisuals(event.afterCollapse);

      if (event.spawn.length > 0) {
        const spawns: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number }> = [];
        for (const sp of event.spawn) {
          const tp = this.cellPoint(sp.cell);
          let sx = tp.x;
          let sy = tp.y;
          if (sp.edge) {
            const dx = tp.x - 360;
            const dy = tp.y - 620;
            const len = Math.hypot(dx, dy) || 1;
            sx = tp.x + (dx / len) * 76;
            sy = tp.y + (dy / len) * 76;
          }
          const vis: CatVisual = {
            id: sp.cat.id,
            color: sp.cat.color,
            level: sp.cat.level,
            x: sx,
            y: sy,
            scale: 0.05,
            alpha: 1,
          };
          this.visuals.set(vis.id, vis);
          spawns.push({ vis, sx, sy, tx: tp.x, ty: tp.y });
        }
        await this.runTween(0.26, 'backOut', (t) => {
          const posT = Math.min(1, t);
          for (const s of spawns) {
            s.vis.x = s.sx + (s.tx - s.sx) * posT;
            s.vis.y = s.sy + (s.ty - s.sy) * posT;
            s.vis.scale = Math.max(0.05, 0.05 + 0.95 * t);
          }
        });
      }

      this.currentEvent = null;
      this.activeEventPhase = 'none';
      this.activeWaveIndex = -1;

      if (idx < result.events.length - 1) {
        if (useSteps) {
          this.statusText += ' · 点击“下一轮”继续';
          await this.waitForNextStep();
        } else {
          await this.waitSec(0.24);
        }
      }
    }

    this.state = result.state;
    this.ambientAnims = [];
    this.ambientSpawnTimer = 1.4;
    this.syncVisuals(this.state.board);
    this.legalCount = findLegalSwaps(this.state).length;
    this.computeTurnSummary(result.events);
    if (this.comboTracker) {
      this.comboTracker.active = false;
      this.comboTracker.holdLife = 1.5;
      this.comboTracker.maxHold = 1.5;
    }

    if (this.gameMode === 'roguelike') {
      await this.handleRoguelikePostSwap(attacker, result.events, turnTotalDamage, result.notice);
      return;
    }

    if (this.state.winner >= 0) {
      this.setStatus(`玩家 ${this.state.winner + 1} 获胜！可点“同局重开”再战一局`);
    } else if (result.notice) {
      this.setStatus(result.notice);
    } else {
      this.setStatus(`轮到玩家 ${this.state.player + 1} · 留意对手留下的大猫`);
    }
    this.refreshPlayerTurnGuides();
    this.busy = false;
  }

  private async handleRoguelikePostSwap(
    attacker: 0 | 1,
    events: RoundEvent[],
    turnTotalDamage: number,
    notice: string
  ): Promise<void> {
    const boss = getBossProfile(this.run.stageIndex);

    if (attacker === 0) {
      // 玩家回合结束：结算合成流 / 收缩流祝福
      this.run.totalTurns += 1;
      this.run.bestTurnDamage = Math.max(this.run.bestTurnDamage, turnTotalDamage);
      const post = applyPlayerPostTurnRelics(this.state, this.run, events);
      if (post.shieldGained > 0) {
        this.spawnFloatingText(`+${post.shieldGained} 盾`, 1044, '#2563eb', 470);
      }
      if (post.healed > 0) {
        this.spawnFloatingText(`+${post.healed} HP`, 1044, '#16a34a', 330);
      }
      this.run.calmDefuseActive = post.calmDefuseArmed;
      this.run.playerHp = this.state.hp[0];
      this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
      this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;

      if (this.state.winner === 0) {
        this.run.defeatedBosses.push(boss.id);
        this.bossIntent = null;
        this.sound.playVictory();
        if (this.run.stageIndex < BOSSES.length - 1) {
          this.run.playerHp = Math.min(this.run.playerMaxHp, this.run.playerHp + STAGE_CLEAR_HEAL);
          this.state.hp[0] = this.run.playerHp;
          this.run.rewardChoices = rollRelicChoices(
            this.run.relics,
            this.run.seed + (this.run.stageIndex + 1) * 7919 + this.run.totalTurns * 13
          );
          this.run.phase = 'reward';
          this.setStatus(`击败 ${boss.name}！回复 +${STAGE_CLEAR_HEAL} HP，选 1 个猫猫祝福`, 'trophy');
          this.showBanner(`击败 ${boss.name}！`, 1.5, 'trophy');
        } else {
          this.run.phase = 'victory';
          this.setStatus('全部猫梗 Boss 已击败，猫屋大捷！', 'trophy');
          this.showBanner('通关大捷！', 1.8, 'trophy');
        }
        this.busy = false;
        return;
      }

      if (notice) {
        this.setStatus(notice);
      } else if (post.notes.length > 0) {
        this.setStatus(`祝福生效：${post.notes.join(' · ')}`);
      }
      await this.waitSec(0.45);
      await this.runBossTurn();
    } else {
      // Boss 回合结束：结算大橘干饭回血 & 重置玩家单回合减伤
      const bossPost = applyBossPostTurnPassive(this.state, boss, events);
      if (bossPost.bossHealed > 0) {
        this.spawnFloatingText(`+${bossPost.bossHealed} HP`, 118, '#16a34a', 340);
        this.showBanner(`大橘干饭回血 +${bossPost.bossHealed} HP！`, 1.2, 'rice');
      }
      this.run.calmDefuseActive = false;
      this.run.bossTurnsTaken += 1;
      this.run.playerHp = this.state.hp[0];
      this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
      this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;

      if (this.state.winner === 1 || this.run.playerHp <= 0) {
        this.run.phase = 'defeat';
        this.bossIntent = null;
        this.sound.playDefeat();
        this.setStatus(`被 ${boss.name} 挠趴啦！点击重新挑战`);
        this.busy = false;
        return;
      }

      if (notice) {
        this.setStatus(notice);
        await this.waitSec(0.4);
      }
      this.refreshPlayerTurnGuides();
      this.busy = false;
    }
  }

  private async runBossTurn(): Promise<void> {
    const boss = getBossProfile(this.run.stageIndex);
    this.setStatus(`轮到 ${boss.name} 行动...`);

    // 1. 触发 Boss 主动技能（奶牛跑酷 / 哈基米哈气）
    const skill = applyBossPreTurnSkill(this.state, boss, this.run.bossTurnsTaken);
    if (skill.triggered) {
      this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.syncVisuals(this.state.board);
      const skillIcon = boss.id === 'cow' ? 'bolt' : 'crown';
      this.showBanner(skill.banner, 1.5, skillIcon);
      this.setStatus(skill.banner, skillIcon);
      if (skill.shieldGained > 0) {
        this.spawnFloatingText(`+${skill.shieldGained} 盾`, 118, '#2563eb', 470);
      }
      if (skill.upgradedCell >= 0) {
        const upCat = this.state.board[skill.upgradedCell];
        const vis = upCat ? this.visuals.get(upCat.id) : undefined;
        if (vis) {
          vis.scale = 0.35;
          await this.runTween(0.32, 'backOut', (t) => {
            vis.scale = 0.35 + 0.65 * t;
          });
        }
      }
      if (this.shakeEnabled) void this.playShake(0.9);
      await this.waitSec(0.55);
    }

    // 2. 验证玩家是否成功拆掉了 Boss 原定意图
    let chosenSwap = this.bossIntent?.swap ?? null;
    if (!chosenSwap || !validSwap(this.state, chosenSwap[0], chosenSwap[1])) {
      if (chosenSwap) {
        this.sound.playChime();
        this.showBanner('意图被你拆穿！Boss 临时换招！', 1.3, 'target');
        this.setStatus(`你拆穿了 ${boss.name} 的计划，它正在重新找步...`, 'target');
        await this.waitSec(0.42);
      }
      const mult = this.run.calmDefuseActive ? 0.7 : 1;
      const fresh = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult);
      chosenSwap = fresh.swap;
    }

    if (!chosenSwap) {
      // 极少见兜底：若仍无合法交换，换回玩家
      this.state.player = 0;
      this.refreshPlayerTurnGuides();
      this.busy = false;
      return;
    }

    // 3. 闪烁高亮 Boss 选中的两格，让玩家看清它动了哪两只猫
    this.bossHighlightSwap = chosenSwap;
    this.setStatus(`${boss.name} 出手交换！`);
    await this.waitSec(0.58);
    await this.submitSwap(chosenSwap[0], chosenSwap[1], true);
  }

  private computeTurnSummary(events: RoundEvent[]): void {
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
      opponentBest,
    };
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.updateAmbientAnims(dt);

    if (this.grabbedCell >= 0) {
      this.grabElapsed += dt;
      const follow = Math.min(1, dt * 22);
      const vx = this.grabPointerX - this.grabSmoothX;
      const vy = this.grabPointerY - this.grabSmoothY;
      this.grabSmoothX += vx * follow;
      this.grabSmoothY += vy * follow;
      // 被拎在半空时随移动惯性 + 挣扎节奏轻微钟摆摇晃
      const struggleSway = Math.sin(this.grabElapsed * 15) * 0.055;
      const dragSway = Math.max(-0.22, Math.min(0.22, -vx * 0.0055));
      const targetTilt = struggleSway + dragSway;
      this.grabTilt += (targetTilt - this.grabTilt) * Math.min(1, dt * 16);
    }

    if (this.bannerLife > 0) {
      this.bannerLife = Math.max(0, this.bannerLife - dt);
    }

    if (this.comboTracker) {
      if (this.comboTracker.pulse > 0) {
        this.comboTracker.pulse = Math.max(0, this.comboTracker.pulse - dt * 4.5);
      }
      if (!this.comboTracker.active) {
        this.comboTracker.holdLife -= dt;
        if (this.comboTracker.holdLife <= 0) {
          this.comboTracker = null;
        }
      }
    }

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
  }

  /** 全局稀疏点缀：每隔约 1.6~2.8 秒挑 1 只静卧猫轻眨眼或轻甩尾，同屏最多 2 只 */
  private updateAmbientAnims(dt: number): void {
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
    const candidates: number[] = [];
    for (const vis of this.visuals.values()) {
      if (vis.id === this.grabbedCatId || busyIds.has(vis.id)) continue;
      candidates.push(vis.id);
    }
    if (candidates.length === 0) return;

    const preferred =
      candidates.length > 1
        ? candidates.filter((id) => id !== this.lastAmbientCatId)
        : candidates;
    const catId = preferred[Math.floor(Math.random() * preferred.length)];
    const isBlink = Math.random() < 0.58;
    this.lastAmbientCatId = catId;
    this.ambientAnims.push({
      catId,
      frame: isBlink ? 2 : 1,
      elapsed: 0,
      duration: isBlink ? 0.28 : 0.85,
    });
  }

  /** 绘制手绘六边形缝线猫窝 */
  private drawCatNest(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rimColor: string,
    isSelected: boolean,
    isPreviewTarget: boolean
  ): void {
    ctx.save();

    // 轻扁平暖棕落影
    traceRoundedHexagon(ctx, cx, cy + 3.5, HEX_RADIUS, 11);
    ctx.fillStyle = 'rgba(78, 52, 46, 0.16)';
    ctx.fill();

    // 选中态外圈白色贴纸发光边
    if (isSelected || isPreviewTarget) {
      traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS + 3.5, 13);
      ctx.fillStyle = isSelected ? '#fff5c0' : '#d2ffeb';
      ctx.fill();
    }

    // 外层粉彩猫窝布艺边
    traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS, 11);
    ctx.fillStyle = isSelected ? '#ffe58f' : rimColor;
    ctx.fill();
    ctx.strokeStyle = isPreviewTarget ? '#2e9e74' : INK;
    ctx.lineWidth = isSelected || isPreviewTarget ? 4.2 : 3.0;
    ctx.stroke();

    // 内层浅米白软垫
    traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * 0.8, 9);
    ctx.fillStyle = '#fff8ee';
    ctx.fill();

    // 手绘虚线缝线
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.36)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /** 绘制手绘星星爆发射线（支持按波次着色） */
  private drawStarBlastArrow(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    strokeColor = '#ff7e70'
  ): void {
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

    const drawStroke = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
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
    drawStroke('#ffffff', 14);
    drawStroke(strokeColor, 7.5);

    // 沿射线点缀手绘黄色小星星
    const starCount = len > 180 ? 3 : 2;
    for (let i = 1; i <= starCount; i++) {
      const t = i / (starCount + 1);
      const sx = ax + dx * t;
      const sy = ay + dy * t;
      drawCuteStar(ctx, sx, sy, i === Math.ceil(starCount / 2) ? 15 : 11, '#ffe066');
    }
    ctx.restore();
  }

  private drawSimpleArrow(
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
    const head = 14;
    const cos = Math.cos(0.5);
    const sin = Math.sin(0.5);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
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

  private drawUiIcon(
    ctx: CanvasRenderingContext2D, key: UiIconKey, cx: number, cy: number, size: number
  ): boolean {
    const image = this.assets.icons[key];
    if (!image?.ready) return false;
    ctx.drawImage(image.el, cx - size / 2, cy - size / 2, size, size);
    return true;
  }

  private drawCenteredIconText(
    ctx: CanvasRenderingContext2D,
    icon: UiIconKey | null,
    text: string,
    centerX: number,
    centerY: number,
    iconSize: number,
    gap: number
  ): void {
    let textX = centerX;
    if (icon) {
      const iconX = centerX - (ctx.measureText(text).width + gap) / 2;
      if (this.drawUiIcon(ctx, icon, iconX, centerY, iconSize)) {
        textX += (iconSize + gap) / 2;
      }
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, centerY);
    ctx.restore();
  }

  /** 手绘贴纸风按钮 */
  private drawStickerButton(ctx: CanvasRenderingContext2D, btn: ButtonRect): void {
    this.buttons.push(btn);
    ctx.save();
    const radius = btn.round ? btn.h / 2 : 16;

    // 扁平暖棕底边厚影
    if (!btn.disabled) {
      ctx.fillStyle = 'rgba(78, 52, 46, 0.22)';
      drawRoundedRect(ctx, btn.x, btn.y + 4, btn.w, btn.h, radius);
      ctx.fill();
    }

    // 按钮主体
    ctx.fillStyle = btn.disabled ? '#eadfce' : btn.accent ? '#ffe49e' : '#fffaf0';
    ctx.strokeStyle = btn.disabled ? '#b69f90' : INK;
    ctx.lineWidth = 3.2;
    drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = btn.disabled ? '#a1887f' : INK;
    ctx.font = `800 ${btn.round ? 26 : 18}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    if (!btn.icon || !this.drawUiIcon(ctx, btn.icon, cx, cy, Math.min(btn.w, btn.h) * 0.72)) {
      ctx.fillText(btn.label, cx, cy + 1);
    }
    ctx.restore();
  }

  /** 手绘贴纸风玩家 / Boss 血条（支持护盾与肉鸽专属 Boss 贴纸头像） */
  private drawPlayerBar(ctx: CanvasRenderingContext2D, player: 0 | 1, y: number): void {
    const isRogue = this.gameMode === 'roguelike';
    const boss = isRogue ? getBossProfile(this.run.stageIndex) : null;
    const isTurn = this.state.winner < 0 && this.state.player === player;
    const isWinner = this.state.winner === player;
    const maxHp = this.state.maxHp ? this.state.maxHp[player] : HP;
    const shield = this.state.shield ? this.state.shield[player] : 0;

    const barX = 96;
    const barW = player === 1 ? 460 : 596;
    const barH = 48;
    const radius = barH / 2;

    ctx.save();

    // 白色贴纸外轮廓
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, barX - 6, y - 6, barW + 12, barH + 12, radius + 6);
    ctx.fill();

    // 血条底槽
    ctx.fillStyle = '#f5ebe0';
    drawRoundedRect(ctx, barX, y, barW, barH, radius);
    ctx.fill();

    // 血量填充
    const ratio = Math.max(0, Math.min(1, this.state.hp[player] / Math.max(1, maxHp)));
    if (ratio > 0) {
      ctx.save();
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.clip();
      ctx.fillStyle =
        player === 0 ? '#bae8cb' : isRogue && boss ? boss.barFillColor : '#d2c2fa';
      ctx.fillRect(barX, y, barW * ratio, barH);
      ctx.restore();
    }

    // 深棕粗描边
    ctx.strokeStyle = isTurn || isWinner ? '#d97706' : INK;
    ctx.lineWidth = isTurn || isWinner ? 4.2 : 3.4;
    drawRoundedRect(ctx, barX, y, barW, barH, radius);
    ctx.stroke();

    // 血条文字（有护盾胶囊时略向左让位，避免文字与护盾重叠）
    ctx.fillStyle = INK;
    ctx.font = `900 ${player === 1 ? 20 : 22}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const centerX = shield > 0 ? barX + (barW - 84) * 0.5 : barX + barW * 0.5;
    let label = '';
    if (isRogue && boss) {
      if (player === 1) {
        label = `${boss.name}  ${this.state.hp[1]}/${maxHp}`;
      } else {
        const calmTag = this.run.calmDefuseActive ? ' · 减伤30%' : '';
        label = `你  ${this.state.hp[0]}/${maxHp}${calmTag}`;
      }
    } else {
      const suffix = isWinner ? '  · 获胜' : isTurn ? '  · 当前回合' : '';
      label = `P${player + 1}  ${this.state.hp[player]}${suffix}`;
    }
    ctx.fillText(label, centerX, y + barH / 2 + 1);

    // 护盾蓝色胶囊徽章
    if (shield > 0) {
      const sw = 74;
      const sh = 30;
      const sx = barX + barW - sw - 8;
      const sy = y + (barH - sh) / 2;
      ctx.fillStyle = '#dbeafe';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.6;
      drawRoundedRect(ctx, sx, sy, sw, sh, 15);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d4ed8';
      ctx.font = `900 16px ${FONT_FAMILY}`;
      this.drawCenteredIconText(ctx, 'shield', `${shield}`, sx + sw / 2, sy + sh / 2 + 1, 22, 4);
    }

    // 左侧趴栏杆萌猫 / Boss 贴纸
    const avatar =
      player === 0
        ? this.assets.avatarP1
        : isRogue && boss
          ? this.assets.bosses[boss.id]
          : this.assets.avatarP2;
    if (avatar.ready) {
      const avSize = 98;
      ctx.drawImage(avatar.el, 22, y - 28, avSize, avSize);
    }

    ctx.restore();
  }

  /** 背景铺满整个真实画布（零黑边） */
  private drawFullBackground(ctx: CanvasRenderingContext2D): void {
    const pw = this.platform.width;
    const ph = this.platform.height;
    ctx.fillStyle = '#f3cc9b';
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

  private render(): void {
    const ctx = this.platform.ctx;
    this.buttons = [];

    ctx.save();
    // 1. 全屏阳光猫屋背景
    this.drawFullBackground(ctx);

    // 2. 映射到 720×1220 虚拟画布
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 顶部关卡与 Boss 技能信息条（肉鸽模式）
    if (this.gameMode === 'roguelike') {
      const boss = getBossProfile(this.run.stageIndex);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      drawRoundedRect(ctx, 118, 42, 496, 36, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = boss.accentColor;
      ctx.font = `900 16px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`第 ${boss.stage}/3 关`, 134, 61);

      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 15px ${FONT_FAMILY}`;
      const skillBadge =
        boss.id === 'orange'
          ? boss.traitShort
          : this.bossIntent
            ? this.bossIntent.skillText
            : boss.traitShort;
      const skillIcon = this.bossIntent?.skillReady && boss.id !== 'orange'
        ? boss.id === 'cow' ? 'bolt' : 'crown'
        : null;
      if (skillIcon && this.drawUiIcon(ctx, skillIcon, 223, 60, 22)) {
        ctx.fillText(skillBadge, 238, 61);
      } else {
        ctx.fillText(`·  ${skillBadge}`, 212, 61);
      }

      // 右侧 3 关闯关进度圆点
      for (let s = 0; s < BOSSES.length; s++) {
        const dx = 550 + s * 20;
        const dy = 60;
        ctx.beginPath();
        ctx.arc(dx, dy, s === this.run.stageIndex ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fillStyle =
          s < this.run.stageIndex
            ? '#38b583'
            : s === this.run.stageIndex
              ? boss.accentColor
              : '#dccbb8';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 顶部 Boss / P2 血条 + 右侧圆形音效与 "?" 玩法按钮
    this.drawPlayerBar(ctx, 1, 92);
    this.drawStickerButton(ctx, {
      id: 'sound',
      x: 568,
      y: 89,
      w: 54,
      h: 54,
      icon: this.sound.isMuted() ? 'sound_off' : 'sound_on',
      label: this.sound.isMuted() ? '静' : '音',
      round: true,
      accent: !this.sound.isMuted(),
      onClick: () => {
        const nowMuted = this.sound.toggleMute();
        if (!nowMuted) {
          this.sound.unlock();
          this.sound.playChime();
        }
      },
    });
    this.drawStickerButton(ctx, {
      id: 'rules',
      x: 634,
      y: 89,
      w: 54,
      h: 54,
      label: '?',
      round: true,
      onClick: () => {
        this.showRulesModal = true;
        this.showDebugPanel = false;
        this.showRelicsModal = false;
      },
    });

    // 状态 / Boss 意图预告胶囊条
    ctx.save();
    const isDangerIntent =
      this.gameMode === 'roguelike' &&
      !this.busy &&
      this.bossIntent !== null &&
      this.bossIntent.hasBlast;
    ctx.fillStyle = isDangerIntent ? 'rgba(255, 236, 236, 0.94)' : 'rgba(255, 250, 240, 0.9)';
    ctx.strokeStyle = isDangerIntent ? '#e54d42' : 'rgba(78, 52, 46, 0.35)';
    ctx.lineWidth = isDangerIntent ? 2.6 : 2;
    const pillW = this.stepWaitResolver ? 500 : 672;
    drawRoundedRect(ctx, 24, 160, pillW, 42, 21);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDangerIntent ? '#b91c1c' : INK;
    ctx.font = `700 17px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const hasStatusIcon = this.statusIcon && this.drawUiIcon(ctx, this.statusIcon, 54, 181, 26);
    ctx.fillText(this.statusText, hasStatusIcon ? 72 : 42, 182);
    ctx.restore();

    if (this.stepWaitResolver) {
      this.drawStickerButton(ctx, {
        id: 'next-step',
        x: 538,
        y: 158,
        w: 158,
        h: 46,
        label: '下一轮',
        accent: true,
        onClick: () => {
          const resolve = this.stepWaitResolver;
          this.stepWaitResolver = null;
          resolve?.();
        },
      });
    }

    // 3. 六边形缝线猫窝 + 猫猫层（带震屏）
    ctx.save();
    ctx.translate(this.shakeOffsetX, this.shakeOffsetY);

    // 仅在持有肉鸽道具「猫须雷达」时，激活可合成/引爆猫咪的挥爪招手提示
    const activeHintCells = new Set<number>();
    const activeHighCells = new Set<number>();
    const hintPartner = new Map<number, number>();
    const hintsUnlocked = this.gameMode === 'roguelike' && hasHintRelic(this.run.relics);
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

    const bossLockedCells = new Set<number>();
    const activeBossSwap =
      this.bossHighlightSwap ??
      (this.gameMode === 'roguelike' &&
      !this.busy &&
      this.selected < 0 &&
      this.run.phase === 'battle'
        ? this.bossIntent?.swap ?? null
        : null);
    if (activeBossSwap) {
      bossLockedCells.add(activeBossSwap[0]);
      bossLockedCells.add(activeBossSwap[1]);
    }

    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const p = this.cellPoint(cell);
      const cat = this.state.board[cell];
      const rimColor = !cat
        ? NEST_EMPTY_RIM
        : cat.level >= 2
          ? NEST_BIG_RIM
          : NEST_RIM_COLORS[cat.color % NEST_RIM_COLORS.length];
      this.drawCatNest(
        ctx,
        p.x,
        p.y,
        rimColor,
        cell === this.selected,
        cell === this.previewTarget && this.preview.valid
      );

      // 高价值可引爆猫的柔和金色呼吸底圈
      if (activeHighCells.has(cell)) {
        const glowAlpha = 0.25 + 0.22 * Math.sin(this.elapsed * 5.2);
        ctx.save();
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS - 3, 10);
        ctx.fillStyle = `rgba(255, 224, 102, ${glowAlpha.toFixed(2)})`;
        ctx.fill();
        ctx.restore();
      }

      // Boss 意图锁定的红虚线警示框
      if (bossLockedCells.has(cell)) {
        const pulseW = this.bossHighlightSwap ? 5.5 : 3.6 + Math.sin(this.elapsed * 6) * 0.8;
        ctx.save();
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
        ctx.strokeStyle = this.bossHighlightSwap ? '#dc2626' : '#ef4444';
        ctx.lineWidth = pulseW;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 若有猫咪被按住拎起，先在原猫窝画出柔和椭圆落影
    if (this.grabbedCell >= 0) {
      const op = this.cellPoint(this.grabbedCell);
      const liftDist = Math.hypot(this.grabSmoothX - op.x, this.grabSmoothY - op.y);
      const shadowScale = Math.max(0.55, 1 - liftDist / 260);
      ctx.save();
      ctx.fillStyle = 'rgba(78, 52, 46, 0.22)';
      ctx.beginPath();
      ctx.ellipse(op.x, op.y + 18, 28 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 建立 id -> cell 映射以驱动待机 / 挥爪提示帧动画
    const idToCell = new Map<number, number>();
    for (let c = 0; c < this.state.board.length; c++) {
      const cat = this.state.board[c];
      if (cat) idToCell.set(cat.id, c);
    }

    const ambientFrameMap = new Map<number, number>();
    for (const a of this.ambientAnims) {
      ambientFrameMap.set(a.catId, a.frame);
    }

    // 全身猫咪精灵（普通猫先画，被拎起的猫留到最顶层）
    for (const vis of this.visuals.values()) {
      if (vis.id === this.grabbedCatId) continue;
      const cell = idToCell.get(vis.id);
      let animState: CatAnimState = 'static';
      let flipX = false;
      let nudgeX = 0;
      let nudgeY = 0;
      let forceFrame: number | undefined;
      if (cell !== undefined && activeHintCells.has(cell)) {
        animState = 'hint';
        const partner = hintPartner.get(cell);
        if (partner !== undefined) {
          const pSelf = this.cellPoint(cell);
          const pOther = this.cellPoint(partner);
          const dx = pOther.x - pSelf.x;
          const dy = pOther.y - pSelf.y;
          // 让互相提示的两只猫朝向彼此挥爪探身
          if (dx < -4) flipX = true;
          const dist = Math.hypot(dx, dy) || 1;
          const lean = Math.max(0, Math.sin(this.elapsed * 5.2)) * 4.5;
          nudgeX = (dx / dist) * lean;
          nudgeY = (dy / dist) * lean;
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
          forceFrame,
        },
        this.assets
      );
    }

    // 飞散猫特效粒子
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

    // 扩散冲击波环（标记每一波的起爆中心）
    for (const ring of this.shockwaves) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#ffffff';
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

    // 4. 预览 / 当前轮逐阶段视觉指示层
    const previewEvent = this.preview.valid && this.preview.event ? this.preview.event : null;
    const overlayEvent = previewEvent ?? this.currentEvent;
    if (previewEvent) {
      const cellWaveMap = new Map<number, number>();
      for (const wave of previewEvent.waves) {
        for (const cell of wave.cells) {
          cellWaveMap.set(cell, wave.wave);
        }
      }
      for (const cell of previewEvent.cleared) {
        const p = this.cellPoint(cell);
        const wIdx = cellWaveMap.get(cell);
        ctx.strokeStyle =
          wIdx !== undefined ? WAVE_COLORS[Math.min(wIdx, WAVE_COLORS.length - 1)] : '#ff9852';
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
        ctx.strokeStyle = '#38b583';
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
        this.drawSimpleArrow(ctx, a.x, a.y, b.x, b.y, '#3bb5a5', 3.6);
      }
    } else if (this.currentEvent) {
      const ev = this.currentEvent;
      if (this.activeEventPhase === 'match') {
        // 匹配确认阶段：仅标出本轮形成连线的格子与合成中心
        const matchedCells = new Set<number>();
        for (const line of ev.lines) {
          for (const c of line.cells) matchedCells.add(c);
        }
        ctx.save();
        for (const cell of matchedCells) {
          const p = this.cellPoint(cell);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 49, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const center of ev.centers) {
          const p = this.cellPoint(center.cell);
          ctx.strokeStyle = '#38b583';
          ctx.lineWidth = 4.8;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 54, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      } else if (this.activeEventPhase === 'merge') {
        // 聚拢合成阶段：高亮绿色合成中心
        ctx.save();
        for (const center of ev.centers) {
          const p = this.cellPoint(center.cell);
          ctx.strokeStyle = center.resultLevel === 3 ? '#d946ef' : '#38b583';
          ctx.lineWidth = 5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 54, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      } else if (this.activeEventPhase === 'wave' && this.activeWaveIndex >= 0) {
        // 逐波爆发阶段：只亮起当前这一波的受击格、起爆源与光束射线
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

    // Boss 意图红虚线连接箭头（玩家未预览时显示，助于预判拆招）
    if (activeBossSwap && !overlayEvent) {
      const a = this.cellPoint(activeBossSwap[0]);
      const b = this.cellPoint(activeBossSwap[1]);
      this.drawSimpleArrow(
        ctx,
        a.x,
        a.y,
        b.x,
        b.y,
        this.bossHighlightSwap ? '#dc2626' : '#ef4444',
        this.bossHighlightSwap ? 6 : 4.2
      );
    }

    // 测试局面推荐交换箭头
    if (
      this.state.suggested &&
      this.state.turn === 1 &&
      !this.busy &&
      this.selected < 0 &&
      !overlayEvent
    ) {
      const a = this.cellPoint(this.state.suggested[0]);
      const b = this.cellPoint(this.state.suggested[1]);
      this.drawSimpleArrow(ctx, a.x, a.y, b.x, b.y, '#f59e0b', 6);
    }

    // 最顶层：正在手里拎起扑腾挣扎的猫咪（附带悬空阴影与轻弹性摆动）
    if (this.grabbedCatId >= 0) {
      const vis = this.visuals.get(this.grabbedCatId);
      if (vis) {
        // 悬空猫下方柔和投影
        ctx.save();
        ctx.fillStyle = 'rgba(78, 52, 46, 0.24)';
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
            animState: 'grabbed',
            seedOffset: vis.id,
            grabElapsed: this.grabElapsed,
          },
          this.assets
        );
      }
    }

    ctx.restore(); // 结束棋盘震屏层

    // 扣血 / 回血 / 护盾飘字（带白边与高对比色彩）
    for (const f of this.floatings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.font = `900 38px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    // 底部玩家血条
    this.drawPlayerBar(ctx, 0, 1054);

    // 肉鸽模式下在血条上方展示已收集祝福小贴纸（支持最多 3 张整齐对齐）
    if (this.gameMode === 'roguelike' && this.run.relics.length > 0) {
      const count = this.run.relics.length;
      const badgeW = count >= 3 ? 184 : 186;
      const gap = 12;
      const startX = count >= 3 ? 116 : 128;
      const badgeY = 1000;
      for (let i = 0; i < count; i++) {
        const def = getRelicDef(this.run.relics[i]);
        const rx = startX + i * (badgeW + gap);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 250, 240, 0.94)';
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 2.6;
        drawRoundedRect(ctx, rx, badgeY, badgeW, 38, 19);
        ctx.fill();
        ctx.stroke();

        const icon = this.assets.relics[def.branch];
        if (icon.ready) {
          ctx.drawImage(icon.el, rx + 5, badgeY + 2, 34, 34);
        }
        ctx.fillStyle = INK;
        ctx.font = `800 15px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.name, rx + 44, badgeY + 20);
        ctx.restore();
      }
    }

    // 5. 底部手绘贴纸控制栏
    const btnY = 1124;
    const btnH = 50;
    if (this.gameMode === 'roguelike') {
      this.drawStickerButton(ctx, {
        id: 'rogue-new',
        x: 24,
        y: btnY,
        w: 132,
        h: btnH,
        label: '重开闯关',
        disabled: this.busy,
        onClick: () =>
          this.startNewRoguelikeRun(
            Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
          ),
      });
      this.drawStickerButton(ctx, {
        id: 'relics',
        x: 166,
        y: btnY,
        w: 130,
        h: btnH,
        label: `祝福(${this.run.relics.length})`,
        accent: this.showRelicsModal || this.run.relics.length > 0,
        onClick: () => {
          this.showRelicsModal = !this.showRelicsModal;
          this.showRulesModal = false;
          this.showDebugPanel = false;
        },
      });
      this.drawStickerButton(ctx, {
        id: 'speed',
        x: 306,
        y: btnY,
        w: 122,
        h: btnH,
        label: `速度 ${this.speed}×`,
        onClick: () => {
          this.speed = this.speed === 1.0 ? 2.0 : 1.0;
        },
      });
      this.drawStickerButton(ctx, {
        id: 'to-pvp',
        x: 438,
        y: btnY,
        w: 124,
        h: btnH,
        label: '双人模式',
        disabled: this.busy,
        onClick: () =>
          this.startNewGame(Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)),
      });
      this.drawStickerButton(ctx, {
        id: 'shake',
        x: 572,
        y: btnY,
        w: 124,
        h: btnH,
        label: `震屏 ${this.shakeEnabled ? '开' : '关'}`,
        onClick: () => {
          this.shakeEnabled = !this.shakeEnabled;
        },
      });
    } else {
      this.drawStickerButton(ctx, {
        id: 'to-rogue',
        x: 24,
        y: btnY,
        w: 126,
        h: btnH,
        label: '肉鸽闯关',
        accent: true,
        disabled: this.busy,
        onClick: () =>
          this.startNewRoguelikeRun(
            Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
          ),
      });
      this.drawStickerButton(ctx, {
        id: 'new',
        x: 160,
        y: btnY,
        w: 112,
        h: btnH,
        label: '新棋盘',
        disabled: this.busy,
        onClick: () =>
          this.startNewGame(Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)),
      });
      this.drawStickerButton(ctx, {
        id: 'speed',
        x: 282,
        y: btnY,
        w: 122,
        h: btnH,
        label: `速度 ${this.speed}×`,
        onClick: () => {
          this.speed = this.speed === 1.0 ? 2.0 : 1.0;
        },
      });
      this.drawStickerButton(ctx, {
        id: 'debug',
        x: 414,
        y: btnY,
        w: 124,
        h: btnH,
        label: '实验台',
        accent: this.showDebugPanel,
        onClick: () => {
          this.showDebugPanel = !this.showDebugPanel;
          this.showRulesModal = false;
          this.selected = -1;
          this.clearPreview();
        },
      });
      this.drawStickerButton(ctx, {
        id: 'shake',
        x: 548,
        y: btnY,
        w: 148,
        h: btnH,
        label: `震屏 ${this.shakeEnabled ? '开' : '关'}`,
        onClick: () => {
          this.shakeEnabled = !this.shakeEnabled;
        },
      });
    }

    // 页脚小字
    ctx.fillStyle = INK_SOFT;
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const footerText =
      this.gameMode === 'roguelike'
        ? `CAT BOOM 肉鸽 MVP  ·  第 ${this.run.stageIndex + 1}/3 关  ·  已选祝福 ${this.run.relics.length}  ·  合法交换 ${this.legalCount}`
        : `CAT BOOM 双人模式  ·  回合 ${this.state.turn}  ·  SEED ${this.state.seed}  ·  合法交换 ${this.legalCount}`;
    ctx.fillText(footerText, VIRTUAL_W / 2, 1204);

    // 中央技能 / 拆招横幅
    if (this.bannerLife > 0 && this.bannerText) {
      const alpha = Math.min(1, this.bannerLife / 0.35, (this.bannerMaxLife - this.bannerLife) / 0.15 + 0.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const bw = 590;
      const bh = 62;
      const bx = (VIRTUAL_W - bw) / 2;
      const by = 520;
      ctx.fillStyle = '#fff9e6';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4.5;
      drawRoundedRect(ctx, bx, by, bw, bh, 31);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = `900 22px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawCenteredIconText(ctx, this.bannerIcon, this.bannerText, VIRTUAL_W / 2, by + bh / 2 + 1, 32, 8);
      ctx.restore();
    }

    // 出手确认后的实时连击伤害战报卡（覆盖顶部状态条，零遮挡棋盘核心）
    if (this.comboTracker && !this.stepWaitResolver) {
      this.renderComboTracker(ctx, this.comboTracker);
    }

    // 6. 弹窗层（肉鸽 3 选 1 与结算优先于棋盘）
    if (this.showRulesModal) {
      this.renderRulesModal(ctx);
    } else if (this.showRelicsModal) {
      this.renderRelicsModal(ctx);
    } else if (this.showDebugPanel) {
      this.renderDebugPanel(ctx);
    } else if (
      this.gameMode === 'roguelike' &&
      (this.run.phase === 'opening_reward' || this.run.phase === 'reward')
    ) {
      this.renderRewardModal(ctx);
    } else if (
      this.gameMode === 'roguelike' &&
      (this.run.phase === 'victory' || this.run.phase === 'defeat')
    ) {
      this.renderRunEndModal(ctx);
    }

    ctx.restore();
  }

  private renderComboTracker(ctx: CanvasRenderingContext2D, ct: ComboTracker): void {
    const fadeAlpha = ct.active ? 1 : Math.max(0, Math.min(1, ct.holdLife / 0.45));
    if (fadeAlpha <= 0.01) return;

    const x = 24;
    const y = 152;
    const w = 672;
    const h = 88;
    const accent = ct.isPlayer ? '#e67e22' : '#dc2626';

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // 暖棕贴纸投影
    ctx.fillStyle = 'rgba(78, 52, 46, 0.18)';
    drawRoundedRect(ctx, x, y + 4, w, h, 20);
    ctx.fill();

    // 战报卡片主体
    ctx.fillStyle = ct.isPlayer ? 'rgba(255, 251, 240, 0.97)' : 'rgba(255, 242, 242, 0.97)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.2;
    drawRoundedRect(ctx, x, y, w, h, 20);
    ctx.fill();
    ctx.stroke();

    // 左栏：出手者 + 轮数/连爆徽章 + 弹跳总伤害大数字
    ctx.fillStyle = INK_SOFT;
    ctx.font = `800 14px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const metaParts: string[] = [`${ct.actorLabel} · 连击战报`];
    if (ct.rounds > 0) metaParts.push(`${ct.rounds}轮`);
    if (ct.blastWaves > 0) metaParts.push(`${ct.blastWaves}波爆`);
    ctx.fillText(metaParts.join(' · '), x + 18, y + 23);

    const popScale = 1 + 0.22 * Math.sin(ct.pulse * Math.PI);
    ctx.save();
    ctx.translate(x + 18, y + 58);
    ctx.scale(popScale, popScale);
    ctx.fillStyle = ct.isPlayer ? '#d9534f' : '#b91c1c';
    ctx.font = `900 32px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const hasBlastIcon = this.drawUiIcon(ctx, 'blast', 15, 0, 30);
    ctx.fillText(`${ct.totalDamage} 伤`, hasBlastIcon ? 36 : 0, 0);
    ctx.restore();

    // 若有穿盾真伤或护盾抵挡，在总伤右侧紧贴小胶囊标出
    if (ct.trueDamage > 0 || ct.shieldBlocked > 0) {
      const tagText =
        ct.trueDamage > 0 ? `真伤 ${ct.trueDamage}` : `盾挡 ${ct.shieldBlocked}`;
      ctx.fillStyle = ct.trueDamage > 0 ? '#7e22ce' : '#1d4ed8';
      ctx.font = `800 13px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, x + 238, y + 60);
    }

    // 竖向手绘虚线分隔
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.24)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 250, y + 14);
    ctx.lineTo(x + 250, y + h - 14);
    ctx.stroke();
    ctx.setLineDash([]);

    // 右栏：最近 3 条实时结算明细流水
    const recent = ct.logs.slice(-3);
    if (recent.length === 0) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 16px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('正在结算本回合连击...', x + 266, y + h / 2);
    } else {
      const rowH = 24;
      const startY = y + (h - recent.length * rowH) / 2 + rowH / 2;
      recent.forEach((entry, idx) => {
        const ry = startY + idx * rowH;
        const isLatest = idx === recent.length - 1;
        ctx.fillStyle = isLatest ? INK : INK_SOFT;
        ctx.font = `${isLatest ? '800' : '600'} 15px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.label, x + 266, ry);

        ctx.fillStyle = entry.color;
        ctx.font = `900 ${isLatest ? 17 : 15}px ${FONT_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.fillText(entry.deltaText, x + w - 18, ry);
      });
    }

    ctx.restore();
  }

  private renderRewardModal(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(78, 52, 46, 0.56)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const x = 32;
    const y = 148;
    const w = 656;
    const h = 860;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    drawRoundedRect(ctx, x, y, w, h, 28);
    ctx.fill();
    ctx.stroke();

    const isOpening = this.run.phase === 'opening_reward';
    const clearedBoss = getBossProfile(this.run.stageIndex);
    const nextBoss = getBossProfile(isOpening ? 0 : this.run.stageIndex + 1);

    ctx.fillStyle = '#d97706';
    ctx.font = `900 30px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this.drawCenteredIconText(
      ctx,
      isOpening ? 'gift' : 'trophy',
      isOpening ? '猫神起手礼 · 开局 3 选 1' : `击败 ${clearedBoss.name}！`,
      VIRTUAL_W / 2,
      y + 47,
      38,
      8
    );

    ctx.fillStyle = INK_SOFT;
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(
      isOpening
        ? '先选 1 个初始流派祝福，带着专属机制开启 3 关肉鸽闯关！'
        : `已回复 +${STAGE_CLEAR_HEAL} HP（当前 ${this.run.playerHp}/${this.run.playerMaxHp}） · 选择 1 个流派祝福`,
      VIRTUAL_W / 2,
      y + 96
    );

    ctx.fillStyle = '#b45309';
    ctx.font = `700 16px ${FONT_FAMILY}`;
    ctx.fillText(
      `${isOpening ? '第 1 关预告' : '下一关预告'}：第 ${nextBoss.stage} 关 ${nextBoss.name}（${nextBoss.traitShort}）`,
      VIRTUAL_W / 2,
      y + 128
    );

    // 3 张肉鸽祝福手绘贴纸卡
    const cardW = 596;
    const cardH = 192;
    const cardX = x + (w - cardW) / 2;
    const startY = y + 160;
    const gap = 22;

    this.run.rewardChoices.forEach((relicId, idx) => {
      const def = getRelicDef(relicId);
      const cy = startY + idx * (cardH + gap);

      // 将整张卡牌注册为可点击按钮
      this.buttons.push({
        id: `reward-${relicId}`,
        x: cardX,
        y: cy,
        w: cardW,
        h: cardH,
        label: def.name,
        onClick: () => this.chooseRewardRelic(relicId),
      });

      ctx.save();
      // 卡片落影
      ctx.fillStyle = 'rgba(78, 52, 46, 0.16)';
      drawRoundedRect(ctx, cardX, cy + 5, cardW, cardH, 22);
      ctx.fill();

      // 卡片主体
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = def.badgeColor;
      ctx.lineWidth = 4;
      drawRoundedRect(ctx, cardX, cy, cardW, cardH, 22);
      ctx.fill();
      ctx.stroke();

      // 左侧流派贴纸图标
      const icon = this.assets.relics[def.branch];
      if (icon.ready) {
        ctx.drawImage(icon.el, cardX + 20, cy + 44, 104, 104);
      } else {
        ctx.fillStyle = def.badgeColor;
        ctx.beginPath();
        ctx.arc(cardX + 72, cy + 96, 44, 0, Math.PI * 2);
        ctx.fill();
      }

      // 流派标签胶囊
      ctx.fillStyle = def.badgeColor;
      drawRoundedRect(ctx, cardX + 144, cy + 26, 86, 28, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 14px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.branchLabel, cardX + 187, cy + 41);

      // 祝福标题
      ctx.fillStyle = INK;
      ctx.font = `900 26px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(def.name, cardX + 242, cy + 49);

      // 核心效果（分行展示防溢出）
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 18px ${FONT_FAMILY}`;
      const desc = def.detailDesc;
      const line1 = desc.slice(0, 21);
      const line2 = desc.slice(21);
      ctx.fillText(line1, cardX + 144, cy + 98);
      if (line2) {
        ctx.fillText(line2, cardX + 144, cy + 128);
      }

      // 右下选择提示
      ctx.fillStyle = def.badgeColor;
      ctx.font = `800 16px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.fillText('点击选择此祝福', cardX + cardW - 22, cy + cardH - 20);
      ctx.restore();
    });
  }

  private renderRelicsModal(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(78, 52, 46, 0.48)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const x = 44;
    const y = 220;
    const w = 632;
    const h = 660;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 26px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`已收集的猫猫祝福 (${this.run.relics.length})`, x + 28, y + 52);

    if (this.run.relics.length === 0) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 20px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('尚未获得祝福，击败当前 Boss 后即可 3 选 1！', VIRTUAL_W / 2, y + 290);
    } else {
      let cy = y + 92;
      for (const id of this.run.relics) {
        const def = getRelicDef(id);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, x + 24, cy, w - 48, 128, 18);
        ctx.fill();
        ctx.stroke();

        const icon = this.assets.relics[def.branch];
        if (icon.ready) {
          ctx.drawImage(icon.el, x + 38, cy + 22, 82, 82);
        }
        ctx.fillStyle = INK;
        ctx.font = `900 22px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.fillText(`[${def.branchLabel}] ${def.name}`, x + 136, cy + 44);
        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 16px ${FONT_FAMILY}`;
        ctx.fillText(def.detailDesc.slice(0, 24), x + 136, cy + 78);
        if (def.detailDesc.length > 24) {
          ctx.fillText(def.detailDesc.slice(24), x + 136, cy + 104);
        }
        cy += 144;
      }
    }

    this.drawStickerButton(ctx, {
      id: 'close-relics',
      x: VIRTUAL_W / 2 - 96,
      y: y + h - 72,
      w: 192,
      h: 48,
      label: '关闭',
      accent: true,
      onClick: () => {
        this.showRelicsModal = false;
      },
    });
  }

  private renderRunEndModal(ctx: CanvasRenderingContext2D): void {
    const isWin = this.run.phase === 'victory';
    ctx.fillStyle = 'rgba(78, 52, 46, 0.56)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const x = 56;
    const y = 260;
    const w = 608;
    const h = 610;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = isWin ? '#d97706' : '#dc2626';
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, x, y, w, h, 28);
    ctx.fill();
    ctx.stroke();

    const boss = getBossProfile(this.run.stageIndex);
    const avatar = isWin ? this.assets.avatarP1 : this.assets.bosses[boss.id];
    if (avatar.ready) {
      ctx.drawImage(avatar.el, VIRTUAL_W / 2 - 68, y + 28, 136, 136);
    }

    ctx.fillStyle = isWin ? '#b45309' : '#b91c1c';
    ctx.font = `900 32px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this.drawCenteredIconText(
      ctx, isWin ? 'trophy' : 'paw', isWin ? '猫屋大捷 · 全通关！' : '被猫猫挠趴啦',
      VIRTUAL_W / 2, y + 202, 40, 8
    );

    ctx.fillStyle = INK_SOFT;
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(
      isWin
        ? '你击败了大橘、奶牛猫与终极猫王哈基米！'
        : `止步于第 ${boss.stage} 关 · ${boss.name}`,
      VIRTUAL_W / 2,
      y + 252
    );

    // 战绩摘要盒
    ctx.fillStyle = '#f7ebd9';
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x + 36, y + 284, w - 72, 186, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `800 19px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(`• 总出招回合：${this.run.totalTurns} 回合`, x + 64, y + 328);
    ctx.fillText(`• 单回合最高爆发：${this.run.bestTurnDamage} 伤害`, x + 64, y + 368);
    ctx.fillText(
      `• 收集祝福：${
        this.run.relics.length > 0
          ? this.run.relics.map((id) => getRelicDef(id).name).join(' / ')
          : '无'
      }`,
      x + 64,
      y + 408
    );
    ctx.fillText(`• 剩余生命：${this.run.playerHp} / ${this.run.playerMaxHp}`, x + 64, y + 448);

    this.drawStickerButton(ctx, {
      id: 'run-again',
      x: VIRTUAL_W / 2 - 120,
      y: y + h - 92,
      w: 240,
      h: 56,
      label: isWin ? '再来一局' : '重新挑战',
      accent: true,
      onClick: () =>
        this.startNewRoguelikeRun(
          Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
        ),
    });
  }

  private renderRulesModal(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(78, 52, 46, 0.45)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const x = 36;
    const y = 186;
    const w = 648;
    const h = 790;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 26px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Cat Boom · 猫梗肉鸽玩法说明', x + 30, y + 52);

    const lines = [
      '【核心合成与连环引爆】',
      '• 3 连 / V 字合 1 只 2 级大猫；直线 4 连合 2 只大猫。',
      '• 直线 5 连 或 三只 2 级大猫三连 → 合 1 只 3 级炫彩猫！',
      '• 大猫混消：炸周围 1 圈 + 3 格宽光束；炫彩猫 6 方向全爆！',
      '• 连锁二次引爆：被波及的大猫/炫彩猫会逐波连环炸开！',
      '',
      '【猫梗 Boss 意图与博弈】',
      '• 红虚线框标出 Boss 下回合准备动哪两只猫，可抢先拆招！',
      '• 大橘：专抢橘猫并干饭回血 ｜ 奶牛猫：每2回合跑酷变大猫',
      '• 哈基米：每2回合哈气叠 8 盾 + 造大猫，高伤抢爆！',
      '• 开局先选 1 个初始祝福；击败 Boss 回 +25 血并再 3 选 1。',
      '',
      '【操作与视觉指示】',
      '• 拖动或点选相邻猫交换；获得「猫须雷达」后可合成猫会挥爪提示。',
      '• 绿虚环 = 合成中心 ｜ 橙/粉圈 = 逐波爆发 ｜ 青箭 = 收缩。',
    ];

    ctx.fillStyle = INK_SOFT;
    ctx.font = `600 18px ${FONT_FAMILY}`;
    let cy = y + 96;
    for (const line of lines) {
      ctx.fillText(line, x + 30, cy);
      cy += line === '' ? 14 : 38;
    }

    this.drawStickerButton(ctx, {
      id: 'close-rules',
      x: VIRTUAL_W / 2 - 96,
      y: y + h - 72,
      w: 192,
      h: 48,
      label: '知道了',
      accent: true,
      onClick: () => {
        this.showRulesModal = false;
      },
    });
  }

  private renderDebugPanel(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(78, 52, 46, 0.45)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const x = 36;
    const y = 210;
    const w = 648;
    const h = 760;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 25px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('实验台 · 核心测试局面（完整 17 局面见 lab.html）', x + 28, y + 50);

    ctx.fillStyle = INK_SOFT;
    ctx.font = `600 16px ${FONT_FAMILY}`;
    ctx.fillText('点击以下核心局面载入（金色箭头指示推荐交换）：', x + 28, y + 84);

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
        },
      });
    }

    const toolY = y + 372;
    this.drawStickerButton(ctx, {
      id: 'undo',
      x: x + 28,
      y: toolY,
      w: 286,
      h: 48,
      label: '恢复上回合开始',
      disabled: this.busy,
      onClick: () => this.undoTurn(),
    });
    this.drawStickerButton(ctx, {
      id: 'step-mode',
      x: x + 334,
      y: toolY,
      w: 286,
      h: 48,
      label: `逐轮模式：${this.stepEnabled ? '开' : '关'}`,
      accent: this.stepEnabled,
      onClick: () => {
        this.stepEnabled = !this.stepEnabled;
      },
    });

    const statY = toolY + 74;
    ctx.fillStyle = '#f7ebd9';
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x + 28, statY, w - 56, 134, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `700 17px ${FONT_FAMILY}`;
    ctx.fillText(
      `种子：${this.state.seed}   ·   回合：${this.state.turn}   ·   合法交换：${this.legalCount}`,
      x + 44,
      statY + 36
    );
    if (this.lastSummary) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 16px ${FONT_FAMILY}`;
      ctx.fillText(
        `上次操作：首轮 ${this.lastSummary.directDamage} 伤，总计 ${this.lastSummary.totalDamage} 伤（${this.lastSummary.rounds} 轮）`,
        x + 44,
        statY + 74
      );
      ctx.fillText(
        `收缩后确定性匹配：${this.lastSummary.deterministicMatches}   ·   对手最大直接伤害：${this.lastSummary.opponentBest}`,
        x + 44,
        statY + 108
      );
    } else {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 16px ${FONT_FAMILY}`;
      ctx.fillText('完成一次交换后，这里将显示伤害与连锁统计。', x + 44, statY + 80);
    }

    this.drawStickerButton(ctx, {
      id: 'close-debug',
      x: VIRTUAL_W / 2 - 96,
      y: y + h - 70,
      w: 192,
      h: 48,
      label: '关闭',
      onClick: () => {
        this.showDebugPanel = false;
      },
    });
  }
}
