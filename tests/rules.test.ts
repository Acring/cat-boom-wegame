import assert from 'node:assert/strict';
import {
  castWideBeam,
  CELL_COUNT,
  clampBoardHeat,
  cloneState,
  COLORS,
  computePvpBoardHeat,
  coord,
  findLegalSwaps,
  index,
  matches,
  newGame,
  previewSwap,
  resolveSwap,
  validSwap,
} from '../src/rules';
import { FIXTURE_NAMES, loadFixture } from '../src/fixtures';

function runTests() {
  let assertions = 0;
  const check = (cond: unknown, msg: string) => {
    assert.ok(cond, msg);
    assertions += 1;
  };

  // 1. 坐标与索引互逆
  for (let i = 0; i < CELL_COUNT; i++) {
    const [q, r] = coord(i);
    check(index(q, r) === i, `coord/index roundtrip failed at ${i}`);
  }

  // 2. 新游戏确定性与初始状态合法性
  const g1 = newGame(12345);
  const g2 = newGame(12345);
  check(JSON.stringify(g1) === JSON.stringify(g2), 'Same seed must produce identical state');
  check(matches(g1.board).length === 0, 'Initial board must have no automatic matches');
  check(findLegalSwaps(g1).length > 0, 'Initial board must have at least one legal swap');
  check(g1.board.every((c) => c !== null && c.level === 1), 'Initial board must be all level-1 cats');
  check(COLORS === 5, 'Board should use 5 distinct real cat colors');
  check(
    g1.board.every((c) => c !== null && c.color >= 0 && c.color < COLORS),
    'All cats on initial board must stay within valid 0..4 color range'
  );
  const initialColors = new Set(g1.board.map((c) => c!.color));
  check(initialColors.size === COLORS, 'Initial 7x7 board should populate all 5 cat colors');

  // 3. 7 种确定性测试局面校验
  for (let id = 0; id < FIXTURE_NAMES.length; id++) {
    const st = loadFixture(id);
    check(st.fixture === id, `Fixture ${id} should set fixture id`);
    check(st.suggested !== undefined, `Fixture ${id} should have suggested swap`);
    check(matches(st.board).length === 0, `Fixture ${id} should have no initial match`);
    const [a, b] = st.suggested!;
    check(validSwap(st, a, b), `Fixture ${id} suggested swap must be valid`);

    const prev = previewSwap(st, a, b);
    check(prev.valid && prev.event !== undefined, `Fixture ${id} preview must succeed`);

    const ev = prev.event!;
    if (id === 0) {
      check(ev.centers.length === 1 && ev.centers[0].survives, 'Basic merge should create 1 surviving big cat');
      check(ev.damage === 2, 'Basic 3-cat merge should deal 2 damage');
      check(ev.rays.length === 0, 'Basic merge should not emit rays');
    } else if (id === 1) {
      check(ev.rays.length === 1, 'One-way blast should emit 1 ray');
      check(ev.centers.length === 0, 'Blast should not upgrade');
    } else if (id === 2) {
      check(ev.rays.length === 2, 'Two-way blast should emit 2 rays');
    } else if (id === 3) {
      check(ev.rays.length === 2, 'V-blast from corner big cat should emit 2 rays');
    } else if (id === 4) {
      check(ev.deterministicMatches.length >= 1, 'Contraction combo fixture must trigger deterministic follow-up match');
    } else if (id === 6) {
      check(ev.centers.length === 1 && ev.lines.length === 2, 'Complex cross merge should merge into 1 center');
      check(ev.centers[0].resultLevel === 2, 'V-merge (3+3) should upgrade into level-2 big cat');
      check(ev.damage === 4, '5-cat V-merge should consume 4 cats for 4 damage');
    } else if (id === 7) {
      check(ev.waves.length >= 2, '2-chain fixture must produce at least 2 blast waves');
      check(ev.waves[0].kind === 'beam' && ev.waves[1].kind === 'ring', 'Wave 0 must be beam and Wave 1 must be ring');
    } else if (id === 8) {
      check(ev.waves.length >= 3, '3-chain domino fixture must produce at least 3 blast waves');
      check(ev.waves[2].kind === 'ring', 'Wave 2 must be ring');
    } else if (id === 9) {
      check(ev.centers.length === 2, '4-cat merge should create 2 big cats');
      check(ev.centers.every((c) => c.resultLevel === 2 && c.survives), '4-cat merge centers should both be level 2');
      check(ev.damage === 2, '4-cat merge consumes 2 small cats for 2 damage');
    } else if (id === 10) {
      check(ev.centers.length === 1 && ev.centers[0].resultLevel === 3, '5-cat line merge should create 1 level-3 rainbow cat');
      check(ev.damage === 4, '5-cat merge consumes 4 small cats for 4 damage');
    } else if (id === 11) {
      check(ev.waves.length >= 1 && ev.waves[0].kind === 'rainbow', 'Rainbow cat match should emit rainbow wave');
      check(ev.waves[0].rays.length === 6, 'Rainbow cat in board center should emit 6-direction wide beams');
    } else if (id === 12) {
      check(ev.centers.length === 1 && ev.centers[0].resultLevel === 3, 'Three level-2 cats should merge into 1 level-3 rainbow cat');
      check(ev.waves.length === 0, 'Three level-2 merge should not immediately explode');
      check(ev.damage === 6, 'Consuming 2 level-2 cats should deal 6 damage');
    } else if (id === 13) {
      check(ev.waves.length >= 1 && ev.rays.length === 3, 'Double level-2 blast (2+2+1) should emit 3 wide beams');
    } else if (id === 14) {
      check(ev.waves.length >= 1 && ev.waves[0].kind === 'rainbow', 'Rainbow + level-2 blast should emit rainbow wave');
      check(ev.waves[0].sources.length === 2, 'Both rainbow and level-2 should be wave 0 sources');
    } else if (id === 15) {
      check(ev.waves.length >= 2 && ev.waves[0].kind === 'beam' && ev.waves[1].kind === 'rainbow', 'Wave 0 beam hitting rainbow cat should trigger Wave 1 rainbow detonation');
    } else if (id === 16) {
      check(ev.centers.length === 1 && !ev.centers[0].survives, 'Blast covering concurrent pure merge center should destroy center');
    }

    const res = resolveSwap(st, a, b);
    check(res.valid, `Fixture ${id} resolveSwap must succeed`);
    const expectedHp = Math.max(0, 100 - res.events.reduce((s, e) => s + e.damage, 0));
    check(res.state.hp[1] === expectedHp, `Fixture ${id} HP delta mismatch`);
    if (id === 4) {
      check(res.events.length >= 2, 'Contraction combo must produce at least 2 rounds');
      check(res.events[1].bonus === 2, 'Round 2 combo bonus must be 2');
    }
    if (id === 10 || id === 12) {
      check(
        res.state.board.some((c) => c !== null && c.level === 3),
        `Fixture ${id} clean rainbow merge should leave rainbow cat on board`
      );
    }
  }

  // 3.5 宽光束几何校验（起爆点周围 1 圈 + 3 格宽、长度 radius）
  const mid = index(3, 2);
  const beamDown = castWideBeam(mid, 0, 1, 2);
  check(beamDown.path.length === 3, 'Beam path should include origin + 2 forward steps');
  check(beamDown.cells.length === 10, 'Radius-2 wide beam in center should cover 1-ring + forward steps = 10 cells');
  check(beamDown.cells.includes(index(3, 1)), 'Wide beam origin should also blast surrounding 1-ring behind it');

  // 4. 补猫不直接制造三连验证
  for (let seed = 100; seed < 110; seed++) {
    const st = newGame(seed);
    const swaps = findLegalSwaps(st);
    const [a, b] = swaps[0];
    const res = resolveSwap(st, a, b);
    for (const ev of res.events) {
      const detKeys = new Set(ev.deterministicMatches.map((l) => l.cells.join(',')));
      for (const line of ev.refillMatches) {
        check(detKeys.has(line.cells.join(',')), 'Refill must not create or extend new 3+ matches');
      }
    }
  }

  // 5. 立即判胜不收缩不补猫
  const lethal = loadFixture(0);
  lethal.hp[1] = 2;
  const [la, lb] = lethal.suggested!;
  const lethalRes = resolveSwap(lethal, la, lb);
  check(lethalRes.state.winner === 0, 'Player 0 should win immediately');
  check(lethalRes.state.hp[1] === 0, 'Defender HP should be 0');
  check(lethalRes.events.length === 1, 'Should stop after winning round');
  check(lethalRes.events[0].moves.length === 0, 'Should not contract after winning');
  check(lethalRes.events[0].spawn.length === 0, 'Should not refill after winning');

  // 6. 无效交换不改变状态
  const snap = cloneState(g1);
  const invalidRes = resolveSwap(g1, 0, 48);
  check(!invalidRes.valid, 'Non-adjacent swap must be invalid');
  check(JSON.stringify(invalidRes.state) === JSON.stringify(snap), 'Invalid swap must not mutate state');

  // 7. 机器驱动完整对局（3 局验证能正常分出胜负）
  for (let matchIdx = 0; matchIdx < 3; matchIdx++) {
    let st = newGame(5000 + matchIdx);
    let turns = 0;
    while (st.winner < 0 && turns < 200) {
      const swaps = findLegalSwaps(st);
      check(swaps.length > 0, `Match ${matchIdx} turn ${turns} must have legal swaps`);
      const [a, b] = swaps[turns % swaps.length];
      const res = resolveSwap(st, a, b);
      check(res.valid, `Match ${matchIdx} turn ${turns} swap must resolve`);
      st = res.state;
      turns += 1;
    }
    check(st.winner === 0 || st.winner === 1, `Match ${matchIdx} must reach a winner within 200 turns`);
  }

  // 8. 棋盘热度（boardHeat）确定性与可控单调性验证
  check(clampBoardHeat(-0.5) === 0 && clampBoardHeat(1.8) === 1, 'clampBoardHeat must clamp into [0, 1]');
  check(
    computePvpBoardHeat(1) === computePvpBoardHeat(6) && computePvpBoardHeat(6) === computePvpBoardHeat(14),
    'PvP board heat should stay constant at opening heat without in-match ramp'
  );
  const coldA = newGame(7777, 0.1);
  const coldB = newGame(7777, 0.1);
  check(JSON.stringify(coldA) === JSON.stringify(coldB), 'Same seed and heat must produce identical board');
  let coldSwapSum = 0;
  let midSwapSum = 0;
  let hotSwapSum = 0;
  for (let s = 3000; s < 3030; s++) {
    const gCold = newGame(s, 0.05);
    const gMid = newGame(s, 0.5);
    const gHot = newGame(s, 0.95);
    check(matches(gCold.board).length === 0 && matches(gHot.board).length === 0, 'Heat boards must have no auto-matches');
    coldSwapSum += findLegalSwaps(gCold).length;
    midSwapSum += findLegalSwaps(gMid).length;
    hotSwapSum += findLegalSwaps(gHot).length;
  }
  check(
    coldSwapSum < midSwapSum && midSwapSum < hotSwapSum,
    `Board heat must monotonically increase legal swaps (cold=${coldSwapSum}, mid=${midSwapSum}, hot=${hotSwapSum})`
  );

  // 高热补猫依然严守“不直接制造新 3 连”的硬约束
  for (let seed = 4100; seed < 4108; seed++) {
    const st = newGame(seed, 0.95);
    const [a, b] = findLegalSwaps(st)[0];
    const res = resolveSwap(st, a, b, { boardHeat: 0.95 });
    for (const ev of res.events) {
      const detKeys = new Set(ev.deterministicMatches.map((l) => l.cells.join(',')));
      for (const line of ev.refillMatches) {
        check(detKeys.has(line.cells.join(',')), 'High-heat refill must never create new immediate 3+ matches');
      }
    }
  }

  console.log(`ALL RULES TESTS PASSED (${assertions} assertions)`);
}

runTests();
