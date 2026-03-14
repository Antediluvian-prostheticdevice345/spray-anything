export interface Img {
  data: Float32Array;
  w: number;
  h: number;
  c: number;
}

export function createImg(w: number, h: number, c = 3, fill = 0): Img {
  const data = new Float32Array(w * h * c);
  if (fill !== 0) data.fill(fill);
  return { data, w, h, c };
}

export function cloneImg(img: Img): Img {
  return { data: new Float32Array(img.data), w: img.w, h: img.h, c: img.c };
}

export function clamp(v: number, lo = 0, hi = 255): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function reflectCoord(v: number, max: number): number {
  if (v < 0) v = -v;
  if (v >= max) {
    const period = max * 2;
    v = v % period;
    if (v >= max) v = period - v - 1;
  }
  return v;
}

export function toGrayscale(img: Img): Img {
  const out = createImg(img.w, img.h, 1);
  const n = img.w * img.h;
  for (let i = 0; i < n; i++) {
    out.data[i] =
      0.299 * img.data[i * 3]! + 0.587 * img.data[i * 3 + 1]! + 0.114 * img.data[i * 3 + 2]!;
  }
  return out;
}

export function grayToRgb(gray: Img): Img {
  const out = createImg(gray.w, gray.h, 3);
  const n = gray.w * gray.h;
  for (let i = 0; i < n; i++) {
    out.data[i * 3] = out.data[i * 3 + 1] = out.data[i * 3 + 2] = gray.data[i]!;
  }
  return out;
}

export function fade(orig: Img, filt: Img, pct: number): Img {
  const a = pct / 100;
  const b = 1 - a;
  const out = createImg(orig.w, orig.h, orig.c);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = clamp(filt.data[i]! * a + orig.data[i]! * b);
  }
  return out;
}

export function roll(img: Img, dx: number, dy: number): Img {
  const out = createImg(img.w, img.h, img.c);
  const { w, h, c } = img;
  for (let y = 0; y < h; y++) {
    const sy = (((y - dy) % h) + h) % h;
    for (let x = 0; x < w; x++) {
      const sx = (((x - dx) % w) + w) % w;
      const di = (y * w + x) * c;
      const si = (sy * w + sx) * c;
      for (let ch = 0; ch < c; ch++) out.data[di + ch] = img.data[si + ch]!;
    }
  }
  return out;
}

export function threshold(gray: Img, thresh: number): Img {
  const out = createImg(gray.w, gray.h, 1);
  for (let i = 0; i < gray.data.length; i++) {
    out.data[i] = gray.data[i]! > thresh ? 255 : 0;
  }
  return out;
}

export function maxImages(a: Img, b: Img): Img {
  const out = createImg(a.w, a.h, a.c);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.max(a.data[i]!, b.data[i]!);
  }
  return out;
}

export function bitwiseOr(a: Img, b: Img): Img {
  return maxImages(a, b);
}

export function levels(gray: Img, lo: number, hi: number): Img {
  const out = createImg(gray.w, gray.h, 1);
  const range = Math.max(hi - lo, 1);
  for (let i = 0; i < gray.data.length; i++) {
    out.data[i] = clamp(((gray.data[i]! - lo) / range) * 255);
  }
  return out;
}
