import "./style.css";
import { type Img, grayToRgb, cloneImg } from "./image.ts";
import { loadImageFromFile, loadImageFromUrl, imgToBlob } from "./canvas-io.ts";
import { sprayAnything } from "./pipeline.ts";

const dropZone = document.getElementById("drop-zone")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const samplesSection = document.getElementById("samples")!;
const debugCheck = document.getElementById("debug-check") as HTMLInputElement;
const progressArea = document.getElementById("progress-area")!;
const progressFill = document.getElementById("progress-bar-fill")!;
const progressLabel = document.getElementById("progress-label")!;
const outputArea = document.getElementById("output-area")!;
const outputImg = document.getElementById("output-img") as HTMLImageElement;
const downloadBtn = document.getElementById("download-btn")!;
const resetBtn = document.getElementById("reset-btn")!;
const debugArea = document.getElementById("debug-area")!;
const debugGrid = document.getElementById("debug-grid")!;

let resultBlobUrl: string | null = null;
const debugBlobUrls: string[] = [];

function revokeDebugUrls() {
  for (const u of debugBlobUrls) URL.revokeObjectURL(u);
  debugBlobUrls.length = 0;
}

function showProgress() {
  dropZone.hidden = true;
  samplesSection.hidden = true;
  progressArea.hidden = false;
  outputArea.hidden = true;
  debugArea.hidden = true;
  debugGrid.innerHTML = "";
  revokeDebugUrls();
}

function showOutput(url: string) {
  progressArea.hidden = true;
  outputArea.hidden = false;
  outputImg.src = url;
}

function showDropZone() {
  dropZone.hidden = false;
  samplesSection.hidden = false;
  progressArea.hidden = true;
  outputArea.hidden = true;
  debugArea.hidden = true;
  if (resultBlobUrl) {
    URL.revokeObjectURL(resultBlobUrl);
    resultBlobUrl = null;
  }
  revokeDebugUrls();
  debugGrid.innerHTML = "";
}

async function debugStepToElement(label: string, img: Img): Promise<void> {
  const vis = img.c === 1 ? grayToRgb(img) : cloneImg(img);
  const blob = await imgToBlob(vis);
  const url = URL.createObjectURL(blob);
  debugBlobUrls.push(url);

  const step = document.createElement("div");
  step.className = "debug-step";

  const stepImg = document.createElement("img");
  stepImg.src = url;
  stepImg.alt = label;

  const stepLabel = document.createElement("span");
  stepLabel.textContent = `${debugGrid.children.length + 1}. ${label}`;

  step.append(stepImg, stepLabel);
  debugGrid.append(step);
}

async function processImage(img: Img) {
  showProgress();
  const debug = debugCheck.checked;
  const debugSteps: { label: string; img: Img }[] = [];

  try {
    const result = await sprayAnything(img, {
      onProgress(step, pct) {
        progressFill.style.width = `${pct}%`;
        progressLabel.textContent = step;
      },
      onDebugStep: debug
        ? (label, stepImg) => {
            debugSteps.push({
              label,
              img: stepImg.c === 1 ? grayToRgb(stepImg) : cloneImg(stepImg),
            });
          }
        : undefined,
    });

    const blob = await imgToBlob(result);
    resultBlobUrl = URL.createObjectURL(blob);
    showOutput(resultBlobUrl);

    if (debug && debugSteps.length > 0) {
      debugArea.hidden = false;
      for (const { label, img: stepImg } of debugSteps) {
        await debugStepToElement(label, stepImg);
      }
    }
  } catch (err) {
    console.error(err);
    progressLabel.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function processFile(file: File) {
  const img = await loadImageFromFile(file);
  await processImage(img);
}

async function processSample(url: string) {
  const img = await loadImageFromUrl(url);
  await processImage(img);
}

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) void processFile(file);
});

dropZone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void processFile(file);
  fileInput.value = "";
});

// Sample images
for (const btn of document.querySelectorAll<HTMLButtonElement>(".sample-btn")) {
  btn.addEventListener("click", () => {
    const src = btn.dataset.src;
    if (src) void processSample(src);
  });
}

// Download
downloadBtn.addEventListener("click", () => {
  if (!resultBlobUrl) return;
  const a = document.createElement("a");
  a.href = resultBlobUrl;
  a.download = "sprayed.png";
  a.click();
});

// Reset
resetBtn.addEventListener("click", showDropZone);

// Checkerboard on output image
outputImg.classList.add("checkerboard");
