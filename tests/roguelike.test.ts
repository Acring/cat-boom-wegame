import assert from 'node:assert/strict';
import { loadFixture } from '../src/fixtures';
import {
  applyBossPostTurnPassive,
  applyBossPreTurnSkill,
  applyPlayerPostTurnRelics,
  BOSSES,
  buildBossModifiers,
  buildPlayerModifiers,
  computeBossIntent,
  computeHintSwaps,
  computeRoguelikeBoardHeat,
  createRoguelikeRun,
  createStageGameState,
  createTutorialScenario,
  getBossProfile,
  hasHintRelic,
  RELICS,
  rollRelicChoices,
} from '../src/roguelike';
import { cloneState, findLegalSwaps, matches, previewSwap, resolveSwap, validSwap } from '../src/rules';

function runRoguelikeTests() {
  let assertions = 0;
  const check = (cond: unknown, msg: string) => {
    assert.ok(cond, msg);
    assertions += 1;
  };

  // 1. 3 位猫梗 Boss 与 10 大流派祝福基础校验
  check(BOSSES.length === 3, 'Should define exactly 3 cat-meme bosses');
  check(RELICS.length === 10, 'Should define 10 mechanism relics across 3 branches');
  const branches = new Set(RELICS.map((r) => r.branch));
  check(branches.size === 3, 'Should cover 3 distinct branches (blast/merge/collapse)');
  const roles = new Set(RELICS.map((r) => r.role));
  check(roles.size === 4, 'Should cover 4 distinct roles (attack/defense/heal/utility)');
  check(
    RELICS.every((r) => r.roleLabel.length > 0 && r.roleColor.startsWith('#') && r.shortDesc.length > 0),
    'Every relic must define roleLabel, roleColor and concise shortDesc'
  );

  // 2. 3 选 1 抽卡：初始从三大流派各抽 1 张且不重复
  const choices1 = rollRelicChoices([], 2026);
  check(choices1.length === 3, 'First reward roll should return 3 choices');
  check(new Set(choices1).size === 3, 'Reward choices must be unique');
  const choiceBranches = new Set(choices1.map((id) => RELICS.find((r) => r.id === id)!.branch));
  check(choiceBranches.size === 3, 'Initial 3-choose-1 should present 1 relic per branch');

  // 已拥有若干祝福时不会重复抽到
  const choices2 = rollRelicChoices(choices1, 2027);
  check(choices2.length === 3, 'Second reward roll should still return 3 choices');
  for (const c of choices2) {
    check(!choices1.includes(c), 'Reward roll must never offer already-owned relics');
  }

  // 3. 爆破流三大祝福验证
  // 3a. 连环雷管（Wave 1+ 每波 +5）
  const fChain = loadFixture(7); // 二连环二次引爆（2 波）
  const [ca, cb] = fChain.suggested!;
  const baseChain = previewSwap(fChain, ca, cb).event!;
  const detChain = previewSwap(fChain, ca, cb, buildPlayerModifiers(['chain_detonator'])).event!;
  check(
    detChain.damage === baseChain.damage + (baseChain.waves.length - 1) * 5,
    'chain_detonator must add +5 damage per secondary blast wave'
  );

  // 3b. 过载宽光束（2 级大猫射程 +1）
  const fBeam = loadFixture(1); // 单向宽光束
  const [ba, bb] = fBeam.suggested!;
  const baseBeam = previewSwap(fBeam, ba, bb).event!;
  const overBeam = previewSwap(fBeam, ba, bb, buildPlayerModifiers(['wide_overdrive'])).event!;
  check(
    overBeam.rays[0].length >= baseBeam.rays[0].length,
    'wide_overdrive must extend beam length'
  );
  check(
    overBeam.cleared.length > baseBeam.cleared.length,
    'wide_overdrive must clear more cells in center fixture'
  );

  // 3c. 余震猫爪（每波 +3 无视护盾真伤）
  const shieldedBoss = cloneState(fChain);
  shieldedBoss.shield = [0, 999]; // 给 Boss 套 999 护盾，普通伤害全被挡，真伤必须穿透扣血
  const aftershockRes = resolveSwap(
    shieldedBoss,
    ca,
    cb,
    buildPlayerModifiers(['aftershock_paw'])
  );
  const firstWaveCount = aftershockRes.events[0].waves.length;
  check(
    aftershockRes.events[0].trueDamage === firstWaveCount * 3,
    'aftershock_paw must deal 3 true damage per blast wave'
  );
  check(
    aftershockRes.events[0].hp[1] === 100 - firstWaveCount * 3,
    'aftershock_paw true damage must bypass shield'
  );

  // 4. 合成流三大祝福验证
  // 4a. 双倍猫粮（合成基础伤翻倍）
  const fMerge = loadFixture(0); // 基础 3 连合成（基础 2 伤）
  const [ma, mb] = fMerge.suggested!;
  const doubleMerge = previewSwap(fMerge, ma, mb, buildPlayerModifiers(['double_kibble'])).event!;
  check(doubleMerge.baseDamage === 4 && doubleMerge.damage === 4, 'double_kibble must double merge damage');

  // 4b. 肉垫护盾（合大猫 +6 盾，合炫彩 +15 盾）
  const runShield = createRoguelikeRun(42);
  runShield.relics = ['paw_shield', 'calm_defuse'];
  const mergeRes = resolveSwap(fMerge, ma, mb, buildPlayerModifiers(runShield.relics));
  const postMerge = applyPlayerPostTurnRelics(mergeRes.state, runShield, mergeRes.events);
  check(postMerge.shieldGained >= 6, 'paw_shield must grant +6 shield when forging level-2 cat');
  check(postMerge.calmDefuseArmed, 'calm_defuse must arm 30% damage reduction after merge');

  const fRainbow = loadFixture(10); // 5 连合成炫彩猫
  const [ra, rb] = fRainbow.suggested!;
  const rainbowRes = resolveSwap(fRainbow, ra, rb, buildPlayerModifiers(['paw_shield']));
  const postRainbow = applyPlayerPostTurnRelics(rainbowRes.state, runShield, rainbowRes.events);
  check(postRainbow.shieldGained >= 15, 'paw_shield must grant +15 shield when forging level-3 rainbow cat');

  // 4c. 以小博大（Boss 回合减伤 30%）
  runShield.calmDefuseActive = true;
  const bossMods = buildBossModifiers(runShield);
  check(bossMods.damageMultiplier === 0.7, 'calm_defuse must set boss damageMultiplier to 0.7');

  // 5. 收缩流三大祝福验证
  // 5a. 引力漩涡（收缩每移动 1 只猫 +1 伤）
  const fCombo = loadFixture(4); // 收缩连锁
  const [ga, gb] = fCombo.suggested!;
  const baseCombo = previewSwap(fCombo, ga, gb).event!;
  const vortexCombo = previewSwap(fCombo, ga, gb, buildPlayerModifiers(['gravity_vortex'])).event!;
  check(baseCombo.moves.length > 0, 'Contraction fixture must have moves');
  check(
    vortexCombo.damage === baseCombo.damage + baseCombo.moves.length,
    'gravity_vortex must add +1 damage per contracted cat move'
  );

  // 5b. 猫薄荷连击（第 2 轮加伤翻倍为 +4） + 顺手牵猫（第 2 轮起回血 +5）
  const runCollapse = createRoguelikeRun(88);
  runCollapse.relics = ['catnip_combo', 'combo_heal'];
  const fComboLowHp = cloneState(fCombo);
  fComboLowHp.hp = [70, 100];
  fComboLowHp.maxHp = [100, 100];
  const collapseRes = resolveSwap(fComboLowHp, ga, gb, buildPlayerModifiers(runCollapse.relics));
  check(collapseRes.events.length >= 2, 'Contraction combo fixture must resolve >=2 rounds');
  check(collapseRes.events[1].bonus === 4, 'catnip_combo must double round-2 bonus from 2 to 4');
  const postCollapse = applyPlayerPostTurnRelics(collapseRes.state, runCollapse, collapseRes.events);
  check(postCollapse.healed >= 5, 'combo_heal must heal player on round 2+ combo');

  // 6. 三位猫梗 Boss 习性与专属技能验证
  // 6a. 大橘优先抢橘猫 + 干饭回血
  const orangeRun = createRoguelikeRun(1001);
  const orangeState = createStageGameState(orangeRun);
  const orangeBoss = getBossProfile(0);
  const orangeIntent = computeBossIntent(orangeState, orangeBoss, 0);
  check(orangeIntent.swap !== null, 'Orange boss must compute a valid intent');
  // 用已知橘猫爆发局面验证大橘干饭回血
  const orangeFeedState = cloneState(fMerge);
  orangeFeedState.player = 1;
  orangeFeedState.hp = [100, 50];
  orangeFeedState.maxHp = [100, 75];
  const orangeFeedRes = resolveSwap(orangeFeedState, ma, mb);
  const orangePost = applyBossPostTurnPassive(orangeFeedRes.state, orangeBoss, orangeFeedRes.events);
  check(orangePost.bossHealed > 0, 'Orange boss must heal when clearing orange cats');

  // 6b. 奶牛猫每 2 回合跑酷把 1 只小猫升级成 2 级大猫
  const cowBoss = getBossProfile(1);
  const cowState = createStageGameState({ ...orangeRun, stageIndex: 1 });
  const cowSkillTurn1 = applyBossPreTurnSkill(cowState, cowBoss, 0);
  check(!cowSkillTurn1.triggered, 'Cow boss should not trigger parkour on boss turn 1');
  const cowSkillTurn2 = applyBossPreTurnSkill(cowState, cowBoss, 1);
  check(cowSkillTurn2.triggered && cowSkillTurn2.upgradedCell >= 0, 'Cow boss must upgrade 1 small cat on boss turn 2');
  check(cowState.board[cowSkillTurn2.upgradedCell]?.level === 2, 'Upgraded cell must now be level 2');

  // 6c. 哈基米每 2 回合哈气 +8 盾 + 1 大猫
  const hakimiBoss = getBossProfile(2);
  const hakimiState = createStageGameState({ ...orangeRun, stageIndex: 2 });
  const hakimiSkill = applyBossPreTurnSkill(hakimiState, hakimiBoss, 1);
  check(hakimiSkill.triggered && hakimiSkill.shieldGained === 8, 'Hakimi must gain +8 shield on skill turn');
  check(hakimiState.shield?.[1] === 8, 'Hakimi shield state must reflect +8');

  // 7. 猫须雷达道具与提示引擎验证
  check(!hasHintRelic([]), 'Hint animations must be disabled by default without whisker_radar');
  check(!hasHintRelic(['paw_shield', 'chain_detonator']), 'Unrelated relics must not enable hints');
  check(hasHintRelic(['whisker_radar']), 'whisker_radar relic must enable merge/blast hints');
  const radarRoll = rollRelicChoices(['paw_shield', 'double_kibble', 'calm_defuse'], 2028);
  check(
    radarRoll.includes('whisker_radar'),
    'whisker_radar must be rollable from the merge branch pool'
  );
  const hints = computeHintSwaps(orangeState);
  check(hints.fallback !== null, 'Hint engine must always provide fallback swap when board is playable');
  check(hints.highValue.length <= 2, 'High-value hints must be capped at 2 to prevent visual noise');

  // 8. 第 1 关开局预置大猫 & 2 步极速新手教学确定性验证
  const stage1Board = createStageGameState(createRoguelikeRun(202605));
  const stage1BigCount = stage1Board.board.filter((c) => c && c.level === 2).length;
  check(stage1BigCount === 2, 'Stage 1 opening board must seed 2 level-2 big cats for immediate fun');
  check(matches(stage1Board.board).length === 0, 'Stage 1 seeded board must have no initial auto-matches');

  const tut0 = createTutorialScenario(0);
  check(tut0.totalSteps === 2, 'Tutorial should have 2 concise steps');
  check(validSwap(tut0.state, tut0.guideSwap[0], tut0.guideSwap[1]), 'Tutorial step 1 swap must be valid');
  const tut0Prev = previewSwap(tut0.state, tut0.guideSwap[0], tut0.guideSwap[1]).event!;
  check(tut0Prev.centers.length >= 1, 'Tutorial step 1 must merge a big cat');

  const tut1 = createTutorialScenario(1);
  check(validSwap(tut1.state, tut1.guideSwap[0], tut1.guideSwap[1]), 'Tutorial step 2 swap must be valid');
  const tut1Prev = previewSwap(tut1.state, tut1.guideSwap[0], tut1.guideSwap[1]).event!;
  check(tut1Prev.waves.length >= 2, 'Tutorial step 2 must trigger chain secondary blast (>=2 waves)');

  // 8.5 肉鸽双维度棋盘热度升温曲线校验（关卡递增 + 局内回合递增）
  const s1t1 = computeRoguelikeBoardHeat(0, 1);
  const s1t8 = computeRoguelikeBoardHeat(0, 8);
  const s2t1 = computeRoguelikeBoardHeat(1, 1);
  const s3t1 = computeRoguelikeBoardHeat(2, 1);
  const s3t12 = computeRoguelikeBoardHeat(2, 12);
  check(s1t1 < s2t1 && s2t1 < s3t1, 'Opening board heat must increase across stages 1 -> 2 -> 3');
  check(s1t1 < s1t8 && s3t1 < s3t12, 'Board heat must rise as turns progress within a stage');
  check(s1t1 <= 0.2 && s3t12 >= 0.95, 'Stage 1 opening should stay calm while Stage 3 late-game heats up');
  check(
    buildPlayerModifiers([], s1t1).boardHeat === s1t1 &&
      buildBossModifiers(createRoguelikeRun(1), s3t12).boardHeat === s3t12,
    'Player and boss modifiers must pass through boardHeat when provided'
  );

  // 9. 端到端模拟一场完整 3 关肉鸽闯关（0 弹窗直进第 1 关 + 过关 3 选 1 与 Boss 意图/技能交替）
  const simRun = createRoguelikeRun(202601);
  check(simRun.phase === 'battle', 'New roguelike run must start directly in battle phase');
  check(simRun.rewardChoices.length === 0, 'New roguelike run should not block opening with reward modal');
  for (let stage = 0; stage < BOSSES.length; stage++) {
    simRun.stageIndex = stage;
    simRun.bossShield = 0;
    simRun.bossTurnsTaken = 0;
    simRun.calmDefuseActive = false;
    let st = createStageGameState(simRun);
    const boss = getBossProfile(stage);
    let safety = 0;
    while (st.winner < 0 && safety < 120) {
      safety += 1;
      if (st.player === 0) {
        // 玩家选伤害最高的合法交换
        const swaps = findLegalSwaps(st);
        check(swaps.length > 0, `Stage ${stage} player must have legal swaps`);
        let best = swaps[0];
        let bestDmg = -1;
        const stageHeat = computeRoguelikeBoardHeat(stage, st.turn);
        const pMods = buildPlayerModifiers(simRun.relics, stageHeat);
        for (const sw of swaps) {
          const p = previewSwap(st, sw[0], sw[1], pMods);
          if (p.valid && p.event && p.event.damage > bestDmg) {
            bestDmg = p.event.damage;
            best = sw;
          }
        }
        const res = resolveSwap(st, best[0], best[1], pMods);
        check(res.valid, `Stage ${stage} player swap must resolve`);
        const post = applyPlayerPostTurnRelics(res.state, simRun, res.events);
        simRun.calmDefuseActive = post.calmDefuseArmed;
        st = res.state;
      } else {
        applyBossPreTurnSkill(st, boss, simRun.bossTurnsTaken);
        const intent = computeBossIntent(st, boss, simRun.bossTurnsTaken, simRun.calmDefuseActive ? 0.7 : 1);
        if (!intent.swap) break;
        const stageHeat = computeRoguelikeBoardHeat(stage, st.turn);
        const res = resolveSwap(st, intent.swap[0], intent.swap[1], buildBossModifiers(simRun, stageHeat));
        check(res.valid, `Stage ${stage} boss swap must resolve`);
        applyBossPostTurnPassive(res.state, boss, res.events);
        simRun.calmDefuseActive = false;
        simRun.bossTurnsTaken += 1;
        st = res.state;
      }
    }
    check(st.winner === 0 || st.winner === 1, `Stage ${stage} simulation must finish within 120 turns`);
    // 过关后测试 3 选 1 祝福流程
    const nextChoices = rollRelicChoices(simRun.relics, simRun.seed + stage * 31);
    check(nextChoices.length === 3, `Stage ${stage} must offer 3 relic choices`);
    simRun.relics.push(nextChoices[0]);
    simRun.playerHp = Math.min(simRun.playerMaxHp, Math.max(40, st.hp[0]) + 25);
  }

  console.log(`ALL ROGUELIKE TESTS PASSED (${assertions} assertions)`);
}

runRoguelikeTests();
