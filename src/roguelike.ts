// Cat Boom · 猫梗 Boss 肉鸽核心逻辑层（纯数据与规则，不依赖 UI/Canvas）

import { SeededRng } from './rng';
import {
  CELL_COUNT,
  cloneState,
  findLegalSwaps,
  GameState,
  HP,
  matches,
  newGame,
  previewSwap,
  RoundEvent,
  RuleModifiers,
  validSwap,
} from './rules';

export type BossId = 'orange' | 'cow' | 'hakimi';
export type RelicBranch = 'blast' | 'merge' | 'collapse';
export type RelicId =
  | 'chain_detonator'
  | 'wide_overdrive'
  | 'aftershock_paw'
  | 'paw_shield'
  | 'double_kibble'
  | 'calm_defuse'
  | 'gravity_vortex'
  | 'catnip_combo'
  | 'combo_heal';

export interface BossProfile {
  id: BossId;
  stage: number;
  name: string;
  title: string;
  tagline: string;
  maxHp: number;
  skillPeriod: number; // 0 表示被动常驻；>0 表示每 N 个 Boss 回合触发一次主动技能
  traitShort: string;
  accentColor: string;
  barFillColor: string;
}

export interface RelicDef {
  id: RelicId;
  branch: RelicBranch;
  branchLabel: string;
  name: string;
  shortDesc: string;
  detailDesc: string;
  badgeColor: string;
}

export interface BossIntent {
  swap: [number, number] | null;
  expectedDamage: number;
  orangeCount: number;
  hasBlast: boolean;
  hasMerge: boolean;
  skillReady: boolean;
  skillText: string;
  headline: string;
}

export interface BossSkillOutcome {
  triggered: boolean;
  banner: string;
  upgradedCell: number;
  shieldGained: number;
}

export interface PlayerPostTurnOutcome {
  shieldGained: number;
  healed: number;
  calmDefuseArmed: boolean;
  notes: string[];
}

export interface BossPostTurnOutcome {
  bossHealed: number;
  notes: string[];
}

export interface HintSet {
  highValue: Array<[number, number]>;
  fallback: [number, number] | null;
}

export interface RoguelikeRun {
  seed: number;
  stageIndex: number; // 0..2
  playerHp: number;
  playerMaxHp: number;
  playerShield: number;
  bossShield: number;
  bossTurnsTaken: number;
  relics: RelicId[];
  calmDefuseActive: boolean;
  phase: 'battle' | 'reward' | 'victory' | 'defeat';
  rewardChoices: RelicId[];
  totalTurns: number;
  bestTurnDamage: number;
  defeatedBosses: BossId[];
}

export const STAGE_CLEAR_HEAL = 25;

export const BOSSES: readonly BossProfile[] = [
  {
    id: 'orange',
    stage: 1,
    name: '大橘·干饭王',
    title: '第 1 关 · 贪吃橘猫',
    tagline: '十只橘猫九只胖，见橘就抢！',
    maxHp: 75,
    skillPeriod: 0,
    traitShort: '专抢橘猫 · 每消1只橘猫回1血(上限+8)',
    accentColor: '#e67e22',
    barFillColor: '#ffd199',
  },
  {
    id: 'cow',
    stage: 2,
    name: '奶牛猫·午夜发癫王',
    title: '第 2 关 · 猫中哈士奇',
    tagline: '凌晨三点跑酷，见大猫就炸！',
    maxHp: 95,
    skillPeriod: 2,
    traitShort: '专炸大猫 · 每2回合跑酷把1只小猫变大猫',
    accentColor: '#3d383b',
    barFillColor: '#cbd5e1',
  },
  {
    id: 'hakimi',
    stage: 3,
    name: '哈基米·猫王本尊',
    title: '第 3 关 · 终极猫王',
    tagline: '优雅压迫感，全场我说了算！',
    maxHp: 120,
    skillPeriod: 2,
    traitShort: '高伤抢爆 · 每2回合哈气叠8盾+造1大猫',
    accentColor: '#c0392b',
    barFillColor: '#f5b7c8',
  },
];

