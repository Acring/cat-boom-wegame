import { SeededRng } from './rng';

export const SIZE = 7;
export const CELL_COUNT = SIZE * SIZE;
export const COLORS = 5;
export const HP = 100;
export const AXES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // 竖
  [1, 0], // 右下
  [1, -1], // 右上
];
// 六边形顺时针 6 方向（用于计算宽光束的左右前翼）
export const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // 0: 正上
  [1, -1], // 1: 右上
  [1, 0], // 2: 右下
  [0, 1], // 3: 正下
  [-1, 1], // 4: 左下
  [-1, 0], // 5: 左上
];
export const MAX_ROUNDS = 100;
export const SMALL_DAMAGE = 1;
export const BIG_DAMAGE = 3;
export const RAINBOW_DAMAGE = 5;
export const MAX_RADIUS = 4;
export const COMBO_STEP = 2;
export const MAX_COMBO_BONUS = 6;
export const WAVE_CHAIN_BONUS = 0; // 二次引爆每波额外加伤（默认 0，可在实验室体验后调整）

export type CatLevel = 1 | 2 | 3;

export interface CatData {
  id: number;
  color: number;
  level: CatLevel;
}

export type Board = Array<CatData | null>;

export interface MatchLine {
  axis: number;
  cells: number[];
}

export interface MatchGroup {
  lines: number[];
  cells: number[];
}

export interface MergeCenter {
  cell: number;
  members: number[];
  survives: boolean;
  resultLevel: 2 | 3;
}

export interface MoveRecord {
  from: number;
  to: number;
  id: number;
}

export interface SpawnRecord {
  cell: number;
  cat: CatData;
  edge: boolean;
}

export interface BlastWave {
  wave: number;
  kind: 'beam' | 'ring' | 'rainbow';
  sources: number[];
  rays: number[][];
  cells: number[];
  affected: number[];
  damage: number;
}

export interface RuleModifiers {
  beamRadiusBonus?: number;
  mergeDamageMultiplier?: number;
  waveChainBonus?: number;
  comboStepMultiplier?: number;
  collapseMoveDamage?: number;
  aftershockPerWave?: number;
  damageMultiplier?: number;
}

export interface RoundEvent {
  number: number;
  before: Board;
  lines: MatchLine[];
  centers: MergeCenter[];
  rays: number[][];
  waves: BlastWave[];
  cleared: number[];
  moves: MoveRecord[];
  spawn: SpawnRecord[];
  baseDamage: number;
  bonus: number;
  trueDamage: number;
  shieldBlocked: number;
  damage: number;
  edgeHoles: number[];
  afterClear: Board;
  hp: [number, number];
  shield: [number, number];
  afterCollapse: Board;
  deterministicMatches: MatchLine[];
  after: Board;
  refillMatches: MatchLine[];
}

export interface GameState {
  seed: number;
  rngState: number;
  nextId: number;
  board: Board;
  hp: [number, number];
  maxHp?: [number, number];
  shield?: [number, number];
  player: 0 | 1;
  turn: number;
  winner: -1 | 0 | 1;
  ruleVersion: 3;
  fixture?: number;
  suggested?: [number, number];
}

export interface PreviewResult {
  valid: boolean;
  event?: RoundEvent;
}

export interface ResolveResult {
  valid: boolean;
  state: GameState;
  swapped: Board;
  events: RoundEvent[];
  notice: string;
}

export function cloneCat(cat: CatData | null): CatData | null {
  return cat ? { id: cat.id, color: cat.color, level: cat.level } : null;
}

export function cloneBoard(board: Board): Board {
  return board.map(cloneCat);
}

export function cloneState(state: GameState): GameState {
  const copy: GameState = {
    seed: state.seed,
    rngState: state.rngState,
    nextId: state.nextId,
    board: cloneBoard(state.board),
    hp: [state.hp[0], state.hp[1]],
    player: state.player,
    turn: state.turn,
    winner: state.winner,
    ruleVersion: state.ruleVersion,
  };
  if (state.maxHp) copy.maxHp = [state.maxHp[0], state.maxHp[1]];
  if (state.shield) copy.shield = [state.shield[0], state.shield[1]];
  if (state.fixture !== undefined) copy.fixture = state.fixture;
  if (state.suggested) copy.suggested = [state.suggested[0], state.suggested[1]];
  return copy;
}

export function coord(i: number): [number, number] {
  const c = Math.floor(i / SIZE);
  return [c, (i % SIZE) - Math.floor(c / 2)];
}

export function index(q: number, r: number): number {
  const row = r + Math.floor(q / 2);
  if (q < 0 || q >= SIZE || row < 0 || row >= SIZE) {
    return -1;
  }
  return q * SIZE + row;
}

