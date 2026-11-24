// 双端平台适配层：统一微信小游戏与浏览器的 Canvas、安全区、触控/鼠标和震动反馈

interface WechatTouch {
  clientX: number;
  clientY: number;
}

interface WechatTouchEvent {
  touches: WechatTouch[];
  changedTouches: WechatTouch[];
}

interface WechatGlobal {
  createCanvas(): HTMLCanvasElement;
  getWindowInfo?(): {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    statusBarHeight?: number;
  };
  getSystemInfoSync(): {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    statusBarHeight?: number;
  };
  getMenuButtonBoundingClientRect?(): { top: number; bottom: number; left: number; right: number };
  onTouchStart(cb: (e: WechatTouchEvent) => void): void;
  onTouchMove(cb: (e: WechatTouchEvent) => void): void;
  onTouchEnd(cb: (e: WechatTouchEvent) => void): void;
  onTouchCancel?(cb: (e: WechatTouchEvent) => void): void;
  vibrateShort?(options?: { type?: 'heavy' | 'medium' | 'light' }): void;
}

declare const wx: WechatGlobal | undefined;

export interface Platform {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  topInset: number;
  isWechat: boolean;
  onPointerDown(cb: (x: number, y: number) => void): void;
  onPointerMove(cb: (x: number, y: number) => void): void;
  onPointerUp(cb: (x: number, y: number) => void): void;
  onPointerHover(cb: (x: number, y: number) => void): void;
  vibrate(type?: 'light' | 'medium' | 'heavy'): void;
}

export function createPlatform(): Platform {
  const isWechat = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';

  let canvas: HTMLCanvasElement;
  let width: number;
  let height: number;
  let dpr: number;
  let topInset = 0;

  if (isWechat && wx) {
    canvas = wx.createCanvas();
    const info =
      typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = Math.min(info.pixelRatio || 1, 2);

    // 自动避让微信状态栏与右上角胶囊按钮
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      try {
        const menu = wx.getMenuButtonBoundingClientRect();
        topInset = Math.max(0, Math.min(menu.bottom + 4, 96));
      } catch {
        topInset = (info.statusBarHeight || 20) + 40;
      }
    } else {
      topInset = (info.statusBarHeight || 20) + 40;
    }
  } else {
    const existing = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    canvas = existing || document.createElement('canvas');
    if (!existing) {
      document.body.appendChild(canvas);
    }
    if (window.innerWidth > 540) {
      height = Math.min(window.innerHeight - 24, 900);
      width = Math.round(height * (720 / 1220));
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const downListeners: Array<(x: number, y: number) => void> = [];
  const moveListeners: Array<(x: number, y: number) => void> = [];
  const upListeners: Array<(x: number, y: number) => void> = [];
  const hoverListeners: Array<(x: number, y: number) => void> = [];

  if (isWechat && wx) {
    let lastX = 0;
    let lastY = 0;
    wx.onTouchStart((e) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      lastX = t.clientX;
      lastY = t.clientY;
      for (const cb of downListeners) cb(lastX, lastY);
    });
    wx.onTouchMove((e) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      lastX = t.clientX;
      lastY = t.clientY;
      for (const cb of moveListeners) cb(lastX, lastY);
    });
    const emitUp = (e: WechatTouchEvent) => {
      const t = e.changedTouches[0] || e.touches[0];
      const x = t ? t.clientX : lastX;
      const y = t ? t.clientY : lastY;
      for (const cb of upListeners) cb(x, y);
    };
    wx.onTouchEnd(emitUp);
    if (wx.onTouchCancel) wx.onTouchCancel(emitUp);
  } else {
    let pointerActive = false;
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      };
    };

    canvas.addEventListener('pointerdown', (e) => {
      pointerActive = true;
      canvas.setPointerCapture?.(e.pointerId);
      const pos = toLocal(e.clientX, e.clientY);
      for (const cb of downListeners) cb(pos.x, pos.y);
    });

    canvas.addEventListener('pointermove', (e) => {
      const pos = toLocal(e.clientX, e.clientY);
      if (pointerActive) {
        for (const cb of moveListeners) cb(pos.x, pos.y);
      } else {
        for (const cb of hoverListeners) cb(pos.x, pos.y);
      }
    });

    const endPointer = (e: PointerEvent) => {
      if (!pointerActive) return;
      pointerActive = false;
      const pos = toLocal(e.clientX, e.clientY);
      for (const cb of upListeners) cb(pos.x, pos.y);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
  }

  return {
    canvas,
    ctx,
    width,
    height,
    dpr,
    topInset,
    isWechat,
    onPointerDown(cb) {
      downListeners.push(cb);
    },
    onPointerMove(cb) {
      moveListeners.push(cb);
    },
    onPointerUp(cb) {
      upListeners.push(cb);
    },
    onPointerHover(cb) {
      hoverListeners.push(cb);
    },
    vibrate(type = 'light') {
      if (isWechat && wx && typeof wx.vibrateShort === 'function') {
        try {
          wx.vibrateShort({ type });
        } catch {
          // 忽略不支持震动的设备
        }
      }
    },
  };
}