export const RELICS: readonly RelicDef[] = [
  // 🔥 爆破流
  {
    id: 'chain_detonator',
    branch: 'blast',
    branchLabel: '爆破流',
    name: '连环雷管',
    shortDesc: '二次引爆每波 +5 伤',
    detailDesc: '触发连锁二次引爆（Wave 1+）时，每多 1 波额外造成 +5 点爆破伤害。',
    badgeColor: '#ff6b6b',
  },
  {
    id: 'wide_overdrive',
    branch: 'blast',
    branchLabel: '爆破流',
    name: '过载宽光束',
    shortDesc: '大猫光束射程 +1',
    detailDesc: '你的 2 级大猫宽光束射程 +1（最大射程提升至 5 格），轻松引燃全场。',
    badgeColor: '#ff8787',
  },
  {
    id: 'aftershock_paw',
    branch: 'blast',
    branchLabel: '爆破流',
    name: '余震猫爪',
    shortDesc: '每波爆发 +3 穿盾真伤',
    detailDesc: '你触发的每次爆发结束后，追加「爆发波数 × 3」点无视护盾的余震真伤。',
    badgeColor: '#f06595',
  },
  // ⭐ 合成流
  {
    id: 'paw_shield',
    branch: 'merge',
    branchLabel: '合成流',
    name: '肉垫护盾',
    shortDesc: '合大猫 +6 盾 · 合炫彩 +15 盾',
    detailDesc: '每合成 1 只 2 级大猫获得 +6 护盾，合成 3 级炫彩猫获得 +15 护盾。',
    badgeColor: '#f5b82e',
  },
  {
    id: 'double_kibble',
    branch: 'merge',
    branchLabel: '合成流',
    name: '双倍猫粮',
    shortDesc: '合成基础伤害翻倍',
    detailDesc: '你的纯小猫合成与全 2 星合成造成的基础伤害翻倍（3 连 4 伤，三 2 星 12 伤）。',
    badgeColor: '#f59f00',
  },
  {
    id: 'calm_defuse',
    branch: 'merge',
    branchLabel: '合成流',
    name: '以小博大',
    shortDesc: '合成后下回合减伤 30%',
    detailDesc: '本回合只要合成出大猫或炫彩猫，下个 Boss 回合你受到的伤害减免 30%。',
    badgeColor: '#eab308',
  },
  // 🌀 收缩流
  {
    id: 'gravity_vortex',
    branch: 'collapse',
    branchLabel: '收缩流',
    name: '引力漩涡',
    shortDesc: '收缩每移动 1 猫 +1 伤',
    detailDesc: '纯合成触发定向收缩时，每有 1 只猫发生位移，额外对 Boss 造成 +1 点挤压伤害。',
    badgeColor: '#38b583',
  },
  {
    id: 'catnip_combo',
    branch: 'collapse',
    branchLabel: '收缩流',
    name: '猫薄荷连击',
    shortDesc: '连锁加伤翻倍 (+4/+8/+12)',
    detailDesc: '你的多轮连锁加伤翻倍，第 2/3/4 轮额外伤害变为 +4 / +8 / +12。',
    badgeColor: '#20c997',
  },
  {
    id: 'combo_heal',
    branch: 'collapse',
    branchLabel: '收缩流',
    name: '顺手牵猫',
    shortDesc: '连锁第 2 轮起每次回 5 血',
    detailDesc: '你通过收缩触发第 2 轮及以上连锁时，每轮回复自身 +5 生命（不超上限）。',
    badgeColor: '#12b886',
  },
];

export function getBossProfile(stageIndex: number): BossProfile {
  const clamped = Math.max(0, Math.min(BOSSES.length - 1, stageIndex));
  return BOSSES[clamped];
}

export function getRelicDef(id: RelicId): RelicDef {
  return RELICS.find((r) => r.id === id) ?? RELICS[0];
}

export function createRoguelikeRun(seed: number): RoguelikeRun {
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
    phase: 'battle',
    rewardChoices: [],
    totalTurns: 0,
    bestTurnDamage: 0,
    defeatedBosses: [],
  };
}

/** 创建指定关卡的对局棋盘状态（玩家永远先手，保留玩家血量与护盾） */
export function createStageGameState(run: RoguelikeRun): GameState {
  const boss = getBossProfile(run.stageIndex);
  const stageSeed = run.seed + run.stageIndex * 9973 + 17;
  const st = newGame(stageSeed);
  st.hp = [run.playerHp, boss.maxHp];
  st.maxHp = [run.playerMaxHp, boss.maxHp];
  st.shield = [run.playerShield, run.bossShield];
  st.player = 0;
  return st;
}