export function position(i: number): { x: number; y: number } {
  const c = Math.floor(i / SIZE);
  return {
    x: c * 1.5,
    y: ((i % SIZE) + (c % 2) * 0.5) * Math.sqrt(3),
  };
}

export function before(a: number, b: number): boolean {
  const pa = position(a);
  const pb = position(b);
  if (Math.abs(pa.y - pb.y) < 1e-6) {
    return pa.x < pb.x;
  }
  return pa.y < pb.y;
}

export function neighbors(i: number): number[] {
  const [q, r] = coord(i);
  const result: number[] = [];
  for (const [aq, ar] of AXES) {
    for (const sign of [-1, 1] as const) {
      const j = index(q + aq * sign, r + ar * sign);
      if (j >= 0) result.push(j);
    }
  }
  return result;
}

function matchesColor(cat: CatData | null, color: number): boolean {
  return cat !== null && (cat.color === color || cat.level === 3);
}

export function matches(board: Board): MatchLine[] {
  const result: MatchLine[] = [];
  const seen = new Set<string>();
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
        const cells: number[] = [];
        let hasNormal = false;
        let j = i;
        while (j >= 0 && matchesColor(board[j], color)) {
          if (board[j]!.level !== 3) hasNormal = true;
          cells.push(j);
          const [jq, jr] = coord(j);
          j = index(jq + aq, jr + ar);
        }
        if (cells.length >= 3 && (hasNormal || color === 0)) {
          const key = `${axisId}:${cells.join(',')}`;
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

export function middle(cells: number[]): number {
  if (cells.length % 2 === 1) {
    return cells[Math.floor(cells.length / 2)];
  }
  const a = cells[cells.length / 2 - 1];
  const b = cells[cells.length / 2];
  return before(a, b) ? a : b;
}

export function groups(lines: MatchLine[]): MatchGroup[] {
  const output: MatchGroup[] = [];
  for (let k = 0; k < lines.length; k++) {
    const connected: MatchGroup[] = [];
    for (const g of output) {
      if (lines[k].cells.some((cell) => g.cells.includes(cell))) {
        connected.push(g);
      }
    }
    const group: MatchGroup = {
      lines: [k],
      cells: [...lines[k].cells],
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

function newCat(state: GameState, color: number, level: CatLevel = 1): CatData {
  const cat: CatData = { id: state.nextId, color, level };
  state.nextId += 1;
  return cat;
}

function generate(state: GameState, rng: SeededRng): void {
  for (let attempt = 0; attempt < 500; attempt++) {
    state.board = new Array<CatData | null>(CELL_COUNT).fill(null);
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
        state.board[i] = newCat(state, state.board[i]!.color, 1);
      }
      return;
    }
  }
  throw new Error('Could not generate a playable board');
}

export function newGame(seedValue: number): GameState {
  const rng = new SeededRng(seedValue);
  const state: GameState = {
    seed: seedValue,
    rngState: rng.getState(),
    nextId: 1,
    board: [],
    hp: [HP, HP],
    player: 0,
    turn: 1,
    winner: -1,
    ruleVersion: 3,
  };
  generate(state, rng);
  state.rngState = rng.getState();
  return state;
}

export function validSwap(state: GameState, a: number, b: number): boolean {
  if (
    state.winner >= 0 ||
    a < 0 ||
    b < 0 ||
    a >= CELL_COUNT ||
    b >= CELL_COUNT ||
    !neighbors(a).includes(b)
  ) {
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

export function findLegalSwaps(state: GameState): Array<[number, number]> {
  const output: Array<[number, number]> = [];
  for (let a = 0; a < state.board.length; a++) {
    for (const b of neighbors(a)) {
      if (b > a && validSwap(state, a, b)) {
        output.push([a, b]);
      }
    }
  }
  return output;
}

function compactSegment(
  state: GameState,
  cells: number[],
  li: number,
  owners: Map<number, number>,
  event: RoundEvent
): void {
  const cats: Array<{ from: number; cat: CatData }> = [];
  for (const cell of cells) {
    if (state.board[cell]) {
      cats.push({ from: cell, cat: state.board[cell]! });
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

/** 计算从 cell 沿方向 (dq, dr) 发射的 3 格宽光束（起爆点周围 1 圈 + 中心射线及每步左右前翼） */
export function castWideBeam(
  cell: number,
  dq: number,
  dr: number,
  radius: number
): { path: number[]; cells: number[] } {
  const dirIdx = HEX_DIRS.findIndex(([x, y]) => x === dq && y === dr);
  const [lq, lr] = dirIdx >= 0 ? HEX_DIRS[(dirIdx + 5) % 6] : [0, 0];
  const [rq, rr] = dirIdx >= 0 ? HEX_DIRS[(dirIdx + 1) % 6] : [0, 0];

  const path = [cell];
  const covered = new Set<number>([cell, ...neighbors(cell)]);
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

/** 单轮确定性结算（不调用 RNG，补猫在 refill 阶段完成） */
export function roundStep(
  state: GameState,
  number: number,
  modifiers?: RuleModifiers
): RoundEvent {
  const original = cloneBoard(state.board);
  const lines = matches(original);
  const comboMul = modifiers?.comboStepMultiplier ?? 1;
  const beamBonus = modifiers?.beamRadiusBonus ?? 0;
  const maxRadius = MAX_RADIUS + beamBonus;
  const mergeMul = modifiers?.mergeDamageMultiplier ?? 1;
  const chainBonus = modifiers?.waveChainBonus ?? WAVE_CHAIN_BONUS;
  const curShield: [number, number] = state.shield ? [state.shield[0], state.shield[1]] : [0, 0];

  const event: RoundEvent = {
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
    refillMatches: [],
  };

  const catDamage = (cat: CatData | null | undefined): number => {
    if (!cat) return 0;
    if (cat.level === 3) return RAINBOW_DAMAGE;
    if (cat.level === 2) return BIG_DAMAGE;
    return SMALL_DAMAGE;
  };

  const blast = new Set<number>();
  const detonated = new Set<number>();
  const owners = new Map<number, number>();
  const targets = new Map<number, number>();
  const anchors = new Set<number>();

  const wave0Sources = new Set<number>();
  const wave0Affected = new Set<number>();
  const wave0Rays: number[][] = [];
  let wave0HasRainbow = false;

  for (const group of groups(lines)) {
    const allLevel1 = group.cells.every((cell) => original[cell]?.level === 1);
    const allLevel2 = group.cells.every((cell) => original[cell]?.level === 2);
    const explosive = !allLevel1 && !allLevel2;
    if (explosive) {
      const rainbowFired = new Set<number>();
      for (const cell of group.cells) {
        wave0Affected.add(cell);
        const lv = original[cell]?.level ?? 1;
        if (lv >= 2) {
          wave0Sources.add(cell);
          detonated.add(cell);
        }
        // 3 级炫彩猫：向六边形全部 6 个方向发射宽光束
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
        const specials = line.cells.filter((cell) => (original[cell]?.level ?? 1) >= 2);
        const radius = Math.min(specials.length + 1 + beamBonus, maxRadius);
        const [aq, ar] = AXES[line.axis];
        for (const cell of specials) {
          // 炫彩猫已经向全 6 方向发射，这里只处理 2 级大猫
          if (original[cell]?.level !== 2) continue;
          const at = line.cells.indexOf(cell);
          for (const direction of [-1, 1] as const) {
            if (
              (direction === -1 && at === 0) ||
              (direction === 1 && at === line.cells.length - 1)
            ) {
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
        // 纯 1 星直线 4 连合成：保留该 4 连直线中央 2 格升级为 2 只 2 级大猫
        const line4Idx = group.lines.find((li) => lines[li].cells.length === 4)!;
        const ordered = [...lines[line4Idx].cells];
        const c1 = ordered[1];
        const c2 = ordered[2];
        const centerSet = new Set([c1, c2]);
        anchors.add(c1);
        anchors.add(c2);
        const extraMembers = group.cells.filter((c) => !ordered.includes(c));
        event.centers.push({
          cell: c1,
          members: [ordered[0], c1, ...extraMembers],
          survives: true,
          resultLevel: 2,
        });
        event.centers.push({
          cell: c2,
          members: [c2, ordered[3]],
          survives: true,
          resultLevel: 2,
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
        // 全 2 星三连及以上 -> 1 只炫彩猫(3级)；纯 1 星直线 >= 5 连 -> 1 只炫彩猫(3级)；其余 -> 1 只大猫(2级)
        const resultLevel: 2 | 3 = allLevel2 || maxLineLen >= 5 ? 3 : 2;
        let center = middle(lines[group.lines[0]].cells);
        if (group.lines.length > 1) {
          const counts = new Map<number, number>();
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
          resultLevel,
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

  // 逐波结算：Wave 0（宽光束/炫彩6向）→ Wave 1+（被波及的无关大猫炸周围1圈 / 炫彩猫炸6向宽光束）
  if (wave0Affected.size > 0) {
    const wave0Cells: number[] = [];
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
      kind: wave0HasRainbow ? 'rainbow' : 'beam',
      sources: Array.from(wave0Sources).sort((a, b) => a - b),
      rays: wave0Rays,
      cells: wave0Cells,
      affected: Array.from(wave0Affected),
      damage: wave0Dmg,
    });

    let frontier = wave0Cells;
    let waveIdx = 1;
    while (frontier.length > 0) {
      const nextSources = frontier
        .filter((cell) => (original[cell]?.level ?? 1) >= 2 && !detonated.has(cell))
        .sort((a, b) => a - b);
      if (nextSources.length === 0) break;

      const waveAffected = new Set<number>();
      const waveRays: number[][] = [];
      let waveHasRainbow = false;
      for (const src of nextSources) {
        detonated.add(src);
        waveAffected.add(src);
        if (original[src]?.level === 3) {
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

      const newCells: number[] = [];
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
        kind: waveHasRainbow ? 'rainbow' : 'ring',
        sources: nextSources,
        rays: waveRays,
        cells: newCells,
        affected: Array.from(waveAffected),
        damage: waveDmg,
      });

      frontier = newCells;
      waveIdx += 1;
    }
  }

  // 爆发覆盖独立纯合成时，爆发优先（包括覆盖中心）
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
      const orig = original[center.cell]!;
      state.board[center.cell] = { id: orig.id, color: orig.color, level: center.resultLevel };
    }
  }

  event.bonus += Math.max(0, event.waves.length - 1) * chainBonus;
  const dmgScale = modifiers?.damageMultiplier ?? 1;
  const normalDamage = Math.max(0, Math.round((event.baseDamage + event.bonus) * dmgScale));
  const trueDamage = (modifiers?.aftershockPerWave ?? 0) * event.waves.length;
  event.trueDamage = trueDamage;
  event.damage = normalDamage + trueDamage;

  const defender = 1 - state.player;
  const applyDamage = (norm: number, tr: number) => {
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

  // 按竖、右下、右上及扫描顺序收缩；新大猫与他线/爆发空位为屏障
  for (let li = 0; li < lines.length; li++) {
    if (!targets.has(li)) continue;
    const target = targets.get(li)!;
    const [tq, tr] = coord(target);
    const [aq, ar] = AXES[lines[li].axis];

    for (const sign of [-1, 1] as const) {
      let segment: number[] = [];
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

  // 引力漩涡：收缩每位移 1 只猫追加额外伤害
  const collapsePerMove = modifiers?.collapseMoveDamage ?? 0;
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

export function refillColors(board: Board, cell: number): number[] {
  const [cq, cr] = coord(cell);
  const colors: number[] = [];
  for (let color = 0; color < COLORS; color++) {
    let createsMatch = false;
    for (const [aq, ar] of AXES) {
      let length = 1;
      for (const direction of [-1, 1] as const) {
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

export function refill(state: GameState, rng: SeededRng, event: RoundEvent): void {
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
        cat: cloneCat(cat)!,
        edge: edgeSet.has(cell),
      });
    }
  }
  event.after = cloneBoard(state.board);
  event.refillMatches = matches(state.board);
}

export function previewSwap(
  state: GameState,
  a: number,
  b: number,
  modifiers?: RuleModifiers
): PreviewResult {
  if (!validSwap(state, a, b)) {
    return { valid: false };
  }
  const copy = cloneState(state);
  const tmp = copy.board[a];
  copy.board[a] = copy.board[b];
  copy.board[b] = tmp;
  return { valid: true, event: roundStep(copy, 1, modifiers) };
}

function reshuffle(state: GameState, rng: SeededRng): string {
  for (let attempt = 0; attempt < 128; attempt++) {
    for (let i = state.board.length - 1; i > 0; i--) {
      const j = rng.randiRange(0, i);
      const tmp = state.board[i];
      state.board[i] = state.board[j];
      state.board[j] = tmp;
    }
    if (matches(state.board).length === 0 && findLegalSwaps(state).length > 0) {
      return '无可用交换，棋盘已重排（保留猫的等级与颜色）';
    }
  }
  generate(state, rng);
  return '重排未找到可用布局，已刷新为小猫棋盘';
}

export function resolveSwap(
  state: GameState,
  a: number,
  b: number,
  modifiers?: RuleModifiers
): ResolveResult {
  if (!validSwap(state, a, b)) {
    return {
      valid: false,
      state: cloneState(state),
      swapped: cloneBoard(state.board),
      events: [],
      notice: '',
    };
  }

  const next = cloneState(state);
  const rng = new SeededRng(next.seed, next.rngState);
  const tmp = next.board[a];
  next.board[a] = next.board[b];
  next.board[b] = tmp;

  const swapped = cloneBoard(next.board);
  const events: RoundEvent[] = [];
  let notice = '';

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
      notice = '达到 100 轮结算保护，已刷新棋盘';
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
    notice,
  };
}
