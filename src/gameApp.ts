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
  buildBossModifiers,
  buildPlayerModifiers,
  computeBossIntent,
  computeHintSwaps,
  createRoguelikeRun,
  createStageGameState,
  createTutorialScenario,
  getBossProfile,
  getRelicDef,
  hasHintRelic,
  HintSet,
  RelicId,
  RoguelikeRun,
  rollRelicChoices,
  STAGE_CLEAR_HEAL,
  TutorialScenario,
  TutorialStepIndex,
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
const NEST_LIGHT_STEP = 0.1; // 匹配猫窝依次亮起的间隔（秒）
const NEST_MATCH_RIM = '#ffb938';
const NEST_CENTER_RIM = '#5fd394';
const WAVE_COLORS = ['#ff9852', '#ff4d8d', '#a855f7', '#ec4899'] as const;
const TUTORIAL_DONE_STORAGE_KEY = 'cat_boom_tutorial_v1_done';

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

/** 爆炸/合成后飞向血条（或护盾徽章）的伤害猫，抵达瞬间才真正扣减显示血量 */
interface DamageFlyer {
  color: number;
  level: CatLevel;
  sx: number;
  sy: number;
  ox: number; // 弹出点
  oy: number;
  bend: number; // 弧线侧向弯曲量
  x: number;
  y: number;
  scale: number;
  rot: number;
  vRot: number;
  delay: number;
  elapsed: number;
  popDur: number;
  flyDur: number;
  defender: 0 | 1;
  hp: number;
  shield: number;
  toShield: boolean;
  trailColor: string;
  trail: Array<{ x: number; y: number }>;
  popupText: string;
  popupColor: string;
}

interface HitSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
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
  // 战报卡动效状态（纯表现层）
  age: number;
  shownDamage: number; // 滚动计数中的显示伤害
  tickPop: number; // 数字每跳一次的弹跳 1→0
  tier: number; // 伤害档位 0~3
  burst: number; // 升档星光 1→0
  comboShown: number; // 已展示的连爆/连锁数
  stampLife: number; // 印章砸下动画 1→0
  shake: number; // 卡片抖动 1→0
  logSlide: number; // 明细滑入 1→0
  sweep: number; // 收尾扫光进度，-1 表示未开始
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

/** 战报卡伤害分档：<10 / 10~19 / 20~39 / ≥40 */
function comboDamageTier(dmg: number): number {
  return dmg >= 40 ? 3 : dmg >= 20 ? 2 : dmg >= 10 ? 1 : 0;
}

