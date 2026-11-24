// 确定性种子随机数生成器（Mulberry32），支持状态快照与精确恢复

export class SeededRng {
  private state: number;

  constructor(seed: number, savedState?: number) {
    if (savedState !== undefined) {
      this.state = savedState >>> 0;
    } else {
      // 将任意整数种子映射到非零 uint32 初始状态
      this.state = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
    }
  }

  public getState(): number {
    return this.state >>> 0;
  }

  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [min, max] 闭区间内的整数 */
  public randiRange(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }
}
