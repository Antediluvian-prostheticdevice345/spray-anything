import {
  type Img,
  createImg,
  cloneImg,
  clamp,
  toGrayscale,
  grayToRgb,
  fade,
  roll,
  threshold,
  maxImages,
  bitwiseOr,
  levels,
} from "./image.ts";
import { SeededRNG } from "./rng.ts";
import {
  ripple,
  motionBlur,
  displace,
  mezzotint,
  sobel5x5,
  dilate,
  erode,
  generateClouds,
} from "./effects.ts";
import { loadImageFromUrl, gaussianBlur, resizeImg } from "./canvas-io.ts";

const MAX_DIM = 1500;

export type ProgressCallback = (step: string, pct: number) => void;
export type DebugCallback = (label: string, img: Img) => void;

export interface SprayOptions {
  onProgress?: ProgressCallback;
  onDebugStep?: DebugCallback;
}

/** Yield to the browser so the UI can update */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function sprayAnything(inputImg: Img, options: SprayOptions = {}): Promise<Img> {
  const { onProgress = () => {}, onDebugStep } = options;

  const dbg = (label: string, img: Img) => {
    if (onDebugStep) onDebugStep(label, img);
  };

  // Cap input size
  let img: Img;
  if (inputImg.w > MAX_DIM || inputImg.h > MAX_DIM) {
    const scale = MAX_DIM / Math.max(inputImg.w, inputImg.h);
    const nw = Math.round(inputImg.w * scale);
    const nh = Math.round(inputImg.h * scale);
    img = resizeImg(inputImg, nw, nh);
  } else {
    img = cloneImg(inputImg);
  }

  const { w, h } = img;
  const n = w * h;
  onProgress("Loading spray map...", 0);
  await yieldToUI();

  const sprayMapFull = await loadImageFromUrl("/SprayMap_composite.png");
  const sprayMap = resizeImg(sprayMapFull, w, h);
  const original = cloneImg(img);

  dbg("original", img);
  dbg("spray map", sprayMap);

  // 1. Initial distortion
  onProgress("Ripple distortion...", 5);
  await yieldToUI();
  img = ripple(img, 14, "large");
  dbg("ripple 14 large", img);

  onProgress("Motion blur...", 10);
  await yieldToUI();
  img = roll(img, 6, 6);
  img = motionBlur(img, -27, 12);
  dbg("offset + motion blur", img);

  // 2. Six displacement passes
  const dispParams: [number, number, number][] = [
    [120, 120, 75],
    [120, -120, 75],
    [0, 120, 75],
    [120, 0, 75],
    [999, 999, 75],
    [-999, 999, 25],
  ];
  for (let i = 0; i < dispParams.length; i++) {
    const [hs, vs, fp] = dispParams[i]!;
    onProgress(`Displacement pass ${i + 1}/6...`, 15 + i * 5);
    await yieldToUI();
    const pre = cloneImg(img);
    img = displace(img, sprayMap, hs, vs);
    img = fade(pre, img, fp);
    dbg(`displace (${hs},${vs}) fade ${fp}%`, img);
  }

  dbg("6-pass displaced", cloneImg(img));

  onProgress("Blending displaced...", 45);
  await yieldToUI();
  img = fade(original, img, 70);
  const displaced = cloneImg(img);
  dbg("blend 70% displaced", img);

  // 3. Spray coverage texture
  onProgress("Generating clouds...", 50);
  await yieldToUI();
  const clouds = generateClouds(h, w, 42);
  dbg("clouds", clouds);

  onProgress("Mezzotint...", 53);
  await yieldToUI();
  const rngMezz = new SeededRNG(99);
  const mezz = mezzotint(clouds, rngMezz);
  dbg("mezzotint", mezz);

  let coverage: Img = fade(clouds, mezz, 50);
  coverage = levels(coverage, 8, 194);
  // motionBlur works on any channel count; skip gray→RGB→gray round-trip
  coverage = motionBlur(coverage, -27, 6);
  dbg("coverage mask", coverage);

  onProgress("Applying coverage...", 56);
  await yieldToUI();
  const slightOriginal = fade(original, displaced, 90);
  const covOut = createImg(w, h, 3);
  for (let i = 0; i < n; i++) {
    const cf = coverage.data[i]! / 255;
    for (let ch = 0; ch < 3; ch++) {
      covOut.data[i * 3 + ch] =
        displaced.data[i * 3 + ch]! * cf + slightOriginal.data[i * 3 + ch]! * (1 - cf);
    }
  }
  img = covOut;
  dbg("coverage applied", img);

  // 4. Edge speckles
  onProgress("Edge detection...", 60);
  await yieldToUI();
  const grayOrig = toGrayscale(original);
  const grad = sobel5x5(grayOrig);

  onProgress("Dilating edges...", 65);
  await yieldToUI();
  const edgeZone = dilate(grad, 51);
  const edgeBlurred = gaussianBlur(grayToRgb(edgeZone), 20);
  const edgeF = toGrayscale(edgeBlurred);
  for (let i = 0; i < edgeF.data.length; i++) edgeF.data[i] /= 255;
  dbg("edge zone", edgeZone);

  onProgress("Generating speckles...", 70);
  await yieldToUI();
  const rngDots = new SeededRNG(777);
  const fineDots = createImg(w, h, 1);
  for (let i = 0; i < n; i++) {
    fineDots.data[i] = clamp((rngDots.randint(256) * 52) / 100);
  }
  let dots1 = threshold(fineDots, 128);
  dots1 = erode(dots1, 3);
  // ripple/remap works on 1-channel directly; skip gray→RGB→gray round-trip
  dots1 = ripple(dots1, 150, "medium");
  dbg("fine dots", dots1);

  onProgress("Large dots...", 75);
  await yieldToUI();
  function makeDots(rng: SeededRNG): Img {
    const d = createImg(w, h, 1);
    for (let i = 0; i < n; i++) {
      d.data[i] = clamp(128 + ((rng.randint(256) - 128) * 50) / 100);
    }
    return threshold(d, 253);
  }
  const rngD2a = new SeededRNG(888),
    rngD2b = new SeededRNG(999);
  let dots2 = bitwiseOr(makeDots(rngD2a), makeDots(rngD2b));
  dots2 = dilate(dots2, 13);
  dots2 = ripple(dots2, 150, "medium");
  dbg("large dots", dots2);

  const allDots = maxImages(dots1, dots2);
  const speckleWeight = createImg(w, h, 1);
  for (let i = 0; i < n; i++) {
    speckleWeight.data[i] = Math.min(1, (allDots.data[i]! / 255) * edgeF.data[i]! * 2);
  }

  onProgress("Applying speckles...", 80);
  await yieldToUI();
  const heavyDisp = displace(displaced, sprayMap, 150, 150);
  for (let i = 0; i < n; i++) {
    const sw = speckleWeight.data[i]!;
    for (let ch = 0; ch < 3; ch++) {
      img.data[i * 3 + ch] = heavyDisp.data[i * 3 + ch]! * sw + img.data[i * 3 + ch]! * (1 - sw);
    }
  }
  dbg("speckles applied", img);

  // 5. Paint grain
  onProgress("Paint grain...", 85);
  await yieldToUI();
  const gray = toGrayscale(img);
  const rngGrain = new SeededRNG(555);
  for (let i = 0; i < n; i++) {
    const g = rngGrain.randint(256);
    const mask = g < gray.data[i]! ? 1 : 0;
    const darkFactor = 0.85;
    for (let ch = 0; ch < 3; ch++) {
      const v = img.data[i * 3 + ch]!;
      img.data[i * 3 + ch] = v * mask + v * darkFactor * (1 - mask);
    }
  }
  dbg("paint grain", img);

  // 6. Sharpen
  onProgress("Sharpening...", 92);
  await yieldToUI();
  const blurred04 = gaussianBlur(img, 0.4);
  const blurred2 = gaussianBlur(blurred04, 2.0);
  for (let i = 0; i < blurred04.data.length; i++) {
    img.data[i] = clamp(blurred04.data[i]! + (blurred04.data[i]! - blurred2.data[i]!));
  }
  dbg("sharpen (final)", img);

  onProgress("Done!", 100);
  return img;
}