/** 汇总玩家已拥有祝福对应的规则修饰器 */
export function buildPlayerModifiers(relics: readonly RelicId[]): RuleModifiers {
  const has = (id: RelicId) => relics.includes(id);
  return {
    beamRadiusBonus: has('wide_overdrive') ? 1 : 0,
    mergeDamageMultiplier: has('double_kibble') ? 2 : 1,
    waveChainBonus: has('chain_detonator') ? 5 : 0,
    comboStepMultiplier: has('catnip_combo') ? 2 : 1,
    collapseMoveDamage: has('gravity_vortex') ? 1 : 0,
    aftershockPerWave: has('aftershock_paw') ? 3 : 0,
    damageMultiplier: 1,
  };
}

/** Boss 回合的规则修饰器（含玩家的“以小博大”30% 减伤） */
export function buildBossModifiers(run: RoguelikeRun): RuleModifiers {
  return {
    damageMultiplier: run.calmDefuseActive ? 0.7 : 1,
  };
}

function isBossSkillDue(boss: BossProfile, bossTurnsTaken: number): boolean {
  if (boss.skillPeriod <= 0) return false;
  // 第 2、4、6... 个 Boss 回合触发主动技能，给玩家第 1 回合的观察与铺垫窗口
  return (bossTurnsTaken + 1) % boss.skillPeriod === 0;
}

