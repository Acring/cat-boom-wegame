import {
  cloneBoard,
  coord,
  GameState,
  index,
  matches,
  newGame,
  previewSwap,
  resolveSwap,
  validSwap,
} from './rules';

export const FIXTURE_NAMES: readonly string[] = [
  '3 连合成大猫',
  '单向宽光束',
  '双向宽光束',
  'V 字宽光束',
  '收缩触发连锁',
  '留给对手的大猫',
  'V 字合成大猫',
  '二连环二次引爆',
  '三连环多米诺',
  '4 连合成双大猫',
  '5 连合成炫彩猫',
  '炫彩猫 6 向全爆',
  '三 2 星合炫彩',
  '双 2 星引爆',
  '炫彩+2 星共爆',
  '波及炫彩二次核爆',
  '爆发覆盖纯合成',
];

export interface FixtureGroup {
  title: string;
  ids: readonly number[];
}

export const FIXTURE_GROUPS: readonly FixtureGroup[] = [
  { title: '合成类', ids: [0, 9, 10, 6, 12] },
  { title: '引爆类', ids: [1, 2, 3, 13, 11, 14] },
  { title: '连锁与边界', ids: [7, 8, 15, 4, 16, 5] },
];

export function loadFixture(id: number): GameState {
  const center = index(3, 2);
  const swapFrom = index(4, 1);

  for (let attempt = 0; attempt < 300; attempt++) {
    const state = newGame(8000 + id * 1000 + attempt);
    const target = cloneBoard(state.board);
    const [pq, pr] = coord(center);

    let cells: number[];
    if (id === 3 || id === 6) {
      cells = [
        center,
        index(pq, pr + 1),
        index(pq, pr + 2),
        index(pq + 1, pr),
        index(pq + 2, pr),
      ];
    } else if (id === 9) {
      cells = [
        index(pq, pr - 1),
        center,
        index(pq, pr + 1),
        index(pq, pr + 2),
      ];
    } else if (id === 10) {
      cells = [
        index(pq, pr - 2),
        index(pq, pr - 1),
        center,
        index(pq, pr + 1),
        index(pq, pr + 2),
      ];
    } else {
      cells = [index(pq, pr - 1), center, index(pq, pr + 1)];
    }

    for (const cell of cells) {
      target[cell]!.color = 0;
      target[cell]!.level = 1;
    }
    target[swapFrom]!.color = 1;

    if (id === 1 || id === 7 || id === 8 || id === 15 || id === 16) {
      target[cells[0]]!.level = 2;
    } else if (id === 2 || id === 3) {
      target[center]!.level = 2;
    } else if (id === 11) {
      // 炫彩猫位于中心，作为万能色与两只橘猫凑三连，触发 6 方向全向宽光束
      target[center]!.color = 2;
      target[center]!.level = 3;
    } else if (id === 12) {
      // 三只 2 星大猫连成一线 -> 合成 1 只 3 星炫彩猫
      for (const cell of cells) target[cell]!.level = 2;
    } else if (id === 13) {
      // 双 2 星 + 1 星引爆（射程升至 3，3 条宽光束）
      target[cells[0]]!.level = 2;
      target[cells[1]]!.level = 2;
    } else if (id === 14) {
      // 2 星 + 3 星炫彩 + 1 星共同引爆
      target[cells[0]]!.level = 2;
      target[cells[1]]!.color = 2;
      target[cells[1]]!.level = 3;
    }

    if (id === 15) {
      // Wave 0 宽光束扫到侧翼 (pq+1, pr) 的 3 星炫彩猫 -> Wave 1 触发 6 方向二次核爆
      const chainRainbow = index(pq + 1, pr);
      if (chainRainbow >= 0) {
        target[chainRainbow]!.color = 2;
        target[chainRainbow]!.level = 3;
        // 错开侧翼炫彩猫 3 条轴上的邻居颜色，确保交换前后它都不直接参与主匹配，只在 Wave 1 被波及核爆
        const safeRing: Array<[number, number, number]> = [
          [pq + 1, pr - 2, 3],
          [pq + 1, pr + 1, 2],
          [pq + 1, pr + 2, 3],
          [pq - 1, pr, 2],
          [pq + 2, pr, 3],
          [pq + 3, pr, 2],
          [pq - 1, pr + 2, 3],
          [pq + 2, pr - 1, 2],
          [pq + 3, pr - 2, 3],
        ];
        for (const [aq, ar, col] of safeRing) {
          const c = index(aq, ar);
          if (c >= 0 && c !== swapFrom && c !== chainRainbow && !cells.includes(c)) {
            target[c]!.color = col;
            target[c]!.level = 1;
          }
        }
      }
    }

    if (id === 16) {
      // 交换 swapFrom=(4,1) 与 center=(3,2)：
      // (3,2) 侧形成橘色 2+1+1 宽光束向下爆发；(4,1) 侧形成绿色 1+1+1 纯合成，且合成中心 (4,1) 被宽光束覆盖！
      target[swapFrom]!.color = 2;
      target[swapFrom]!.level = 1;
      const topG = index(pq + 1, pr - 2);
      const botG = index(pq + 1, pr);
      if (topG >= 0) {
        target[topG]!.color = 2;
        target[topG]!.level = 1;
      }
      if (botG >= 0) {
        target[botG]!.color = 2;
        target[botG]!.level = 1;
      }
    }

    if (id === 7) {
      // 单向宽光束向下发射（radius=2），侧翼 (pq+1, pr) 放一只不同色大猫，被 Wave 0 波及后触发 Wave 1 周围 1 圈
      const chain1 = index(pq + 1, pr);
      if (chain1 >= 0) {
        target[chain1]!.color = 2;
        target[chain1]!.level = 2;
      }
    }

    if (id === 8) {
      // 三连环多米诺：Wave 0 宽光束波及 chain1 -> Wave 1 周围 1 圈波及 chain2 -> Wave 2 周围 1 圈
      const chain1 = index(pq + 1, pr);
      const chain2 = index(pq + 2, pr);
      if (chain1 >= 0) {
        target[chain1]!.color = 2;
        target[chain1]!.level = 2;
      }
      if (chain2 >= 0) {
        target[chain2]!.color = 3;
        target[chain2]!.level = 2;
      }
    }

    if (id === 10 || id === 12) {
      // 确保合成炫彩猫后，斜向两侧不意外自动凑出万能 3 连，方便观察合成结果
      const around: Array<[number, number, number]> = [
        [pq - 1, pr, 1],
        [pq - 2, pr, 2],
        [pq + 1, pr, 3],
        [pq + 2, pr, 1],
        [pq - 1, pr + 1, 2],
        [pq - 2, pr + 2, 3],
        [pq + 1, pr - 1, 1],
        [pq + 2, pr - 2, 2],
      ];
      for (const [aq, ar, col] of around) {
        const cell = index(aq, ar);
        if (cell >= 0 && cell !== swapFrom && !cells.includes(cell)) {
          target[cell]!.color = col;
          target[cell]!.level = 1;
        }
      }
    }

    if (id === 4) {
      // 竖向收缩后，上方绿猫落入并连成一条斜线
      const incoming = index(pq, pr - 2);
      target[incoming]!.color = 2;
      target[index(pq + 1, pr - 1)]!.color = 2;
      target[index(pq + 2, pr - 1)]!.color = 2;
    }

    if (id === 5) {
      // 合成后的新大猫在对手回合可直接被一步引爆
      target[index(pq + 1, pr)]!.color = 0;
      target[index(pq + 2, pr)]!.color = 1;
      target[index(pq + 3, pr)]!.color = 0;
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
      if (
        (id === 10 || id === 12) &&
        !(
          preview.event.centers.length === 1 &&
          preview.event.centers[0].resultLevel === 3 &&
          preview.event.waves.length === 0
        )
      ) {
        continue;
      }
      if ((id === 10 || id === 12) && preview.event.deterministicMatches.length > 0) {
        continue;
      }
      if (id === 11 && !(preview.event.waves.length >= 1 && preview.event.waves[0].kind === 'rainbow')) {
        continue;
      }
      if (id === 13 && !(preview.event.waves.length >= 1 && preview.event.rays.length === 3)) {
        continue;
      }
      if (
        id === 14 &&
        !(
          preview.event.waves.length >= 1 &&
          preview.event.waves[0].kind === 'rainbow' &&
          preview.event.waves[0].sources.length === 2
        )
      ) {
        continue;
      }
      if (
        id === 15 &&
        !(
          preview.event.waves.length >= 2 &&
          preview.event.waves[0].kind === 'beam' &&
          preview.event.waves[1].kind === 'rainbow'
        )
      ) {
        continue;
      }
      if (id === 16 && !(preview.event.centers.length === 1 && !preview.event.centers[0].survives)) {
        continue;
      }

      if (id === 5) {
        const outcome = resolveSwap(state, swapFrom, center).state;
        const bridge = index(pq + 2, pr);
        const donor = index(pq + 3, pr);
        if (outcome.winner >= 0 || outcome.board[center]?.level !== 2) continue;
        if (!validSwap(outcome, bridge, donor)) continue;
        const oppPreview = previewSwap(outcome, bridge, donor);
        if (!oppPreview.valid || !oppPreview.event?.rays.some((path) => path[0] === center)) {
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

  return newGame(8000 + id);
}
