// 阳光猫屋手绘贴纸风猫咪渲染：优先使用高清透明精灵图，加载期优雅降级

import type { GameAssets } from './assets';
import type { CatLevel } from './rules';

export const CAT_PALETTE = ['#ffb870', '#a9a6f8', '#8cd9b3', '#f9a9be'] as const;
export const ANIM_FRAME_SIZE = 192;
export const ANIM_FRAME_COUNT = 10;
const INK = '#4e342e';
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';

export type CatAnimState = 'idle' | 'hint' | 'grabbed';

export interface CatDrawOptions {
  x: number;
  y: number;
  colorId: number;
  level: CatLevel;
  scale?: number;
  rotation?: number;
  alpha?: number;
  elapsed?: number;
  showBadge?: boolean;
  animState?: CatAnimState;
  seedOffset?: number;
  grabElapsed?: number;
  flipX?: boolean;
  forceFrame?: number;
}

/** 根据猫咪动作状态与独立相位计算当前精灵图帧索引 (0~9) */
export function pickCatAnimFrame(
  animState: CatAnimState,
  elapsed: number,
  seedOffset = 0,
  grabElapsed = 0
): number {
  if (animState === 'grabbed') {
    // 刚拎起前 0.14s 先愣住拉长(帧7)，随后高频四爪扑腾(帧8 <-> 帧9)，偶尔穿插愣住帧
    if (grabElapsed < 0.14) return 7;
    const step = Math.floor((grabElapsed - 0.14) / 0.105);
    const seq = [8, 9, 8, 9, 8, 9, 7, 9, 8, 9];
    return seq[step % seq.length];
  }

  if (animState === 'hint') {
    // 提示交换：蓄力(4) -> 单爪挥手(5) -> 双爪小跳招手(6) -> 单爪挥手(5)
    const seq = [4, 5, 6, 5];
    const idx = Math.floor((elapsed * 4.2 + seedOffset * 0.3) % seq.length);
    return seq[idx];
  }

  // 待机动作：每只猫按独立随机周期错峰呼气甩尾(1)、眨眼(2)或歪头踩奶(3)，自然不齐步
  const hash = Math.abs(Math.sin(seedOffset * 12.9898 + 78.233) * 43758.5453);
  const period = 3.6 + (hash % 1.8); // 3.6s ~ 5.4s
  const phaseOffset = (hash * 7.3) % period;
  const t = (elapsed + phaseOffset) % period;
  const cycleIndex = Math.floor((elapsed + phaseOffset) / period);

  if (t < 1.35) return 0; // 静卧基准
  if (t < 2.25) return 1; // 呼气甩尾
  if (t < 2.52) return 2; // 短暂眨眼
  if (t < 3.05) return 0;
  // 每隔一个周期做一次歪头踩奶，其余保持静卧/轻摆
  if (cycleIndex % 2 === 0 && t < 3.55) return 3;
  return 0;
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = (i * Math.PI) / 4;
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

export function drawCatSprite(
  ctx: CanvasRenderingContext2D,
  opts: CatDrawOptions,
  assets?: GameAssets
): void {
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
    animState = 'idle',
    seedOffset = 0,
    grabElapsed = 0,
    flipX = false,
    forceFrame,
  } = opts;
  const idx = ((colorId % 4) + 4) % 4;
  const isGrabbed = animState === 'grabbed';

  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  if (scale !== 1) ctx.scale(scale, scale);
  if (alpha !== 1) ctx.globalAlpha *= alpha;

  // 二级大猫底层暖金呼吸虚线光环（被拎起悬空时收起静态底座环，保持悬空轻盈感）
  if (level === 2 && showBadge && !isGrabbed) {
    const pulse = 1 + Math.sin(elapsed * 4.5) * 0.035;
    ctx.save();
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#f5b82e';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 环绕手绘小闪星
    drawFourPointStar(ctx, -40, -34, 7.5, '#ffe169');
    drawFourPointStar(ctx, 41, -30, 6.5, '#ffe169');
    drawFourPointStar(ctx, -42, 26, 5.5, '#fff3b0');
    ctx.restore();
  }

  // 三级炫彩猫底层动态彩虹光晕 + 旋转多色光环 + 6 颗彩色星芒
  if (level === 3 && showBadge) {
    const pulse = 1 + Math.sin(elapsed * 6) * 0.05;
    const hueBase = (elapsed * 140) % 360;
    ctx.save();
    ctx.scale(pulse, pulse);

    // 柔和彩虹光晕底盘
    const glow = ctx.createRadialGradient(0, 0, 12, 0, 0, 56);
    glow.addColorStop(0, `hsla(${hueBase}, 95%, 78%, 0.62)`);
    glow.addColorStop(0.55, `hsla(${(hueBase + 110) % 360}, 92%, 72%, 0.34)`);
    glow.addColorStop(1, `hsla(${(hueBase + 220) % 360}, 92%, 70%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fill();

    // 12 段旋转彩虹外环
    const segments = 12;
    const rot = elapsed * 1.9;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    for (let s = 0; s < segments; s++) {
      const a0 = rot + (s * Math.PI * 2) / segments;
      const a1 = a0 + (Math.PI * 2) / segments - 0.12;
      ctx.strokeStyle = `hsl(${(hueBase + s * 30) % 360}, 92%, 62%)`;
      ctx.beginPath();
      ctx.arc(0, 0, 51, a0, a1);
      ctx.stroke();
    }

    // 6 颗环绕旋转的彩色四角星
    for (let s = 0; s < 6; s++) {
      const ang = -elapsed * 1.3 + (s * Math.PI * 2) / 6;
      const sx = Math.cos(ang) * 46;
      const sy = Math.sin(ang) * 46;
      const starR = 5.5 + (s % 2) * 2.2;
      drawFourPointStar(ctx, sx, sy, starR, `hsl(${(hueBase + s * 60) % 360}, 96%, 72%)`);
    }
    ctx.restore();
  }

  const animSheet = assets
    ? level >= 2
      ? assets.cats[idx].animLv2
      : assets.cats[idx].animLv1
    : undefined;
  const sprite = assets ? (level >= 2 ? assets.cats[idx].lv2 : assets.cats[idx].lv1) : undefined;
  const size = level === 3 ? 110 : level === 2 ? 106 : 98;
  const drawYOffset = isGrabbed ? -6 : level >= 2 ? -3 : 0;

  if (animSheet && animSheet.ready) {
    const frame =
      forceFrame !== undefined
        ? Math.max(0, Math.min(ANIM_FRAME_COUNT - 1, Math.floor(forceFrame)))
        : pickCatAnimFrame(animState, elapsed, seedOffset, grabElapsed);
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
    // 炫彩猫叠加一层流动棱镜流光
    if (level === 3 && showBadge) {
      const hue = (elapsed * 160) % 360;
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
    // 炫彩猫叠加一层流动棱镜流光
    if (level === 3 && showBadge) {
      const hue = (elapsed * 160) % 360;
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
    // 贴图加载前的极简手绘风兜底
    const r = level === 3 ? 36 : level === 2 ? 34 : 30;
    if (level === 3) {
      const hue = (elapsed * 140) % 360;
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

  // 二级大猫右下角清晰手绘徽章 "2"
  if (level === 2 && showBadge) {
    const bx = 33;
    const by = 32;
    ctx.fillStyle = '#ffd54f';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 19px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2', bx, by + 1);
  }

  // 三级炫彩猫右下角彩虹星徽章 "★"
  if (level === 3 && showBadge) {
    const bx = 33;
    const by = 32;
    const hue = (elapsed * 180) % 360;
    const bg = ctx.createLinearGradient(bx - 16, by - 16, bx + 16, by + 16);
    bg.addColorStop(0, `hsl(${hue}, 95%, 66%)`);
    bg.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 95%, 68%)`);
    bg.addColorStop(1, `hsl(${(hue + 240) % 360}, 95%, 66%)`);
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', bx, by + 1);
  }

  ctx.restore();
}