/** 根据 Boss 性格评估当前棋盘，生成透明意图预告（并可直接用于 Boss 出手） */
export function computeBossIntent(
  state: GameState,
  boss: BossProfile,
  bossTurnsTaken: number,
  damageMultiplier = 1
): BossIntent {
  const probe = cloneState(state);
  probe.player = 1;
  probe.winner = -1;

  const swaps = findLegalSwaps(probe);
  const skillReady = isBossSkillDue(boss, bossTurnsTaken);
  const skillText =
    boss.id === 'orange'
      ? '被动：消橘猫回血'
      : boss.id === 'cow'
        ? skillReady
          ? '⚡ 本回合跑酷：变 1 只大猫'
          : '跑酷充能中（下回合发癫）'
        : skillReady
          ? '👑 本回合哈气：+8 盾 + 造 1 大猫'
          : '猫王蓄力中（下回合哈气）';

  if (swaps.length === 0) {
    return {
      swap: null,
      expectedDamage: 0,
      orangeCount: 0,
      hasBlast: false,
      hasMerge: false,
      skillReady,
      skillText,
      headline: `${boss.name} 暂时无路可走`,
    };
  }

  interface Candidate {
    swap: [number, number];
    damage: number;
    orangeCount: number;
    hasBlast: boolean;
    hasMerge: boolean;
    score: number;
  }

  const candidates: Candidate[] = [];
  for (const sw of swaps) {
    const prev = previewSwap(probe, sw[0], sw[1], { damageMultiplier });
    if (!prev.valid || !prev.event) continue;
    const ev = prev.event;
    const hasBlast = ev.waves.length > 0;
    const hasMerge = ev.centers.length > 0;
    let orangeCount = 0;
    for (const c of ev.cleared) {
      if (ev.before[c]?.color === 0) orangeCount += 1;
    }

    let score = ev.damage;
    if (boss.id === 'orange') {
      // 大橘：眼里只有橘猫！有橘猫就优先抢橘猫
      score = orangeCount > 0 ? 1000 + orangeCount * 25 + ev.damage : ev.damage;
    } else if (boss.id === 'cow') {
      // 奶牛猫：看到能引爆大猫就无脑发癫冲；否则偏中等随机
      score = hasBlast ? 1000 + ev.damage * 3 : ev.damage;
    } else {
      // 哈基米：先抢爆高星猫，再抢高伤或造大猫
      score = hasBlast ? 1200 + ev.damage * 4 : ev.damage * 2 + (hasMerge ? 18 : 0);
    }

    candidates.push({
      swap: sw,
      damage: ev.damage,
      orangeCount,
      hasBlast,
      hasMerge,
      score,
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
      headline: `${boss.name} 正在观察棋盘`,
    };
  }

  candidates.sort((a, b) => b.score - a.score);

  let chosen = candidates[0];
  // 奶牛猫在没大猫可炸时，带一点“发癫感”：从前 4 个候选里按确定性哈希挑一个
  if (boss.id === 'cow' && !chosen.hasBlast && candidates.length > 1) {
    const pool = Math.min(4, candidates.length);
    const pick = (state.turn * 7 + bossTurnsTaken * 3 + state.seed) % pool;
    chosen = candidates[pick];
  }

  let actionDesc = '准备发起进攻';
  if (boss.id === 'orange' && chosen.orangeCount > 0) {
    const estHeal = Math.min(8, chosen.orangeCount);
    actionDesc = chosen.hasBlast
      ? `抢爆橘猫大招！(约 ${chosen.damage} 伤 + 回 ${estHeal} 血)`
      : `抢吃橘猫合大猫 (约 ${chosen.damage} 伤 + 回 ${estHeal} 血)`;
  } else if (chosen.hasBlast) {
    actionDesc = `锁定抢爆你的大猫！(约 ${chosen.damage} 伤)`;
  } else if (chosen.hasMerge) {
    actionDesc = `准备合成大猫埋雷 (约 ${chosen.damage} 伤)`;
  } else {
    actionDesc = `预计造成 ${chosen.damage} 伤`;
  }

  return {
    swap: chosen.swap,
    expectedDamage: chosen.damage,
    orangeCount: chosen.orangeCount,
    hasBlast: chosen.hasBlast,
    hasMerge: chosen.hasMerge,
    skillReady,
    skillText,
    headline: actionDesc,
  };
}

/** Boss 回合出手前触发的主动机制技能（奶牛跑酷 / 哈基米哈气） */
export function applyBossPreTurnSkill(
  state: GameState,
  boss: BossProfile,
  bossTurnsTaken: number
): BossSkillOutcome {
  if (!isBossSkillDue(boss, bossTurnsTaken)) {
    return { triggered: false, banner: '', upgradedCell: -1, shieldGained: 0 };
  }

  const rng = new SeededRng(state.seed + bossTurnsTaken * 131 + state.turn * 17);
  let shieldGained = 0;
  let upgradedCell = -1;

  // 哈基米：先给自己叠 +8 护盾
  if (boss.id === 'hakimi') {
    shieldGained = 8;
    if (!state.shield) state.shield = [0, 0];
    state.shield[1] += shieldGained;
  }

  // 奶牛猫 & 哈基米：挑 1 只 1 级小猫原地升为 2 级大猫（保持不产生自动匹配）
  if (boss.id === 'cow' || boss.id === 'hakimi') {
    const level1Cells: number[] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      const cat = state.board[i];
      if (cat && cat.level === 1) {
        level1Cells.push(i);
      }
    }
    // 随机打乱候选格，挑一个不会引起异常的
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

  const banner =
    boss.id === 'cow'
      ? upgradedCell >= 0
        ? '⚡ 奶牛猫午夜跑酷！把 1 只小猫吓成了 2 级大猫！'
        : '⚡ 奶牛猫午夜跑酷扑了个空！'
      : upgradedCell >= 0
        ? `👑 哈基米猫王哈气！获得 +${shieldGained} 护盾并催生 1 只大猫！`
        : `👑 哈基米猫王哈气！获得 +${shieldGained} 护盾！`;

  return {
    triggered: true,
    banner,
    upgradedCell,
    shieldGained,
  };
}

/** 玩家回合结算后，触发合成流/收缩流祝福效果（肉垫护盾、以小博大、顺手牵猫） */
export function applyPlayerPostTurnRelics(
  state: GameState,
  run: RoguelikeRun,
  events: readonly RoundEvent[]
): PlayerPostTurnOutcome {
  const has = (id: RelicId) => run.relics.includes(id);
  let shieldGained = 0;
  let healed = 0;
  let mergedAny = false;
  const notes: string[] = [];

  for (const ev of events) {
    for (const center of ev.centers) {
      if (!center.survives) continue;
      mergedAny = true;
      if (has('paw_shield')) {
        shieldGained += center.resultLevel === 3 ? 15 : 6;
      }
    }
    if (ev.number >= 2 && has('combo_heal')) {
      healed += 5;
    }
  }

  if (shieldGained > 0) {
    if (!state.shield) state.shield = [0, 0];
    state.shield[0] += shieldGained;
    notes.push(`肉垫护盾 +${shieldGained}`);
  }

  if (healed > 0) {
    const maxHp = state.maxHp ? state.maxHp[0] : run.playerMaxHp;
    const beforeHp = state.hp[0];
    state.hp[0] = Math.min(maxHp, state.hp[0] + healed);
    const actualHeal = state.hp[0] - beforeHp;
    if (actualHeal > 0) {
      notes.push(`顺手牵猫回血 +${actualHeal}`);
    }
    healed = actualHeal;
  }

  const calmDefuseArmed = mergedAny && has('calm_defuse');
  if (calmDefuseArmed) {
    notes.push('以小博大已就绪（下回合减伤30%）');
  }

  return {
    shieldGained,
    healed,
    calmDefuseArmed,
    notes,
  };
}

/** Boss 回合结算后触发 Boss 被动（大橘干饭回血） */
export function applyBossPostTurnPassive(
  state: GameState,
  boss: BossProfile,
  events: readonly RoundEvent[]
): BossPostTurnOutcome {
  const notes: string[] = [];
  let bossHealed = 0;

  if (boss.id === 'orange' && state.winner < 0) {
    let orangeCleared = 0;
    for (const ev of events) {
      for (const c of ev.cleared) {
        if (ev.before[c]?.color === 0) orangeCleared += 1;
      }
    }
    if (orangeCleared > 0) {
      const healAmount = Math.min(8, orangeCleared);
      const maxHp = state.maxHp ? state.maxHp[1] : boss.maxHp;
      const before = state.hp[1];
      state.hp[1] = Math.min(maxHp, state.hp[1] + healAmount);
      bossHealed = state.hp[1] - before;
      if (bossHealed > 0) {
        notes.push(`大橘干饭回血 +${bossHealed} HP`);
      }
    }
  }

  return { bossHealed, notes };
}

/** 过关后 3 选 1 抽卡：优先从三大流派各抽 1 张尚未拥有的祝福 */
export function rollRelicChoices(owned: readonly RelicId[], seed: number): RelicId[] {
  const rng = new SeededRng(seed);
  const ownedSet = new Set(owned);
  const branches: RelicBranch[] = ['blast', 'merge', 'collapse'];
  const picked: RelicId[] = [];

  for (const branch of branches) {
    const pool = RELICS.filter((r) => r.branch === branch && !ownedSet.has(r.id));
    if (pool.length > 0) {
      const chosen = pool[rng.randiRange(0, pool.length - 1)];
      picked.push(chosen.id);
    }
  }

  // 若某个流派已抽空，从剩余未拥有祝福中补足到 3 张
  const remaining = RELICS.filter((r) => !ownedSet.has(r.id) && !picked.includes(r.id));
  while (picked.length < 3 && remaining.length > 0) {
    const idx = rng.randiRange(0, remaining.length - 1);
    picked.push(remaining[idx].id);
    remaining.splice(idx, 1);
  }

  return picked;
}

/** 分层微动提示：常态最多标记 2 组高价值交互（引爆大猫/炫彩 或 4/5 连），外加 1 组兜底提示 */
export function computeHintSwaps(state: GameState, modifiers?: RuleModifiers): HintSet {
  const swaps = findLegalSwaps(state);
  if (swaps.length === 0) {
    return { highValue: [], fallback: null };
  }

  const scored: Array<{ swap: [number, number]; isHigh: boolean; score: number }> = [];
  for (const sw of swaps) {
    if (!validSwap(state, sw[0], sw[1])) continue;
    const prev = previewSwap(state, sw[0], sw[1], modifiers);
    if (!prev.valid || !prev.event) continue;
    const ev = prev.event;
    const hasBlast = ev.waves.length > 0;
    const maxLine = ev.lines.reduce((m, l) => Math.max(m, l.cells.length), 0);
    const hasRainbowMerge = ev.centers.some((c) => c.resultLevel === 3);
    const isHigh = hasBlast || maxLine >= 4 || hasRainbowMerge;
    const score =
      (hasBlast ? 500 : 0) +
      (hasRainbowMerge ? 350 : 0) +
      (maxLine >= 4 ? 220 : 0) +
      ev.damage * 10;
    scored.push({ swap: sw, isHigh, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const highValue: Array<[number, number]> = [];
  const usedCells = new Set<number>();
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
    fallback: scored.length > 0 ? scored[0].swap : swaps[0],
  };
}