const COMBO_TIER_COLORS = ['#f97316', '#ef4444', '#e11d48', '#a855f7'] as const;

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
  private phaseStart = 0; // 当前演出阶段开始时刻（用于猫窝依次亮起）
  private matchOrder = new Map<number, number>(); // 本轮匹配格 → 亮起顺序（合成中心最后）
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
  private bossHighlightSwap: [number, number] | null = null;
  private hintSet: HintSet = { highValue: [], fallback: null };
  private tutorial: TutorialScenario | null = null;

  // 控制选项
  private busy = false;
  private speed = 1.0;
  private shakeEnabled = true;
  private stepEnabled = false;
  private stepWaitResolver: (() => void) | null = null;
  private showRulesModal = false;
  private showDebugPanel = false;
  private showRelicsModal = false;
  private expandedRewardRelicId: RelicId | null = null;

  // 渲染实体与动画
  private visuals = new Map<number, CatVisual>();
  private ambientAnims: AmbientCatAnim[] = [];
  private ambientSpawnTimer = 1.4;
  private lastAmbientCatId = -1;
  private ghosts: GhostParticle[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private floatings: FloatingDamage[] = [];
  private flyers: DamageFlyer[] = [];
  private sparks: HitSpark[] = [];
  // 血条显示层：与逻辑 state.hp 分离，伤害猫抵达时才扣减
  private dispHp: [number, number] | null = null;
  private trailHp: [number, number] = [0, 0];
  private trailHold: [number, number] = [0, 0];
  private dispShield: [number, number] = [0, 0];
  private inFlightHp: [number, number] = [0, 0];
  private inFlightShield: [number, number] = [0, 0];
  private barHit: [number, number] = [0, 0];
  // 回合切换演出：过场色带、阵营氛围色、Boss 思考与瞄准
  private turnIntro: { player: 0 | 1; t: number; dur: number } | null = null;
  private turnTint = 0; // 0=玩家1/你，1=对手/Boss
  private bossThink = 0; // Boss 头像思考蹦跳 1→0
  private bossAim: { a: number; b: number; t: number; dur: number } | null = null;
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
    const tutorialDone = this.platform.getStorage(TUTORIAL_DONE_STORAGE_KEY) === '1';
    if (!tutorialDone) {
      this.startTutorial();
    } else {
      this.startNewRoguelikeRun(Math.floor(Date.now() % 1000000));
    }
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
    if (this.tutorial) {
      return this.state.winner >= 0;
    }
    if (this.gameMode === 'roguelike') {
      if (this.run.phase !== 'battle' || this.state.player !== 0) return true;
    }
    return this.state.winner >= 0;
  }

  private getCurrentModifiers(forPlayer: 0 | 1): RuleModifiers | undefined {
    if (this.tutorial || this.gameMode !== 'roguelike') return undefined;
    return forPlayer === 0 ? buildPlayerModifiers(this.run.relics) : buildBossModifiers(this.run);
  }

  private startTutorial(): void {
    if (this.busy) return;
    this.gameMode = 'roguelike';
    this.showRulesModal = false;
    this.showDebugPanel = false;
    this.showRelicsModal = false;
    this.expandedRewardRelicId = null;
    this.run = createRoguelikeRun(Math.floor(Date.now() % 1000000));
    this.loadTutorialStep(0);
  }

  private loadTutorialStep(step: TutorialStepIndex): void {
    const scenario = createTutorialScenario(step);
    this.tutorial = scenario;
    this.bossHighlightSwap = null;
    this.comboTracker = null;
    this.loadState(scenario.state);
    this.hintSet = { highValue: [scenario.guideSwap], fallback: scenario.guideSwap };
    this.setStatus(scenario.prompt);
  }

  private finishTutorial(markCompleted: boolean): void {
    if (markCompleted) {
      this.platform.setStorage(TUTORIAL_DONE_STORAGE_KEY, '1');
    }
    this.tutorial = null;
    this.busy = false;
    this.startNewRoguelikeRun(
      Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
    );
  }

  private startNewRoguelikeRun(seed: number): void {
    if (this.busy) return;
    this.tutorial = null;
    this.gameMode = 'roguelike';
    this.showDebugPanel = false;
    this.showRelicsModal = false;
    this.expandedRewardRelicId = null;
    this.comboTracker = null;
    this.run = createRoguelikeRun(seed);
    this.startCurrentStage();
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
    this.showBanner(`第 ${boss.stage}/3 关 · ${boss.name} 登场！`, 1.4);
    this.refreshPlayerTurnGuides();
  }

  private chooseRewardRelic(id: RelicId): void {
    if (this.gameMode !== 'roguelike' || this.run.phase !== 'reward') {
      return;
    }
    this.run.relics.push(id);
    this.run.rewardChoices = [];
    this.expandedRewardRelicId = null;
    this.run.stageIndex += 1;
    this.sound.playChime();
    this.startCurrentStage();
  }

  private refreshPlayerTurnGuides(): void {
    if (this.tutorial) {
      this.hintSet = { highValue: [this.tutorial.guideSwap], fallback: this.tutorial.guideSwap };
      return;
    }
    const canShowHints = this.gameMode === 'roguelike' && hasHintRelic(this.run.relics);
    this.hintSet = canShowHints
      ? computeHintSwaps(this.state, this.getCurrentModifiers(0))
      : { highValue: [], fallback: null };
    if (this.gameMode === 'roguelike' && this.run.phase === 'battle' && this.state.winner < 0) {
      this.setStatus('轮到你了！拖动猫猫 3 连');
    }
  }

  private startNewGame(seed: number): void {
    if (this.busy) return;
    this.tutorial = null;
    this.gameMode = 'pvp';
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
    this.clearDamageFlyers();
    this.turnIntro = null;
    this.bossAim = null;
    this.bossThink = 0;
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
          // 有效交换从当前悬空位置丝滑落入目标格；无效交换直接弹回原位
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

      if (
        (this.previewTarget === upCell && this.preview.valid) ||
        (this.hoverPreviewed && this.previewTarget === upCell)
      ) {
        void this.submitSwap(this.selected, upCell);
        return;
      }

      if (!validSwap(this.state, this.selected, upCell)) {
        this.setStatus('需要 3 只同色连成直线哦');
        this.clearPreview();
        return;
      }

      this.setPreview(this.selected, upCell);
      this.hoverPreviewed = false;
      const dmg = this.preview.event?.damage ?? 0;
      this.setStatus(`预计 ${dmg} 伤 · 再点一次确认`);
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

  private async animateSwapPair(
    board: Board,
    a: number,
    b: number,
    duration: number,
    arc: number,
    lift: number
  ): Promise<void> {
    const items: Array<{ vis: CatVisual; sx: number; sy: number; tx: number; ty: number; side: number }> = [];
    [a, b].forEach((cell, i) => {
      const cat = board[cell];
      const vis = cat ? this.visuals.get(cat.id) : undefined;
      if (!vis) return;
      const tp = this.cellPoint(cell);
      items.push({ vis, sx: vis.x, sy: vis.y, tx: tp.x, ty: tp.y, side: i === 0 ? 1 : -1 });
    });
    if (items.length === 0) return;
    await this.runTween(duration, 'cubicInOut', (t) => {
      const bump = Math.sin(Math.PI * t);
      for (const it of items) {
        const dx = it.tx - it.sx;
        const dy = it.ty - it.sy;
        const len = Math.hypot(dx, dy) || 1;
        it.vis.x = it.sx + dx * t + (-dy / len) * arc * bump * it.side;
        it.vis.y = it.sy + dy * t + (dx / len) * arc * bump * it.side;
        it.vis.scale = 1 + lift * bump;
      }
    });
    for (const it of items) it.vis.scale = 1;
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
    // 少量四散碎猫作为爆炸余波，主视觉交给飞向血条的伤害猫
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

  /** 血条几何（与 drawPlayerBar 保持一致） */
  private barRect(player: 0 | 1): { x: number; y: number; w: number; h: number } {
    return { x: 96, y: player === 1 ? 60 : 1070, w: player === 1 ? 448 : 596, h: 58 };
  }

  private maxHpOf(player: 0 | 1): number {
    return this.state.maxHp ? this.state.maxHp[player] : HP;
  }

  /** 伤害猫追踪目标：护盾徽章中心，或当前显示血量的末端 */
  private flyerTarget(f: DamageFlyer): { x: number; y: number } {
    const r = this.barRect(f.defender);
    if (f.toShield) return { x: r.x + r.w - 9 - 44, y: r.y + r.h / 2 };
    const hp = this.dispHp ? this.dispHp[f.defender] : this.state.hp[f.defender];
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, this.maxHpOf(f.defender))));
    return { x: r.x + Math.max(26, r.w * ratio - 10), y: r.y + r.h / 2 };
  }

  private clearDamageFlyers(): void {
    this.flyers = [];
    this.sparks = [];
    this.inFlightHp = [0, 0];
    this.inFlightShield = [0, 0];
  }

  /** 从被炸/被合成的格子取出伤害猫起点（数量不足时复用格子，营造密集弹幕感） */
  private flyerStarts(
    event: RoundEvent,
    cells: number[],
    min: number,
    max: number,
    at?: (cell: number) => number
  ): Array<{ x: number; y: number; color: number; level: CatLevel }> {
    const valid = cells.filter((c) => event.before[c]);
    if (valid.length === 0) return [];
    const n = Math.max(min, Math.min(max, valid.length));
    const starts: Array<{ x: number; y: number; color: number; level: CatLevel }> = [];
    for (let k = 0; k < n; k++) {
      const cell = valid[k % valid.length];
      const cat = event.before[cell] as CatData;
      const p = this.cellPoint(at ? at(cell) : cell);
      const jitter = k >= valid.length ? 26 : 0;
      starts.push({
        x: p.x + (Math.random() - 0.5) * jitter,
        y: p.y + (Math.random() - 0.5) * jitter,
        color: cat.color,
        level: cat.level,
      });
    }
    return starts;
  }

  /** 把一段扣血/扣盾分给一群伤害猫：逻辑值立即扣减，显示值等猫抵达时才扣减 */
  private launchDamageFlyers(
    starts: Array<{ x: number; y: number; color: number; level: CatLevel }>,
    defender: 0 | 1,
    hp: number,
    shield: number,
    trailColor: string,
    popupColor: string
  ): void {
    this.state.hp[defender] = Math.max(0, this.state.hp[defender] - hp);
    if (this.state.shield) {
      this.state.shield[defender] = Math.max(0, this.state.shield[defender] - shield);
    }
    if (starts.length === 0 || hp + shield <= 0) return;

    const n = starts.length;
    // 护盾与血量按比例分配飞猫数量（两者都有时各至少 1 只），并均匀交错
    let nShield = 0;
    if (shield > 0) {
      nShield = hp > 0 ? Math.max(1, Math.min(n - 1, Math.round((n * shield) / (hp + shield)))) : n;
    }
    const nHp = n - nShield;
    const share = (total: number, m: number, k: number): number =>
      m <= 0 ? 0 : Math.floor(total / m) + (k < total % m ? 1 : 0);
    const popupText = [hp > 0 ? `−${hp}` : '', shield > 0 ? `盾−${shield}` : '']
      .filter(Boolean)
      .join(' ');

    let si = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      const s = starts[i];
      const toShield = nShield > 0 && Math.floor(((i + 1) * nShield) / n) > Math.floor((i * nShield) / n);
      const fHp = toShield ? 0 : share(hp, nHp, hi++);
      // 只有 1 只猫却同时有盾和血时，由它一并携带
      const fShield = toShield ? share(shield, nShield, si++) : nShield === 0 ? (i === 0 ? shield : 0) : 0;
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
        popupText: i === 0 ? popupText : '',
        popupColor: hp > 0 ? popupColor : '#2563eb',
      });
      this.inFlightHp[defender] += fHp;
      this.inFlightShield[defender] += fShield;
    }
  }

  private onFlyerArrive(f: DamageFlyer, tx: number, ty: number): void {
    const d = f.defender;
    this.inFlightHp[d] = Math.max(0, this.inFlightHp[d] - f.hp);
    this.inFlightShield[d] = Math.max(0, this.inFlightShield[d] - f.shield);
    this.barHit[d] = 1;
    this.trailHold[d] = 0.4 / this.speed;
    if (f.popupText) {
      this.spawnFloatingText(f.popupText, d === 1 ? 92 : 1070, f.popupColor);
    }
    if (this.sparks.length < 180) {
      const sparkColors = [f.trailColor, '#ffffff', f.toShield ? '#60a5fa' : '#ffd166'];
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
          maxLife,
        });
      }
    }
  }

  /** 伤害猫：弹出 → 沿二次贝塞尔弧线加速追踪血条末端 */
  private updateDamageFlyers(dt: number): void {
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
        const cx = (f.ox + tg.x) / 2 - (dy / len) * f.bend;
        const cy = (f.oy + tg.y) / 2 + (dx / len) * f.bend;
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
  private updateHpDisplay(dt: number): void {
    const shieldOf = (p: 0 | 1): number => (this.state.shield ? this.state.shield[p] : 0);
    if (!this.dispHp) {
      this.dispHp = [this.state.hp[0], this.state.hp[1]];
      this.trailHp = [this.state.hp[0], this.state.hp[1]];
      this.dispShield = [shieldOf(0), shieldOf(1)];
    }
    for (const p of [0, 1] as const) {
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

  private renderDamageFlyers(ctx: CanvasRenderingContext2D): void {
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
      ctx.fillStyle = '#ffffff';
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
          showBadge: false,
        },
        this.assets
      );
    }

    for (const s of this.sparks) {
      const a = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 回合收尾前等伤害猫全部落地（最多等 1.2 秒），避免结算先于扣血出现 */
  private async waitFlyersLanded(): Promise<void> {
    let waited = 0;
    while (this.flyers.length > 0 && waited < 1.2) {
      await this.waitSec(0.05);
      waited += 0.05 / this.speed;
    }
  }

  private pushComboLog(delta: number, label: string, color: string, deltaText?: string): void {
    if (!this.comboTracker) return;
    this.comboTracker.totalDamage = Math.max(0, this.comboTracker.totalDamage + delta);
    this.comboTracker.pulse = 1;
    this.comboTracker.logSlide = 1;
    this.comboTracker.logs.push({
      label,
      deltaText: deltaText ?? (delta >= 0 ? `+${delta}` : `${delta}`),
      color,
    });
    if (this.comboTracker.logs.length > 6) {
      this.comboTracker.logs.shift();
    }
  }

  private isSameSwapPair(a: number, b: number, pair: [number, number]): boolean {
    return (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);
  }

  private async submitSwap(a: number, b: number, isBossAction = false): Promise<void> {
    if (this.busy && !isBossAction) return;
    if (!validSwap(this.state, a, b)) {
      this.sound.playInvalid();
      this.setStatus(this.tutorial ? '按绿色手指滑动试试看~' : '需要 3 只同色连成直线哦');
      this.selected = -1;
      this.clearPreview();
      return;
    }

    // 教学模式保护：确保玩家按引导体验每一步核心爽点
    if (this.tutorial && !isBossAction) {
      if (!this.isSameSwapPair(a, b, this.tutorial.guideSwap)) {
        this.sound.playInvalid();
        this.setStatus('先按绿色手指滑动这两只猫哦~');
        this.selected = -1;
        this.clearPreview();
        return;
      }
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
      age: 0,
      shownDamage: 0,
      tickPop: 0,
      tier: 0,
      burst: 0,
      comboShown: 0,
      stampLife: 0,
      shake: 0,
      logSlide: 0,
      sweep: -1,
    };

    this.sound.playSwap();
    // 交换：两只猫沿相反弧线互换并轻微抬起，Boss 出手放慢便于看清
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
      this.activeEventPhase = 'match';
      this.activeWaveIndex = -1;
      this.comboTracker.rounds = event.number;
      this.setStatus(`${actorLabel} · 第 ${event.number} 轮 · ${event.damage} 伤`);
      if (idx > 0) {
        this.sound.playCombo(event.number);
        this.showBanner(`第 ${event.number} 轮连锁！`, 0.78, 'sparkle');
      }
      // 匹配确认：猫窝从连线两端依次亮起、流向合成中心，猫随自己的窝亮起时跳一下
      this.phaseStart = this.elapsed;
      this.matchOrder = this.computeMatchOrder(event);
      let maxOrder = 0;
      const matchedVis: Array<{ vis: CatVisual; order: number }> = [];
      for (const [cell, order] of this.matchOrder) {
        maxOrder = Math.max(maxOrder, order);
        const cat = event.before[cell];
        const vis = cat ? this.visuals.get(cat.id) : undefined;
        if (vis) matchedVis.push({ vis, order });
      }
      const matchDur = Math.max(idx > 0 ? 0.62 : 0.55, maxOrder * NEST_LIGHT_STEP + 0.36);
      await this.runTween(matchDur, 'linear', (t) => {
        const now = t * matchDur;
        for (const m of matchedVis) {
          const lp = Math.max(0, Math.min(1, (now - m.order * NEST_LIGHT_STEP) / 0.22));
          m.vis.scale = 1 + 0.14 * Math.sin(Math.PI * lp);
        }
      });
      for (const m of matchedVis) m.vis.scale = 1;

      // 本轮真实扣血/扣盾（以规则结果为准），按波次拆给伤害猫
      const defender: 0 | 1 = attacker === 0 ? 1 : 0;
      let hpLeft = Math.max(0, this.state.hp[defender] - event.hp[defender]);
      let shieldLeft = this.state.shield
        ? Math.max(0, this.state.shield[defender] - event.shield[defender])
        : 0;
      const popupColor = event.trueDamage > 0 ? '#9333ea' : '#e54d42';
      let weightLeft = event.waves.reduce((s, wv) => s + Math.max(0, wv.damage), 0);

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
        await this.runTween(0.42, 'cubicInOut', (t) => {
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
            this.setStatus(`${actorLabel} · ${wave.wave + 1} 连环引爆！`);
            this.showBanner(`${wave.wave + 1} 连爆！`, 0.65, 'blast');
          }

          // 先点亮本波射线/范围：起爆源大猫蓄力膨胀，将被波及的猫瑟瑟发抖，看清后再炸开
          const chargeDur = wave.wave === 0 ? 0.5 : 0.55;
          const chargeScale = wave.wave === 0 ? 0.24 : 0.38;
          const sourceSet = new Set(wave.sources);
          const shakers = wave.cells
            .filter((c) => !sourceSet.has(c))
            .map((c) => event.before[c])
            .filter((c): c is CatData => Boolean(c))
            .map((c) => this.visuals.get(c.id))
            .filter((v): v is CatVisual => Boolean(v))
            .map((v) => ({ v, bx: v.x, by: v.y }));
          await this.runTween(chargeDur, 'backOut', (t) => {
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
          const waveKindLabel =
            wave.kind === 'rainbow'
              ? '炫彩全向爆'
              : wave.wave === 0
                ? '宽光束爆发'
                : `${wave.wave + 1} 连环引爆`;
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
        this.platform.vibrate('light');
        // 纯合成：被合进大猫的小猫从合成中心飞出
        const memberCells: number[] = [];
        const centerOf = new Map<number, number>();
        for (const center of event.centers) {
          for (const cell of center.members) {
            if (cell === center.cell) continue;
            memberCells.push(cell);
            centerOf.set(cell, center.cell);
          }
        }
        this.launchDamageFlyers(
          this.flyerStarts(event, memberCells, 6, 20, (c) => centerOf.get(c) ?? c),
          defender,
          hpLeft,
          shieldLeft,
          '#ffb347',
          popupColor
        );
        hpLeft = 0;
        shieldLeft = 0;
      }

      // 将本轮最终结算伤害（含纯合成/连锁加成/真伤/减伤修正）精确对齐至战报卡
      this.comboTracker.trueDamage += event.trueDamage;
      this.comboTracker.shieldBlocked += event.shieldBlocked;
      if (event.waves.length === 0) {
        const hasRainbow = event.centers.some((c) => c.resultLevel === 3);
        const mergeTag = hasRainbow ? '合成炫彩猫' : '合成大猫';
        const comboTag = event.bonus > 0 ? ` · 连锁+${event.bonus}` : '';
        this.pushComboLog(event.damage, `${mergeTag}${comboTag}`, '#d97706');
      } else {
        const delta = event.damage - waveShownDamage;
        if (delta > 0) {
          const extraTag =
            event.trueDamage > 0
              ? `真伤 +${event.trueDamage}`
              : event.bonus > 0
                ? '连锁加伤'
                : '祝福增伤';
          this.pushComboLog(
            delta,
            extraTag,
            event.trueDamage > 0 ? '#9333ea' : '#e54d42'
          );
        } else if (delta < 0) {
          this.pushComboLog(delta, '减伤生效', '#2563eb', `${delta}`);
        }
      }

      this.activeEventPhase = 'collapse';
      this.syncVisuals(event.afterClear);
      this.state.hp = [event.hp[0], event.hp[1]];
      if (this.state.shield) {
        this.state.shield = [event.shield[0], event.shield[1]];
      }

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
        await this.runTween(0.4, 'backOut', (t) => {
          for (const v of newBigs) v.scale = 0.4 + 0.6 * t;
        });
      }

      for (const move of event.moves) {
        const vis = this.visuals.get(move.id);
        if (!vis) continue;
        const sx = vis.x;
        const sy = vis.y;
        const tp = this.cellPoint(move.to);
        await this.runTween(0.075, 'cubicInOut', (t) => {
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
        await this.runTween(0.36, 'backOut', (t) => {
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
      this.comboTracker.holdLife = 2.0;
      this.comboTracker.maxHold = 2.0;
    }

    if (this.tutorial) {
      const completed = this.tutorial;
      this.sound.playChime();
      this.showBanner(completed.successBanner, 1.15, 'sparkle');
      this.setStatus(completed.successBanner);
      await this.waitSec(1.1);
      // 防止玩家在等待期间点了“跳过教学”
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
    if (this.state.winner < 0) {
      await this.waitSec(0.2);
      await this.playTurnIntro(this.state.player);
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
        this.sound.playVictory();
        if (this.run.stageIndex < BOSSES.length - 1) {
          this.run.playerHp = Math.min(this.run.playerMaxHp, this.run.playerHp + STAGE_CLEAR_HEAL);
          this.state.hp[0] = this.run.playerHp;
          this.run.rewardChoices = rollRelicChoices(
            this.run.relics,
            this.run.seed + (this.run.stageIndex + 1) * 7919 + this.run.totalTurns * 13
          );
          this.run.phase = 'reward';
          this.expandedRewardRelicId = null;
          this.setStatus(`击败 ${boss.name}！选 1 个祝福`, 'trophy');
          this.showBanner(`击败 ${boss.name}！`, 1.4, 'trophy');
        } else {
          this.run.phase = 'victory';
          this.setStatus('全部 Boss 已击败，通关大捷！', 'trophy');
          this.showBanner('通关大捷！', 1.8, 'trophy');
        }
        this.busy = false;
        return;
      }

      if (notice) {
        this.setStatus(notice);
      } else if (post.notes.length > 0) {
        this.setStatus(post.notes.join(' · '));
      }
      await this.waitSec(0.3);
      await this.runBossTurn();
    } else {
      // Boss 回合结束：结算大橘干饭回血 & 重置玩家单回合减伤
      const bossPost = applyBossPostTurnPassive(this.state, boss, events);
      if (bossPost.bossHealed > 0) {
        this.spawnFloatingText(`+${bossPost.bossHealed} HP`, 92, '#16a34a', 340);
        this.showBanner(`大橘吃橘回血 +${bossPost.bossHealed}`, 1.2, 'rice');
      }
      this.run.calmDefuseActive = false;
      this.run.bossTurnsTaken += 1;
      this.run.playerHp = this.state.hp[0];
      this.run.playerShield = this.state.shield ? this.state.shield[0] : 0;
      this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;

      if (this.state.winner === 1 || this.run.playerHp <= 0) {
        this.run.phase = 'defeat';
        this.sound.playDefeat();
        this.setStatus(`被 ${boss.name} 挠趴啦！点击重新挑战`);
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
  private async playTurnIntro(player: 0 | 1): Promise<void> {
    const ct = this.comboTracker;
    if (ct) {
      ct.active = false;
      ct.sweep = 2;
      ct.holdLife = Math.min(ct.holdLife, 0.3);
    }
    const dur = 0.9;
    this.turnIntro = { player, t: 0, dur: dur / this.speed };
    this.platform.vibrate('light');
    await this.waitSec(dur);
    this.turnIntro = null;
  }

  private async runBossTurn(): Promise<void> {
    const boss = getBossProfile(this.run.stageIndex);
    this.setStatus(`轮到 ${boss.name} 行动！`);
    await this.playTurnIntro(1);

    // 1. 触发 Boss 主动技能（奶牛跑酷 / 哈基米哈气）
    const skill = applyBossPreTurnSkill(this.state, boss, this.run.bossTurnsTaken);
    if (skill.triggered) {
      this.run.bossShield = this.state.shield ? this.state.shield[1] : 0;
      this.ambientAnims = [];
      this.ambientSpawnTimer = 1.4;
      this.syncVisuals(this.state.board);
      const skillIcon = boss.id === 'cow' ? 'bolt' : 'crown';
      this.showBanner(skill.banner, 1.4, skillIcon);
      this.setStatus(skill.banner, skillIcon);
      if (skill.shieldGained > 0) {
        this.spawnFloatingText(`+${skill.shieldGained} 盾`, 92, '#2563eb', 470);
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
      await this.waitSec(0.5);
    }

    // 2. 按当前棋盘与 Boss 习性实时选择出手交换
    const mult = this.run.calmDefuseActive ? 0.7 : 1;
    const chosenSwap = computeBossIntent(this.state, boss, this.run.bossTurnsTaken, mult).swap;

    if (!chosenSwap) {
      // 极少见兜底：若仍无合法交换，换回玩家
      this.state.player = 0;
      this.refreshPlayerTurnGuides();
      this.busy = false;
      return;
    }

    // 3. Boss 头像蹦跳思考 → 红色准星锁定两格 → 划出爪痕后出手
    this.setStatus(`${boss.name} 思考中...`);
    this.bossThink = 1;
    await this.waitSec(0.5);
    this.bossHighlightSwap = chosenSwap;
    this.setStatus(`${boss.name} 行动中...`);
    const aimDur = 0.62;
    this.bossAim = { a: chosenSwap[0], b: chosenSwap[1], t: 0, dur: aimDur / this.speed };
    await this.waitSec(aimDur);
    this.bossAim = null;
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
      const ct = this.comboTracker;
      ct.age += dt;
      if (ct.pulse > 0) {
        ct.pulse = Math.max(0, ct.pulse - dt * 4.5);
      }
      // 伤害数字滚动累加，每跳一个整数弹一下
      const prevInt = Math.floor(ct.shownDamage + 0.0001);
      const diff = ct.totalDamage - ct.shownDamage;
      if (Math.abs(diff) > 0.001) {
        const step = Math.max(14 * dt, Math.abs(diff) * dt * 9);
        ct.shownDamage = Math.abs(diff) <= step ? ct.totalDamage : ct.shownDamage + Math.sign(diff) * step;
      }
      if (Math.floor(ct.shownDamage + 0.0001) !== prevInt) ct.tickPop = 1;
      const newTier = comboDamageTier(Math.floor(ct.shownDamage + 0.0001));
      if (newTier > ct.tier) ct.burst = 1;
      ct.tier = newTier;
      // 连爆/连锁数增加时印章砸下 + 卡片震动
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

    this.updateDamageFlyers(dt);
    this.updateHpDisplay(dt);

    if (this.turnIntro) this.turnIntro.t += dt;
    if (this.bossAim) this.bossAim.t += dt;
    this.bossThink = Math.max(0, this.bossThink - dt * 1.6);
    const tintTarget = this.state.winner < 0 && this.state.player === 1 && !this.tutorial ? 1 : 0;
    this.turnTint += (tintTarget - this.turnTint) * Math.min(1, dt * 4);
  }

  /** 阵营主题色：你/P1 暖绿，Boss 红，PvP 的 P2 紫 */
  private sideColor(player: 0 | 1): string {
    if (player === 0) return '#3fb877';
    return this.gameMode === 'roguelike' ? '#e53935' : '#8b5cf6';
  }

  /** B. 对手回合时棋盘四周的阵营色暗角 */
  private renderTurnTint(ctx: CanvasRenderingContext2D): void {
    if (this.turnTint < 0.01) return;
    const rgb = this.gameMode === 'roguelike' ? '229, 57, 53' : '139, 92, 246';
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
  private renderBossAim(ctx: CanvasRenderingContext2D): void {
    const aim = this.bossAim;
    if (!aim) return;
    const p = Math.min(1, aim.t / aim.dur);
    const lockP = Math.min(1, p / 0.5);
    const lockE = 1 - Math.pow(1 - lockP, 3);
    const pa = this.cellPoint(aim.a);
    const pb = this.cellPoint(aim.b);
    const red = '#e53935';

    ctx.save();
    ctx.lineCap = 'round';
    for (const c of [pa, pb]) {
      const r = 86 - 38 * lockE;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((1 - lockE) * 1.6);
      ctx.globalAlpha = 0.35 + 0.65 * lockE;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = red;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
        ctx.lineTo(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12));
        ctx.strokeStyle = '#ffffff';
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
        const sx = pa.x + nx * off - (dx / len) * 22;
        const sy = pa.y + ny * off - (dy / len) * 22;
        const ex = sx + (dx + (dx / len) * 44) * e;
        const ey = sy + (dy + (dy / len) * 44) * e;
        const bend = 18 * (1 - Math.abs(k) * 0.3);
        const cx = (sx + ex) / 2 + nx * bend;
        const cy = (sy + ey) / 2 + ny * bend;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.strokeStyle = '#ffffff';
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
  private renderTurnIntro(ctx: CanvasRenderingContext2D): void {
    const ti = this.turnIntro;
    if (!ti) return;
    const p = Math.min(1, ti.t / ti.dur);
    const env = p < 0.18 ? p / 0.18 : p > 0.82 ? (1 - p) / 0.18 : 1;
    const bandX =
      p < 0.24
        ? (1 - easeBackOut(p / 0.24)) * 820
        : p > 0.78
          ? -Math.pow((p - 0.78) / 0.22, 2) * 900
          : 0;
    const textX = bandX * 1.25;
    const isRogue = this.gameMode === 'roguelike';
    const boss = isRogue ? getBossProfile(this.run.stageIndex) : null;
    const color = this.sideColor(ti.player);
    const title =
      ti.player === 0
        ? isRogue
          ? '你的回合'
          : '玩家 1 的回合'
        : boss
          ? `${boss.name}的回合`
          : '玩家 2 的回合';
    const sub =
      ti.player === 0
        ? isRogue
          ? '拖动猫猫，打出连爆！'
          : '轮到你出招'
        : boss
          ? boss.traitShort
          : '轮到你出招';
    const avatar =
      ti.player === 0
        ? this.assets.avatarP1
        : boss
          ? this.assets.bosses[boss.id]
          : this.assets.avatarP2;

    ctx.save();
    // 压暗
    ctx.globalAlpha = env;
    ctx.fillStyle = 'rgba(40, 24, 18, 0.32)';
    ctx.fillRect(-200, -200, VIRTUAL_W + 400, VIRTUAL_H + 400);

    // 斜向色带（白边 + 深棕描边 + 流动速度线）
    const cy = 620;
    const bh = 168;
    const skew = 60;
    const bandPath = (inset: number): void => {
      ctx.beginPath();
      ctx.moveTo(-120 + bandX + skew, cy - bh / 2 - inset);
      ctx.lineTo(VIRTUAL_W + 120 + bandX + skew, cy - bh / 2 - 30 - inset);
      ctx.lineTo(VIRTUAL_W + 120 + bandX - skew, cy + bh / 2 - 30 + inset);
      ctx.lineTo(-120 + bandX - skew, cy + bh / 2 + inset);
      ctx.closePath();
    };
    ctx.globalAlpha = 1;
    bandPath(10);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    bandPath(0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    bandPath(0);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    const off = (ti.t * 420) % 56;
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

    // 头像（轻微弹跳）
    if (avatar.ready) {
      const bounce = Math.sin(ti.t * 14) * 4 * env;
      const size = 150;
      ctx.drawImage(avatar.el, 70 + textX, cy - size / 2 - 22 + bounce, size, size);
    }

    // 大字标题 + 副标题
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 58px ${FONT_FAMILY}`;
    const tx = 236 + textX;
    ctx.save();
    ctx.translate(tx, cy - 22);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 12;
    ctx.strokeText(title, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, 0, 0);
    ctx.restore();
    ctx.font = `800 24px ${FONT_FAMILY}`;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.strokeText(sub, tx + 4, cy + 34);
    ctx.fillStyle = '#fff8e7';
    ctx.fillText(sub, tx + 4, cy + 34);
    ctx.restore();
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

  /** 亮起的猫窝：白色光晕 + 高亮布艺边 + 亮起瞬间轻微弹一下 */
  private drawLitNest(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, lp: number): void {
    const pop = 1 + 0.1 * Math.sin(Math.PI * lp);
    ctx.save();
    ctx.globalAlpha = Math.min(1, lp * 2);
    traceRoundedHexagon(ctx, cx, cy, (HEX_RADIUS + 5) * pop, 13);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * pop, 11);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.6;
    ctx.stroke();
    traceRoundedHexagon(ctx, cx, cy, HEX_RADIUS * 0.8 * pop, 9);
    ctx.fillStyle = '#fff4d6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.36)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 每条连线从远离合成中心的一端依次亮向中心；交叉格取较早顺序，合成中心统一最后亮 */
  private computeMatchOrder(event: RoundEvent): Map<number, number> {
    const order = new Map<number, number>();
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
      const centerCell =
        line.cells.find((c) => centerCells.has(c)) ??
        event.centers.find((ct) => ct.members.some((m) => line.cells.includes(m)))?.cell ??
        line.cells[0];
      const cp = this.cellPoint(centerCell);
      const dists = pts.map(({ c, p }) => ({ c, d: Math.round(Math.hypot(p.x - cp.x, p.y - cp.y) / step) }));
      const maxD = Math.max(0, ...dists.map((x) => x.d));
      for (const { c, d } of dists) {
        const o = maxD - d;
        const prev = order.get(c);
        order.set(c, prev === undefined ? o : Math.min(prev, o));
      }
    }
    let maxO = 0;
    for (const o of order.values()) maxO = Math.max(maxO, o);
    for (const c of centerCells) order.set(c, maxO);
    return order;
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
    let fontSize = btn.round ? 30 : 26;
    ctx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
    if (!btn.round && (!btn.icon || !this.assets.icons[btn.icon]?.ready)) {
      const maxTextW = btn.w - 20;
      while (fontSize > 17 && ctx.measureText(btn.label).width > maxTextW) {
        fontSize -= 1;
        ctx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    if (!btn.icon || !this.drawUiIcon(ctx, btn.icon, cx, cy, Math.min(btn.w, btn.h) * 0.72)) {
      ctx.fillText(btn.label, cx, cy + 1);
    }
    ctx.restore();
  }

  /** 新手教学专用：翠绿轨迹 + 手绘拖动圆点手指动效 */
  private drawTutorialGuide(ctx: CanvasRenderingContext2D, swap: [number, number]): void {
    const a = this.cellPoint(swap[0]);
    const b = this.cellPoint(swap[1]);
    const cycle = (this.elapsed % 1.45) / 1.45;
    const moveT = cycle < 0.72 ? easeCubicInOut(cycle / 0.72) : 1;
    const alpha = cycle < 0.12 ? cycle / 0.12 : cycle > 0.85 ? (1 - cycle) / 0.15 : 1;
    const fx = a.x + (b.x - a.x) * moveT;
    const fy = a.y + (b.y - a.y) * moveT;

    ctx.save();

    // 翠绿发光拖动轨迹线
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 7;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 终点小绿箭头
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = 17;
    const cos = Math.cos(0.55);
    const sin = Math.sin(0.55);
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (ux * cos - uy * sin) * head, b.y - (ux * sin + uy * cos) * head);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (ux * cos + uy * sin) * head, b.y - (-ux * sin + uy * cos) * head);
    ctx.stroke();

    // 动态滑动小手指示器（绿色涟漪 + 手绘奶白圆掌标）
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const ringR = 20 + moveT * 14;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(fx, fy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // 奶白小猫爪手势贴纸
    ctx.fillStyle = 'rgba(78, 52, 46, 0.25)';
    ctx.beginPath();
    ctx.arc(fx, fy + 4, 21, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(fx, fy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 内部小肉垫（一眼亲和可爱）
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(fx, fy + 4, 8, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const toeOffsets: Array<[number, number]> = [
      [-8, -5],
      [0, -8],
      [8, -5],
    ];
    for (const [ox, oy] of toeOffsets) {
      ctx.beginPath();
      ctx.arc(fx + ox, fy + oy, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 手绘贴纸风玩家 / Boss 血条（大字号高可读，支持护盾与肉鸽专属 Boss 贴纸头像） */
  private drawPlayerBar(ctx: CanvasRenderingContext2D, player: 0 | 1, y: number): void {
    const isRogue = this.gameMode === 'roguelike';
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
    // 被伤害猫命中时轻微左右抖动
    if (hit > 0) {
      ctx.translate(Math.sin(this.elapsed * 70) * hit * 5, Math.cos(this.elapsed * 55) * hit * 1.5);
    }

    // 阵营强调：出招方血条外圈呼吸光晕，等待方轻微变暗
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

    // 白色贴纸外轮廓
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, barX - 6, y - 6, barW + 12, barH + 12, radius + 6);
    ctx.fill();

    // 血条底槽
    ctx.fillStyle = '#f5ebe0';
    drawRoundedRect(ctx, barX, y, barW, barH, radius);
    ctx.fill();

    // 血量填充（先画延迟残血，再画当前血量）
    const ratio = Math.max(0, Math.min(1, shownHp / Math.max(1, maxHp)));
    const trailRatio = this.dispHp
      ? Math.max(ratio, Math.min(1, this.trailHp[player] / Math.max(1, maxHp)))
      : ratio;
    if (trailRatio > 0) {
      ctx.save();
      drawRoundedRect(ctx, barX, y, barW, barH, radius);
      ctx.clip();
      if (trailRatio > ratio) {
        ctx.fillStyle = '#ff8a80';
        ctx.fillRect(barX + barW * ratio, y, barW * (trailRatio - ratio), barH);
      }
      ctx.fillStyle =
        player === 0 ? '#bae8cb' : isRogue && boss ? boss.barFillColor : '#d2c2fa';
      ctx.fillRect(barX, y, barW * ratio, barH);
      if (hit > 0) {
        ctx.globalAlpha = hit * 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(barX, y, barW, barH);
      }
      ctx.restore();
    }

    // 深棕粗描边
    ctx.strokeStyle = isTurn || isWinner ? '#d97706' : INK;
    ctx.lineWidth = isTurn || isWinner ? 4.4 : 3.6;
    drawRoundedRect(ctx, barX, y, barW, barH, radius);
    ctx.stroke();

    // 血条大字（少字高对比）
    ctx.fillStyle = INK;
    let label = '';
    if (isRogue && boss) {
      if (player === 1) {
        label = `${boss.name}  ${hpLabel}/${maxHp}`;
      } else {
        const calmTag = this.run.calmDefuseActive ? ' · 减伤' : '';
        label = `你  ${hpLabel}/${maxHp}${calmTag}`;
      }
    } else {
      const suffix = isWinner ? ' · 胜' : isTurn ? ' · 出招' : '';
      label = `P${player + 1}  ${hpLabel}${suffix}`;
    }
    let barFontSize = 28;
    ctx.font = `900 ${barFontSize}px ${FONT_FAMILY}`;
    const maxLabelW = shield > 0 ? barW - 126 : barW - 44;
    while (barFontSize > 20 && ctx.measureText(label).width > maxLabelW) {
      barFontSize -= 1;
      ctx.font = `900 ${barFontSize}px ${FONT_FAMILY}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const centerX = shield > 0 ? barX + (barW - 98) * 0.5 + 8 : barX + barW * 0.5 + 8;
    ctx.fillText(label, centerX, y + barH / 2 + 1);

    // 护盾蓝色胶囊徽章
    if (shield > 0) {
      const sw = 88;
      const sh = 40;
      const sx = barX + barW - sw - 9;
      const sy = y + (barH - sh) / 2;
      ctx.fillStyle = '#dbeafe';
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, sx, sy, sw, sh, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d4ed8';
      ctx.font = `900 22px ${FONT_FAMILY}`;
      this.drawCenteredIconText(ctx, 'shield', `${shield}`, sx + sw / 2, sy + sh / 2 + 1, 26, 5);
    }

    // 左侧趴栏杆萌猫 / Boss 贴纸
    const avatar =
      player === 0
        ? this.assets.avatarP1
        : isRogue && boss
          ? this.assets.bosses[boss.id]
          : this.assets.avatarP2;
    if (avatar.ready) {
      const avSize = 104;
      const think = player === 1 ? this.bossThink : 0;
      if (think > 0) {
        // Boss 思考：头像蹦跳放大 + "…" 气泡
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
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, 100, y - 30, 64, 36, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
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

    // 顶部信息区（教学模式极简大字聚焦；正式模式精简为清爽 2 层）
    if (this.tutorial) {
      const tut = this.tutorial;
      ctx.save();
      // 左侧教学进度胶囊
      ctx.fillStyle = 'rgba(255, 250, 240, 0.96)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.2;
      drawRoundedRect(ctx, 24, 34, 496, 56, 28);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#c2610c';
      ctx.font = `900 28px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`新手教学  ${tut.step + 1}/${tut.totalSteps}`, 48, 63);

      // 3 步进度圆点
      for (let s = 0; s < tut.totalSteps; s++) {
        const dx = 398 + s * 34;
        const dy = 62;
        ctx.beginPath();
        ctx.arc(dx, dy, s === tut.step ? 10 : 7.5, 0, Math.PI * 2);
        ctx.fillStyle =
          s < tut.step ? '#22c55e' : s === tut.step ? '#f59e0b' : '#e2d2bf';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      ctx.restore();

      // 右上角“跳过教学”按钮（随时可跳过）
      this.drawStickerButton(ctx, {
        id: 'skip-tutorial',
        x: 536,
        y: 34,
        w: 160,
        h: 56,
        label: '跳过教学',
        onClick: () => this.finishTutorial(true),
      });

      // 超大号暖金教学任务卡
      ctx.save();
      ctx.fillStyle = 'rgba(78, 52, 46, 0.16)';
      drawRoundedRect(ctx, 24, 112, 672, 76, 28);
      ctx.fill();

      ctx.fillStyle = '#fff8dc';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4;
      drawRoundedRect(ctx, 24, 108, 672, 76, 28);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = `900 30px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawTruncatedText(ctx, this.statusText || tut.prompt, VIRTUAL_W / 2, 147, 636);
      ctx.restore();
    } else {
      // 肉鸽顶部第 1 层：极简关卡 & Boss 特性短标 + 大号 Boss 血条
      if (this.gameMode === 'roguelike') {
        const boss = getBossProfile(this.run.stageIndex);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
        ctx.strokeStyle = 'rgba(78, 52, 46, 0.45)';
        ctx.lineWidth = 2.2;
        drawRoundedRect(ctx, 118, 16, 574, 34, 17);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = boss.accentColor;
        ctx.font = `900 21px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`第 ${boss.stage}/3 关`, 136, 34);

        // 3 关闯关进度圆点紧贴关卡标
        for (let s = 0; s < BOSSES.length; s++) {
          const dx = 250 + s * 22;
          const dy = 33;
          ctx.beginPath();
          ctx.arc(dx, dy, s === this.run.stageIndex ? 7.5 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle =
            s < this.run.stageIndex
              ? '#38b583'
              : s === this.run.stageIndex
                ? boss.accentColor
                : '#dccbb8';
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 右侧极短 Boss 特性词
        ctx.fillStyle = INK_SOFT;
        ctx.font = `800 21px ${FONT_FAMILY}`;
        ctx.textAlign = 'right';
        this.drawTruncatedText(ctx, boss.traitShort, 674, 34, 340);
        ctx.restore();
      }

      // Boss / P2 大号血条 + 右侧圆形音效与 "?" 玩法按钮
      this.drawPlayerBar(ctx, 1, 60);
      this.drawStickerButton(ctx, {
        id: 'sound',
        x: 560,
        y: 60,
        w: 58,
        h: 58,
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
        x: 632,
        y: 60,
        w: 58,
        h: 58,
        label: '?',
        round: true,
        onClick: () => {
          this.showRulesModal = true;
          this.showDebugPanel = false;
          this.showRelicsModal = false;
        },
      });

      // 顶部第 2 层：唯一大号回合状态胶囊（26px 粗体，清爽只报谁行动）
      ctx.save();
      const isBossTurn =
        this.gameMode === 'roguelike' && this.run.phase === 'battle' && this.state.player === 1;
      ctx.fillStyle = isBossTurn ? 'rgba(255, 236, 236, 0.96)' : 'rgba(255, 250, 240, 0.94)';
      ctx.strokeStyle = isBossTurn ? '#e54d42' : 'rgba(78, 52, 46, 0.42)';
      ctx.lineWidth = isBossTurn ? 3.2 : 2.4;
      const pillW = this.stepWaitResolver ? 500 : 672;
      drawRoundedRect(ctx, 24, 134, pillW, 56, 28);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isBossTurn ? '#b91c1c' : INK;
      ctx.font = `800 26px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.statusIcon) {
        this.drawCenteredIconText(ctx, this.statusIcon, this.statusText, 24 + pillW / 2, 163, 30, 8);
      } else {
        this.drawTruncatedText(ctx, this.statusText, 24 + pillW / 2, 163, pillW - 36);
      }
      ctx.restore();

      if (this.stepWaitResolver) {
        this.drawStickerButton(ctx, {
          id: 'next-step',
          x: 538,
          y: 136,
          w: 158,
          h: 52,
          label: '下一轮',
          accent: true,
          onClick: () => {
            const resolve = this.stepWaitResolver;
            this.stepWaitResolver = null;
            resolve?.();
          },
        });
      }
    }

    // 3. 六边形缝线猫窝 + 猫猫层（带震屏）
    ctx.save();
    ctx.translate(this.shakeOffsetX, this.shakeOffsetY);

    // 仅在新手教程中或持有肉鸽道具「猫须雷达」时，激活可合成/引爆猫咪的挥爪招手提示
    const activeHintCells = new Set<number>();
    const activeHighCells = new Set<number>();
    const hintPartner = new Map<number, number>();
    const hintsUnlocked =
      Boolean(this.tutorial) || (this.gameMode === 'roguelike' && hasHintRelic(this.run.relics));
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

    // 仅在 Boss 真正出手交换的瞬间高亮其选中的两格，玩家回合棋盘保持零干扰
    const bossLockedCells = new Set<number>();
    if (this.bossHighlightSwap) {
      bossLockedCells.add(this.bossHighlightSwap[0]);
      bossLockedCells.add(this.bossHighlightSwap[1]);
    }

    const tutorialFocusCells = new Set<number>();
    if (this.tutorial && !this.busy && this.grabbedCell < 0) {
      tutorialFocusCells.add(this.tutorial.guideSwap[0]);
      tutorialFocusCells.add(this.tutorial.guideSwap[1]);
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

      // 匹配确认 → 合成：猫窝按顺序亮起（连线金色，合成中心翠绿）
      if (
        this.currentEvent &&
        (this.activeEventPhase === 'match' || this.activeEventPhase === 'merge') &&
        this.matchOrder.has(cell)
      ) {
        const order = this.matchOrder.get(cell) as number;
        const isCenter = this.currentEvent.centers.some((c) => c.cell === cell);
        const lp =
          this.activeEventPhase === 'merge'
            ? 1
            : Math.max(
                0,
                Math.min(
                  1,
                  ((this.elapsed - this.phaseStart) * this.speed - order * NEST_LIGHT_STEP) / 0.22
                )
              );
        if (lp > 0) this.drawLitNest(ctx, p.x, p.y, isCenter ? NEST_CENTER_RIM : NEST_MATCH_RIM, lp);
      }

      // 教学目标两格：柔和翠绿呼吸光圈，清晰指向玩家操作位
      if (
        this.tutorial &&
        !this.busy &&
        (cell === this.tutorial.guideSwap[0] || cell === this.tutorial.guideSwap[1])
      ) {
        const glowAlpha = 0.28 + 0.2 * Math.sin(this.elapsed * 5.6);
        ctx.save();
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
        ctx.fillStyle = `rgba(74, 222, 128, ${glowAlpha.toFixed(2)})`;
        ctx.fill();
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.restore();
      } else if (activeHighCells.has(cell)) {
        // 猫须雷达高价值可引爆猫的柔和金色呼吸底圈
        const glowAlpha = 0.25 + 0.22 * Math.sin(this.elapsed * 5.2);
        ctx.save();
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS - 3, 10);
        ctx.fillStyle = `rgba(255, 224, 102, ${glowAlpha.toFixed(2)})`;
        ctx.fill();
        ctx.restore();
      }

      // Boss 意图锁定的红虚线警示框（配淡红微光）
      if (bossLockedCells.has(cell)) {
        const pulseW = this.bossHighlightSwap ? 5.8 : 4.0 + Math.sin(this.elapsed * 6) * 0.9;
        ctx.save();
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 2, 12);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fill();
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
      // 匹配/合成阶段由猫窝依次变色表达（见猫窝绘制循环）
      if (this.activeEventPhase === 'wave' && this.activeWaveIndex >= 0) {
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

    // 教学模式下对非目标格叠一层柔和暖色幕布，一眼聚焦教学目标
    if (this.tutorial && tutorialFocusCells.size > 0 && !overlayEvent) {
      ctx.save();
      ctx.fillStyle = 'rgba(62, 40, 32, 0.24)';
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        if (tutorialFocusCells.has(cell)) continue;
        const p = this.cellPoint(cell);
        traceRoundedHexagon(ctx, p.x, p.y, HEX_RADIUS + 1, 11);
        ctx.fill();
      }
      ctx.restore();
    }

    // 新手教学绿色手指拖动指引（仅教学且玩家未拎起猫时显示）
    if (this.tutorial && !this.busy && this.grabbedCell < 0 && !overlayEvent) {
      this.drawTutorialGuide(ctx, this.tutorial.guideSwap);
    }

    // 测试局面推荐交换箭头（仅非教学的实验局面）
    if (
      !this.tutorial &&
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

    this.renderBossAim(ctx);
    ctx.restore(); // 结束棋盘震屏层
    this.renderTurnTint(ctx);

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

    // 底部区域：教学模式极简聚焦，正式模式展示玩家血条、祝福与控制栏
    if (this.tutorial) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 250, 240, 0.94)';
      ctx.strokeStyle = 'rgba(78, 52, 46, 0.36)';
      ctx.lineWidth = 2.6;
      drawRoundedRect(ctx, 48, 1084, 624, 64, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = `800 25px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawTruncatedText(ctx, '按住一只发光猫猫，拖到旁边交换位置', VIRTUAL_W / 2, 1117, 588);
      ctx.restore();
    } else {
      // 底部玩家血条
      this.drawPlayerBar(ctx, 0, 1070);

      // 肉鸽模式下在血条上方展示可点击的已收集祝福贴纸（大字号整齐对齐）
      if (this.gameMode === 'roguelike' && this.run.relics.length > 0) {
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
            },
          });
          ctx.save();
          ctx.fillStyle = 'rgba(78, 52, 46, 0.14)';
          drawRoundedRect(ctx, rx, badgeY + 3, badgeW, badgeH, 24);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 250, 240, 0.96)';
          ctx.strokeStyle = def.badgeColor;
          ctx.lineWidth = 3;
          drawRoundedRect(ctx, rx, badgeY, badgeW, badgeH, 24);
          ctx.fill();
          ctx.stroke();

          const icon = this.assets.relics[def.branch];
          if (icon.ready) {
            ctx.drawImage(icon.el, rx + 7, badgeY + 4, 40, 40);
          }
          ctx.fillStyle = INK;
          ctx.font = `900 22px ${FONT_FAMILY}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          this.drawTruncatedText(ctx, def.name, rx + 52, badgeY + badgeH / 2 + 1, badgeW - 64);
          ctx.restore();
        }
      }

      // 5. 底部精简手绘贴纸控制栏（大按钮大字号）
      const btnY = 1144;
      const btnH = 58;
      if (this.gameMode === 'roguelike') {
        this.drawStickerButton(ctx, {
          id: 'rogue-new',
          x: 24,
          y: btnY,
          w: 326,
          h: btnH,
          label: '重开闯关',
          disabled: this.busy,
          onClick: () =>
            this.startNewRoguelikeRun(
              Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
            ),
        });
        this.drawStickerButton(ctx, {
          id: 'speed',
          x: 370,
          y: btnY,
          w: 326,
          h: btnH,
          label: `速度 ${this.speed}×`,
          accent: this.speed > 1.0,
          onClick: () => {
            this.speed = this.speed === 1.0 ? 2.0 : 1.0;
          },
        });
      } else {
        this.drawStickerButton(ctx, {
          id: 'to-rogue',
          x: 24,
          y: btnY,
          w: 212,
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
          x: 254,
          y: btnY,
          w: 212,
          h: btnH,
          label: '新棋盘',
          disabled: this.busy,
          onClick: () =>
            this.startNewGame(Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)),
        });
        this.drawStickerButton(ctx, {
          id: 'speed',
          x: 484,
          y: btnY,
          w: 212,
          h: btnH,
          label: `速度 ${this.speed}×`,
          accent: this.speed > 1.0,
          onClick: () => {
            this.speed = this.speed === 1.0 ? 2.0 : 1.0;
          },
        });
      }
    }

    // 中央技能 / 拆招横幅（大字醒目）
    if (this.bannerLife > 0 && this.bannerText) {
      const alpha = Math.min(1, this.bannerLife / 0.35, (this.bannerMaxLife - this.bannerLife) / 0.15 + 0.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const bw = 610;
      const bh = 70;
      const bx = (VIRTUAL_W - bw) / 2;
      const by = 516;
      ctx.fillStyle = '#fff9e6';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4.8;
      drawRoundedRect(ctx, bx, by, bw, bh, 35);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = `900 28px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawCenteredIconText(ctx, this.bannerIcon, this.bannerText, VIRTUAL_W / 2, by + bh / 2 + 1, 36, 10);
      ctx.restore();
    }

    // 出手确认后的实时连击伤害战报卡（覆盖顶部状态条，零遮挡棋盘核心）
    if (this.comboTracker && !this.stepWaitResolver) {
      this.renderComboTracker(ctx, this.comboTracker);
    }

    // 飞向血条的伤害猫与命中火花（置于 HUD 之上，弹窗之下）
    this.renderDamageFlyers(ctx);
    this.renderTurnIntro(ctx);

    // 6. 弹窗层（肉鸽 3 选 1 与结算优先于棋盘）
    if (this.showRulesModal) {
      this.renderRulesModal(ctx);
    } else if (this.showRelicsModal) {
      this.renderRelicsModal(ctx);
    } else if (this.showDebugPanel) {
      this.renderDebugPanel(ctx);
    } else if (!this.tutorial && this.gameMode === 'roguelike' && this.run.phase === 'reward') {
      this.renderRewardModal(ctx);
    } else if (
      !this.tutorial &&
      this.gameMode === 'roguelike' &&
      (this.run.phase === 'victory' || this.run.phase === 'defeat')
    ) {
      this.renderRunEndModal(ctx);
    }

    ctx.restore();
  }

  private renderComboTracker(ctx: CanvasRenderingContext2D, ct: ComboTracker): void {
    const exitK = ct.active ? 0 : 1 - Math.max(0, Math.min(1, ct.holdLife / 0.45));
    const enterK = Math.min(1, ct.age / 0.34);
    const alpha = Math.min(1, ct.age / 0.12) * (1 - exitK);
    if (alpha <= 0.01) return;

    const x = 24;
    const y = 114;
    const w = 672;
    const h = 94;
    const accent = ct.isPlayer ? '#e67e22' : '#dc2626';
    const tierColor = COMBO_TIER_COLORS[ct.tier];
    const combo = ct.comboShown;
    const isBlast = ct.blastWaves > 1;
    const stampColor = isBlast
      ? WAVE_COLORS[Math.max(0, Math.min(combo - 1, WAVE_COLORS.length - 1))]
      : '#d97706';

    ctx.save();
    ctx.globalAlpha = alpha;
    // 入场左侧滑入回弹、退场上浮淡出、加伤时抖动 + 轻缩放
    const slideX = (1 - easeBackOut(enterK)) * -120;
    const shakeX = Math.sin(ct.age * 90) * ct.shake * 6;
    const shakeY = Math.cos(ct.age * 70) * ct.shake * 3;
    const cardScale = 1 + 0.035 * Math.sin(ct.pulse * Math.PI);
    ctx.translate(x + w / 2 + slideX + shakeX, y + h / 2 - exitK * 36 + shakeY);
    ctx.scale(cardScale, cardScale);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    // 连爆时外圈呼吸光晕
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

    // 暖棕贴纸投影
    ctx.fillStyle = 'rgba(78, 52, 46, 0.18)';
    drawRoundedRect(ctx, x, y + 4, w, h, 24);
    ctx.fill();

    // 战报卡片主体
    ctx.fillStyle = ct.isPlayer ? 'rgba(255, 251, 240, 0.98)' : 'rgba(255, 242, 242, 0.98)';
    drawRoundedRect(ctx, x, y, w, h, 24);
    ctx.fill();

    // 连爆时背景斜向速度线持续流动
    if (combo >= 2) {
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, 24);
      ctx.clip();
      ctx.globalAlpha = alpha * 0.12;
      ctx.fillStyle = stampColor;
      const gap = 44;
      const off = (ct.age * 160) % gap;
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

    // 出手者
    ctx.fillStyle = INK_SOFT;
    ctx.font = `800 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    this.drawTruncatedText(ctx, ct.actorLabel, x + 22, y + 22, 150);

    // 升档星光
    const numCy = y + 62;
    if (ct.burst > 0) {
      ctx.save();
      ctx.translate(x + 112, numCy);
      ctx.rotate(ct.age * 2.5);
      ctx.globalAlpha = alpha * ct.burst * 0.7;
      ctx.fillStyle = tierColor;
      const R = 40 + 56 * (1 - ct.burst);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.09) * 14, Math.sin(a - 0.09) * 14);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.lineTo(Math.cos(a + 0.09) * 14, Math.sin(a + 0.09) * 14);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 滚动累加的贴纸斜体大数字（白粗描边 + 深棕描边 + 分档色）
    const dmgInt = Math.floor(ct.shownDamage + 0.0001);
    const numText = `${dmgInt}`;
    ctx.save();
    const pop = 1 + 0.2 * ct.tickPop + 0.12 * Math.sin(ct.pulse * Math.PI);
    ctx.translate(x + 22, numCy);
    ctx.rotate(-0.05 * ct.tickPop);
    ctx.scale(pop, pop);
    ctx.transform(1, 0, -0.14, 1, 0, 0);
    const hasIcon = this.drawUiIcon(ctx, 'blast', 18, 0, 36);
    const tx0 = hasIcon ? 42 : 0;
    ctx.font = `900 ${numText.length >= 3 ? 44 : 52}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const numW = ctx.measureText(numText).width;
    let numFill: string | CanvasGradient = tierColor;
    if (ct.tier === 3) {
      const shift = (Math.sin(ct.age * 6) + 1) / 2;
      const g = ctx.createLinearGradient(tx0, -24, tx0 + numW, 24);
      g.addColorStop(0, '#a855f7');
      g.addColorStop(0.3 + 0.4 * shift, '#ec4899');
      g.addColorStop(1, '#f59e0b');
      numFill = g;
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.strokeText(numText, tx0, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.strokeText(numText, tx0, 0);
    ctx.fillStyle = numFill;
    ctx.fillText(numText, tx0, 0);
    ctx.font = `900 26px ${FONT_FAMILY}`;
    const ux = tx0 + numW + 6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.strokeText('伤', ux, 8);
    ctx.fillStyle = INK;
    ctx.fillText('伤', ux, 8);
    ctx.restore();

    // ×N 连爆印章：每次加连爆从 2 倍大旋转砸下
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
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      drawRoundedRect(ctx, -bw / 2 + 4, -bh / 2 + 4, bw - 8, bh - 8, 9);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.font = `900 24px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.fillText(`×${combo}`, 4, 1);
      ctx.font = `900 16px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.fillText(isBlast ? '连爆' : '连锁', 6, 2);
      ctx.restore();
    }

    // 竖向手绘虚线分隔
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.24)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x + 278, y + 14);
    ctx.lineTo(x + 278, y + h - 14);
    ctx.stroke();
    ctx.setLineDash([]);

    // 右栏：最近 2 条明细，新条目从右滑入、旧条目上推
    const recent = ct.logs.slice(-2);
    if (recent.length === 0) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `800 24px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('攻击结算中...', x + 298, y + h / 2);
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
        ctx.fillStyle = isLatest ? INK : INK_SOFT;
        ctx.font = `${isLatest ? '900' : '700'} 22px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        this.drawTruncatedText(ctx, entry.label, x + 298 + ox, ry, 256);

        ctx.translate(x + w - 22 + ox, ry);
        const dPop = isLatest ? 1 + 0.5 * slide : 1;
        ctx.scale(dPop, dPop);
        ctx.font = `900 ${isLatest ? 24 : 22}px ${FONT_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.strokeText(entry.deltaText, 0, 0);
        ctx.fillStyle = entry.color;
        ctx.fillText(entry.deltaText, 0, 0);
        ctx.restore();
      });
    }

    // 回合结束：高光从左到右扫过卡片定格
    if (ct.sweep >= 0 && ct.sweep < 1) {
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, 24);
      ctx.clip();
      const bx = x - 120 + (w + 240) * easeCubicInOut(ct.sweep);
      const g = ctx.createLinearGradient(bx - 70, 0, bx + 70, 0);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
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
  private drawModalBackdrop(
    ctx: CanvasRenderingContext2D,
    fillStyle = 'rgba(62, 40, 32, 0.36)'
  ): void {
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
  private wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
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
  private drawTruncatedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number
  ): void {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    ctx.fillText(`${out}…`, x, y);
  }

  private renderRewardModal(ctx: CanvasRenderingContext2D): void {
    this.drawModalBackdrop(ctx, 'rgba(62, 40, 32, 0.38)');

    const clearedBoss = getBossProfile(this.run.stageIndex);
    const nextBoss = getBossProfile(this.run.stageIndex + 1);

    const w = 676;
    const x = (VIRTUAL_W - w) / 2;
    const cardW = 628;
    const cardX = x + (w - cardW) / 2;
    const baseCardH = 186;
    const gap = 18;

    // 预计算每张卡片展开后的动态高度，确保整体垂直居中不越界
    ctx.save();
    ctx.font = `700 21px ${FONT_FAMILY}`;
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
        height: baseCardH + detailH,
      };
    });
    ctx.restore();

    const headerH = 230;
    const cardsTotalH =
      cardSpecs.reduce((sum, item) => sum + item.height, 0) +
      Math.max(0, cardSpecs.length - 1) * gap;
    const h = headerH + cardsTotalH + 28;
    const y = Math.max(30, Math.round((VIRTUAL_H - h) / 2));

    // 外框柔和投影
    ctx.save();
    ctx.fillStyle = 'rgba(78, 52, 46, 0.24)';
    drawRoundedRect(ctx, x, y + 8, w, h, 32);
    ctx.fill();

    // 面板奶油底
    ctx.fillStyle = '#fff9ee';
    drawRoundedRect(ctx, x, y, w, h, 32);
    ctx.fill();

    // 顶部暖杏色手绘顶栏底纹
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, 32);
    ctx.clip();
    ctx.fillStyle = '#ffefc8';
    ctx.fillRect(x, y, w, 132);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.24)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 132);
    ctx.lineTo(x + w - 24, y + 132);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 面板深棕粗描边
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    drawRoundedRect(ctx, x, y, w, h, 32);
    ctx.stroke();

    // 主标题（38px 超醒目）
    ctx.fillStyle = '#c2610c';
    ctx.font = `900 38px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawCenteredIconText(
      ctx,
      'trophy',
      `击败 ${clearedBoss.name}！`,
      VIRTUAL_W / 2,
      y + 48,
      44,
      10
    );

    // 精简大字副标（24px）
    ctx.fillStyle = INK_SOFT;
    ctx.font = `800 24px ${FONT_FAMILY}`;
    ctx.fillText(
      `回 +${STAGE_CLEAR_HEAL} 血 · 选 1 个祝福`,
      VIRTUAL_W / 2,
      y + 100
    );

    // 下一关对手预告胶囊（含 Boss 小头像，字号放大）
    const previewX = cardX;
    const previewY = y + 146;
    const previewW = cardW;
    const previewH = 68;
    ctx.fillStyle = '#fffdf7';
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
    ctx.font = `900 23px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `第 ${nextBoss.stage} 关 · ${nextBoss.name}`,
      previewX + 76,
      previewY + 23
    );
    ctx.fillStyle = INK_SOFT;
    ctx.font = `800 20px ${FONT_FAMILY}`;
    this.drawTruncatedText(ctx, nextBoss.traitShort, previewX + 76, previewY + 50, previewW - 92);

    // 3 张肉鸽祝福手绘贴纸卡
    const branchBgMap: Record<string, string> = {
      blast: '#fff0f0',
      merge: '#fff8db',
      collapse: '#e8fbf2',
    };

    let cy = y + headerH;
    for (const spec of cardSpecs) {
      const { relicId, def, isExpanded, detailLines, detailH, height: cardH } = spec;

      // 先注册整张卡牌选择按钮
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
      drawRoundedRect(ctx, cardX, cy + 5, cardW, cardH, 24);
      ctx.fill();

      // 卡片白底
      ctx.fillStyle = '#ffffff';
      drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
      ctx.fill();

      // 左侧流派饰条（裁切在卡片圆角内）
      ctx.save();
      drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
      ctx.clip();
      ctx.fillStyle = def.badgeColor;
      ctx.fillRect(cardX, cy, 12, cardH);
      ctx.restore();

      // 卡片流派主题色粗描边
      ctx.strokeStyle = def.badgeColor;
      ctx.lineWidth = 3.8;
      drawRoundedRect(ctx, cardX, cy, cardW, cardH, 24);
      ctx.stroke();

      // 左侧圆形底座 + 流派手绘贴纸图标
      const iconCx = cardX + 72;
      const iconCy = cy + 93;
      ctx.fillStyle = branchBgMap[def.branch] ?? '#fff4e6';
      ctx.beginPath();
      ctx.arc(iconCx, iconCy, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(78, 52, 46, 0.14)';
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

      // 第一行：类型胶囊（20px）+ 祝福名（32px 超大）+ 右上角 ? 按钮
      const roleX = cardX + 134;
      const roleY = cy + 24;
      const roleW = 76;
      const roleH = 36;
      ctx.fillStyle = def.roleColor;
      drawRoundedRect(ctx, roleX, roleY, roleW, roleH, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 20px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.roleLabel, roleX + roleW / 2, roleY + roleH / 2 + 1);

      ctx.fillStyle = INK;
      ctx.font = `900 32px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      this.drawTruncatedText(ctx, def.name, roleX + roleW + 12, roleY + roleH / 2 + 1, cardW - 300);

      // 第二行：极简一句话核心效果（26px 大字一眼扫清）
      ctx.fillStyle = INK;
      ctx.font = `800 26px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      this.drawTruncatedText(ctx, def.shortDesc, roleX, cy + 98, cardW - 154);

      // 第三行：左侧流派标 + 右侧手绘「选择」大胶囊
      ctx.fillStyle = '#f5ece0';
      drawRoundedRect(ctx, roleX, cy + 132, 92, 34, 17);
      ctx.fill();
      ctx.fillStyle = INK_SOFT;
      ctx.font = `800 18px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.branchLabel, roleX + 46, cy + 150);

      const pickW = 136;
      const pickH = 38;
      const pickX = cardX + cardW - pickW - 18;
      const pickY = cy + 130;
      ctx.fillStyle = branchBgMap[def.branch] ?? '#fff4e6';
      ctx.strokeStyle = def.badgeColor;
      ctx.lineWidth = 2.6;
      drawRoundedRect(ctx, pickX, pickY, pickW, pickH, 19);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `900 21px ${FONT_FAMILY}`;
      ctx.fillText('选择祝福', pickX + pickW / 2, pickY + pickH / 2 + 1);

      // 展开状态：内嵌暖米色详情抽屉（完整 detailDesc 自动换行）
      if (isExpanded && detailH > 0) {
        const boxX = cardX + 24;
        const boxY = cy + baseCardH - 4;
        const boxW = cardW - 44;
        const boxH = detailH - 12;
        ctx.fillStyle = '#fdf4e3';
        ctx.strokeStyle = 'rgba(78, 52, 46, 0.2)';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = INK_SOFT;
        ctx.font = `700 21px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        detailLines.forEach((line, li) => {
          ctx.fillText(line, boxX + 16, boxY + 24 + li * 30);
        });
      }

      // 后注册右上角 ? 详情开关（按钮列表倒序命中，保证点 ? 不误选祝福）
      const infoSize = 46;
      const infoX = cardX + cardW - infoSize - 16;
      const infoY = cy + 18;
      this.buttons.push({
        id: `reward-info-${relicId}`,
        x: infoX - 4,
        y: infoY - 4,
        w: infoSize + 8,
        h: infoSize + 8,
        label: isExpanded ? '收起详情' : '查看详情',
        onClick: () => {
          this.expandedRewardRelicId = isExpanded ? null : relicId;
        },
      });

      ctx.fillStyle = isExpanded ? '#ffe49e' : '#f7efe3';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(infoX + infoSize / 2, infoY + infoSize / 2, infoSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = `900 ${isExpanded ? 26 : 24}px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isExpanded ? '×' : '?', infoX + infoSize / 2, infoY + infoSize / 2 + 1);

      ctx.restore();
      cy += cardH + gap;
    }

    ctx.restore();
  }

  private renderRelicsModal(ctx: CanvasRenderingContext2D): void {
    this.drawModalBackdrop(ctx, 'rgba(62, 40, 32, 0.36)');

    const x = 32;
    const y = 188;
    const w = 656;
    const h = 760;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    drawRoundedRect(ctx, x, y, w, h, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 30px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`已收集的祝福 (${this.run.relics.length})`, x + 28, y + 58);

    if (this.run.relics.length === 0) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `700 22px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('尚未获得祝福，击败 Boss 后即可 3 选 1！', VIRTUAL_W / 2, y + 340);
    } else {
      let cy = y + 92;
      for (const id of this.run.relics) {
        const def = getRelicDef(id);
        ctx.save();
        ctx.font = `600 18px ${FONT_FAMILY}`;
        const detailLines = this.wrapTextLines(ctx, def.detailDesc, w - 188);
        const cardH = Math.max(146, 94 + detailLines.length * 26);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = def.badgeColor;
        ctx.lineWidth = 3.2;
        drawRoundedRect(ctx, x + 22, cy, w - 44, cardH, 20);
        ctx.fill();
        ctx.stroke();

        const icon = this.assets.relics[def.branch];
        if (icon.ready) {
          ctx.drawImage(icon.el, x + 36, cy + Math.round((cardH - 84) / 2), 84, 84);
        }

        // 类型总结胶囊
        ctx.fillStyle = def.roleColor;
        drawRoundedRect(ctx, x + 134, cy + 20, 68, 30, 15);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 16px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.roleLabel, x + 168, cy + 36);

        // 标题 + 流派
        ctx.fillStyle = INK;
        ctx.font = `900 24px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.fillText(def.name, x + 212, cy + 36);

        ctx.fillStyle = INK_SOFT;
        ctx.font = `700 16px ${FONT_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.fillText(def.branchLabel, x + w - 40, cy + 36);

        // 精简总结 + 完整自动换行说明
        ctx.fillStyle = INK;
        ctx.font = `800 19px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        this.drawTruncatedText(ctx, def.shortDesc, x + 134, cy + 72, w - 180);

        ctx.fillStyle = INK_SOFT;
        ctx.font = `600 18px ${FONT_FAMILY}`;
        detailLines.forEach((line, idx) => {
          ctx.fillText(line, x + 134, cy + 104 + idx * 26);
        });

        ctx.restore();
        cy += cardH + 16;
      }
    }

    this.drawStickerButton(ctx, {
      id: 'close-relics',
      x: VIRTUAL_W / 2 - 110,
      y: y + h - 78,
      w: 220,
      h: 54,
      label: '关闭',
      accent: true,
      onClick: () => {
        this.showRelicsModal = false;
      },
    });
  }

  private renderRunEndModal(ctx: CanvasRenderingContext2D): void {
    const isWin = this.run.phase === 'victory';
    this.drawModalBackdrop(ctx, 'rgba(62, 40, 32, 0.38)');

    const x = 44;
    const y = 236;
    const w = 632;
    const h = 668;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = isWin ? '#d97706' : '#dc2626';
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, x, y, w, h, 30);
    ctx.fill();
    ctx.stroke();

    const boss = getBossProfile(this.run.stageIndex);
    const avatar = isWin ? this.assets.avatarP1 : this.assets.bosses[boss.id];
    if (avatar.ready) {
      ctx.drawImage(avatar.el, VIRTUAL_W / 2 - 70, y + 26, 140, 140);
    }

    ctx.fillStyle = isWin ? '#b45309' : '#b91c1c';
    ctx.font = `900 34px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this.drawCenteredIconText(
      ctx,
      isWin ? 'trophy' : 'paw',
      isWin ? '猫屋大捷 · 全通关！' : '被猫猫挠趴啦',
      VIRTUAL_W / 2,
      y + 206,
      42,
      10
    );

    ctx.fillStyle = INK_SOFT;
    ctx.font = `700 21px ${FONT_FAMILY}`;
    ctx.fillText(
      isWin
        ? '你击败了大橘、奶牛猫与终极猫王哈基米！'
        : `止步于第 ${boss.stage} 关 · ${boss.name}`,
      VIRTUAL_W / 2,
      y + 258
    );

    // 战绩摘要盒
    ctx.fillStyle = '#f7ebd9';
    ctx.strokeStyle = 'rgba(78, 52, 46, 0.25)';
    ctx.lineWidth = 2.4;
    drawRoundedRect(ctx, x + 32, y + 292, w - 64, 214, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `800 22px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(`• 总出招回合：${this.run.totalTurns} 回合`, x + 56, y + 340);
    ctx.fillText(`• 单回合最高爆发：${this.run.bestTurnDamage} 伤害`, x + 56, y + 386);
    const relicNames =
      this.run.relics.length > 0
        ? this.run.relics.map((id) => getRelicDef(id).name).join(' / ')
        : '无';
    this.drawTruncatedText(ctx, `• 收集祝福：${relicNames}`, x + 56, y + 432, w - 112);
    ctx.fillText(`• 剩余生命：${this.run.playerHp} / ${this.run.playerMaxHp}`, x + 56, y + 478);

    this.drawStickerButton(ctx, {
      id: 'run-again',
      x: VIRTUAL_W / 2 - 130,
      y: y + h - 98,
      w: 260,
      h: 60,
      label: isWin ? '再来一局' : '重新挑战',
      accent: true,
      onClick: () =>
        this.startNewRoguelikeRun(
          Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999)
        ),
    });
  }

  private renderRulesModal(ctx: CanvasRenderingContext2D): void {
    this.drawModalBackdrop(ctx, 'rgba(62, 40, 32, 0.36)');

    const x = 28;
    const y = 176;
    const w = 664;
    const h = 768;

    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    drawRoundedRect(ctx, x, y, w, h, 30);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 36px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('怎么玩 · 30 秒看懂', x + 32, y + 66);

    const tips: Array<{ tag: string; color: string; desc: string }> = [
      {
        tag: '1. 合大猫',
        color: '#d97706',
        desc: '拖动相邻猫凑 3 连合成 2 级大猫；4 连合 2 只，5 连合炫彩猫！',
      },
      {
        tag: '2. 爽连爆',
        color: '#e54d42',
        desc: '用大猫凑 3 连会炸一圈 + 喷宽光束，波及别的大猫还会连锁爆！',
      },
      {
        tag: '3. 选祝福',
        color: '#2563eb',
        desc: '与 Boss 轮流行动，过关回血并 3 选 1 祝福；抽到「猫须雷达」解锁挥爪提示。',
      },
    ];

    let cy = y + 116;
    for (const tip of tips) {
      ctx.fillStyle = tip.color;
      ctx.font = `900 26px ${FONT_FAMILY}`;
      ctx.fillText(tip.tag, x + 32, cy);
      cy += 38;

      ctx.fillStyle = INK;
      ctx.font = `700 24px ${FONT_FAMILY}`;
      const wrapped = this.wrapTextLines(ctx, tip.desc, w - 68);
      for (const line of wrapped) {
        ctx.fillText(line, x + 32, cy);
        cy += 36;
      }
      cy += 22;
    }

    // 底部三按钮：重玩教学 / 切换双人 / 知道了
    const btnY = y + h - 86;
    const btnH = 58;
    this.drawStickerButton(ctx, {
      id: 'replay-tutorial',
      x: x + 28,
      y: btnY,
      w: 186,
      h: btnH,
      label: '重玩教学',
      disabled: this.busy,
      onClick: () => {
        this.showRulesModal = false;
        this.startTutorial();
      },
    });

    const modeLabel = this.gameMode === 'roguelike' ? '双人模式' : '肉鸽闯关';
    this.drawStickerButton(ctx, {
      id: 'switch-mode-in-rules',
      x: x + 234,
      y: btnY,
      w: 186,
      h: btnH,
      label: modeLabel,
      disabled: this.busy,
      onClick: () => {
        this.showRulesModal = false;
        const seed = Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 999);
        if (this.gameMode === 'roguelike') {
          this.startNewGame(seed);
        } else {
          this.startNewRoguelikeRun(seed);
        }
      },
    });

    this.drawStickerButton(ctx, {
      id: 'close-rules',
      x: x + 440,
      y: btnY,
      w: 196,
      h: btnH,
      label: '知道了',
      accent: true,
      onClick: () => {
        this.showRulesModal = false;
      },
    });
  }

  private renderDebugPanel(ctx: CanvasRenderingContext2D): void {
    this.drawModalBackdrop(ctx, 'rgba(62, 40, 32, 0.36)');

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
    ctx.font = `900 26px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('实验台 · 核心测试局面（完整 17 局面见 lab.html）', x + 28, y + 50);

    ctx.fillStyle = INK_SOFT;
    ctx.font = `600 18px ${FONT_FAMILY}`;
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
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(
      `种子：${this.state.seed}   ·   回合：${this.state.turn}   ·   合法交换：${this.legalCount}`,
      x + 44,
      statY + 36
    );
    if (this.lastSummary) {
      ctx.fillStyle = INK_SOFT;
      ctx.font = `600 17px ${FONT_FAMILY}`;
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
      ctx.font = `600 17px ${FONT_FAMILY}`;
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
