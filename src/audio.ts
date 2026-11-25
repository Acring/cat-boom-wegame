// 零依赖双端轻量程序音效引擎：兼容浏览器 WebAudio 与微信小游戏 wx.createWebAudioContext

interface MinimalGainParam {
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

interface MinimalOscillator {
  type: OscillatorType;
  frequency: MinimalGainParam;
  connect(dest: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

interface MinimalGainNode {
  gain: MinimalGainParam;
  connect(dest: unknown): void;
}

interface MinimalAudioContext {
  currentTime: number;
  state?: string;
  destination: unknown;
  resume?(): Promise<void> | void;
  createOscillator(): MinimalOscillator;
  createGain(): MinimalGainNode;
}

interface WechatAudioGlobal {
  createWebAudioContext?(): MinimalAudioContext;
}

declare const wx: WechatAudioGlobal | undefined;

export class SoundEngine {
  private ctx: MinimalAudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** 在用户首次交互时惰性初始化并恢复音频上下文 */
  public unlock(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        void ctx.resume();
      }
    } catch {
      // 忽略旧环境不支持 resume
    }
  }

  private ensureContext(): MinimalAudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
        this.ctx = wx.createWebAudioContext();
        return this.ctx;
      }
      if (typeof window !== 'undefined') {
        const w = window as unknown as {
          AudioContext?: new () => MinimalAudioContext;
          webkitAudioContext?: new () => MinimalAudioContext;
        };
        const Ctor = w.AudioContext || w.webkitAudioContext;
        if (Ctor) {
          this.ctx = new Ctor();
          return this.ctx;
        }
      }
    } catch {
      this.ctx = null;
    }
    return null;
  }

  private tone(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    duration: number,
    volume: number,
    delay = 0
  ): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        void ctx.resume();
      }
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(40, freqStart), now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.015, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // 静默降级，绝不影响主流程
    }
  }

  /** 拎起小猫：软萌轻弹啵声 */
  public playGrab(): void {
    this.tone('sine', 340, 560, 0.085, 0.11);
  }

  /** 确认交换落位：轻快碰击 */
  public playSwap(): void {
    this.tone('triangle', 280, 420, 0.09, 0.1);
  }

  /** 非法交换反馈：低沉短促嘟声 */
  public playInvalid(): void {
    this.tone('sine', 210, 150, 0.12, 0.09);
  }

  /** 合成大猫/炫彩猫：清亮上行铃音 */
  public playMerge(level: 2 | 3 = 2): void {
    if (level === 3) {
      this.tone('triangle', 523.25, 587.33, 0.12, 0.13, 0);
      this.tone('triangle', 659.25, 783.99, 0.14, 0.14, 0.07);
      this.tone('sine', 1046.5, 1174.66, 0.22, 0.14, 0.14);
    } else {
      this.tone('triangle', 493.88, 659.25, 0.11, 0.12, 0);
      this.tone('sine', 783.99, 880, 0.15, 0.11, 0.06);
    }
  }

  /** 逐波引爆：低频冲击 + 随波次爬升的爽感爆音 */
  public playBlast(waveIndex: number): void {
    const pitchBoost = Math.pow(1.16, Math.min(waveIndex, 5));
    // 低频重击
    this.tone('sawtooth', 165 * pitchBoost, 52, 0.22, 0.16, 0);
    // 高亮冲击闪音
    this.tone('triangle', 440 * pitchBoost, 680 * pitchBoost, 0.14, 0.12, 0.02);
    if (waveIndex > 0) {
      // 二次及以上连爆追加清亮泛音
      this.tone('sine', 740 * pitchBoost, 987.77 * pitchBoost, 0.18, 0.11, 0.06);
    }
  }

  /** 第 2 轮及以上连锁提示音 */
  public playCombo(roundNumber: number): void {
    const base = 523.25 * Math.pow(1.12, Math.min(roundNumber - 2, 5));
    this.tone('sine', base, base * 1.25, 0.12, 0.12, 0);
    this.tone('triangle', base * 1.25, base * 1.5, 0.16, 0.11, 0.06);
  }

  /** 拆穿 Boss 意图 / 选卡确认 */
  public playChime(): void {
    this.tone('triangle', 587.33, 783.99, 0.1, 0.11, 0);
    this.tone('sine', 880, 1046.5, 0.16, 0.11, 0.07);
  }

  /** 击败 Boss / 通关短旋律 */
  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.tone('triangle', f, f, 0.16, 0.13, idx * 0.085);
    });
  }

  /** 战败短旋律 */
  public playDefeat(): void {
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((f, idx) => {
      this.tone('sine', f, f * 0.96, 0.18, 0.11, idx * 0.1);
    });
  }
}
