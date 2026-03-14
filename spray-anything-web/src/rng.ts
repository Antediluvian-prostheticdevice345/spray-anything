/** Seeded PRNG (xoshiro128**) */
export class SeededRNG {
  private s: number[];

  constructor(seed = 0) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
  }

  private _next(): number {
    const s = this.s;
    const result = ((Math.imul(s[1]! * 5, 1) << 7) | (Math.imul(s[1]! * 5, 1) >>> 25)) * 9;
    const t = s[1]! << 9;
    s[2]! ^= s[0]!;
    s[3]! ^= s[1]!;
    s[1]! ^= s[2]!;
    s[0]! ^= s[3]!;
    s[2] ^= t;
    s[3] = (s[3]! << 11) | (s[3]! >>> 21);
    return (result >>> 0) / 0x100000000;
  }

  /** Uniform float in [0, 1) */
  random(): number {
    return this._next();
  }

  /** Uniform integer in [0, max) */
  randint(max: number): number {
    return (this._next() * max) | 0;
  }

  /** Uniform float in [lo, hi) */
  uniform(lo: number, hi: number): number {
    return lo + this._next() * (hi - lo);
  }

  /** Standard normal via Box-Muller */
  randn(): number {
    const u1 = this._next() || 1e-10;
    const u2 = this._next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
