// 双端平台适配层：统一微信小游戏与浏览器的 Canvas、安全区、触控/鼠标和震动反馈

interface WechatTouch {
  clientX: number;
  clientY: number;
}

interface WechatTouchEvent {
  touches: WechatTouch[];
  changedTouches: WechatTouch[];
}

interface WechatWindowInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  statusBarHeight?: number;
  safeArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
}

interface WechatGlobal {
  createCanvas(): HTMLCanvasElement;
  getWindowInfo?(): WechatWindowInfo;
  getSystemInfoSync(): WechatWindowInfo;
  getMenuButtonBoundingClientRect?(): { top: number; bottom: number; left: number; right: number };
  onTouchStart(cb: (e: WechatTouchEvent) => void): void;
  onTouchMove(cb: (e: WechatTouchEvent) => void): void;
  onTouchEnd(cb: (e: WechatTouchEvent) => void): void;
  onTouchCancel?(cb: (e: WechatTouchEvent) => void): void;
  vibrateShort?(options?: { type?: 'heavy' | 'medium' | 'light' }): void;
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, data: string): void;
}

declare const wx: WechatGlobal | undefined;

export interface Platform {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  topInset: number;
  readonly bottomInset: number;
  readonly isTouch: boolean;
  isWechat: boolean;
  onPointerDown(cb: (x: number, y: number) => void): void;
  onPointerMove(cb: (x: number, y: number) => void): void;
  onPointerUp(cb: (x: number, y: number) => void): void;
  onPointerHover(cb: (x: number, y: number) => void): void;
  vibrate(type?: 'light' | 'medium' | 'heavy'): void;
  getStorage(key: string): string | null;
  setStorage(key: string, value: string): void;
}

export function createPlatform(): Platform {
  const isWechat = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';

  let canvas: HTMLCanvasElement;
  let width: number;
  let height: number;
  let dpr: number;
  let topInset = 0;
  let bottomInset = 0;
  let isTouch = true;

  if (isWechat && wx) {
    canvas = wx.createCanvas();
    const info =
      typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    if (info.safeArea) {
      bottomInset = Math.max(0, Math.min(width > 0 ? height - info.safeArea.bottom : 0, 48));
    }
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
    isTouch =
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window);
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
      const probe = document.createElement('div');
      try {
        probe.style.cssText = 'position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
        document.body.appendChild(probe);
        const inset = parseFloat(window.getComputedStyle(probe).paddingBottom) || 0;
        bottomInset = Math.max(0, Math.min(inset, 48));
      } catch {
        bottomInset = 0;
      } finally {
        probe.parentNode?.removeChild(probe);
      }
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
    bottomInset,
    isTouch,
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
    getStorage(key: string): string | null {
      try {
        if (isWechat && wx && typeof wx.getStorageSync === 'function') {
          const v = wx.getStorageSync(key);
          return typeof v === 'string' && v.length > 0 ? v : null;
        }
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch {
        // 忽略隐私模式或受限存储环境
      }
      return null;
    },
    setStorage(key: string, value: string): void {
      try {
        if (isWechat && wx && typeof wx.setStorageSync === 'function') {
          wx.setStorageSync(key, value);
          return;
        }
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch {
        // 忽略受限存储环境
      }
    },
  };
}
