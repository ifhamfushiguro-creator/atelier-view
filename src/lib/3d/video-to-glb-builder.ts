export interface ReconstructedGlbResult {
  glbUrl: string;
  glbFileName: string;
  isVideoReconstructed: boolean;
  engine?: string;
}

interface FrameStats {
  sharpness: number;
  brightness: number;
  fingerprint: number[];
}

function analyzeCanvasFrame(ctx: CanvasRenderingContext2D, w: number, h: number): FrameStats {
  const imgData = ctx.getImageData?.(0, 0, w, h);
  if (!imgData) return { sharpness: 1, brightness: 128, fingerprint: new Array(64 * 3).fill(128) };
  const d = imgData.data;

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let totalLum = 0;
  let lumCount = 0;

  for (let y = 1; y < h - 1; y += 2) {
    const row = y * w;
    const prev = (y - 1) * w;
    const next = (y + 1) * w;
    for (let x = 1; x < w - 1; x += 2) {
      const idx = (row + x) * 4;
      const c = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
      const u = d[(prev + x) * 4] * 0.299 + d[(prev + x) * 4 + 1] * 0.587 + d[(prev + x) * 4 + 2] * 0.114;
      const dn = d[(next + x) * 4] * 0.299 + d[(next + x) * 4 + 1] * 0.587 + d[(next + x) * 4 + 2] * 0.114;
      const l = d[(row + x - 1) * 4] * 0.299 + d[(row + x - 1) * 4 + 1] * 0.587 + d[(row + x - 1) * 4 + 2] * 0.114;
      const r = d[(row + x + 1) * 4] * 0.299 + d[(row + x + 1) * 4 + 1] * 0.587 + d[(row + x + 1) * 4 + 2] * 0.114;
      const lap = c * -4 + u + dn + l + r;
      sum += lap;
      sumSq += lap * lap;
      count++;
      totalLum += c;
      lumCount++;
    }
  }

  const sharpness = count > 0 ? sumSq / count - (sum / count) ** 2 : 1;
  const brightness = lumCount > 0 ? totalLum / lumCount : 128;

  // 8x8 color fingerprint (192 values)
  const fingerprint: number[] = new Array(64 * 3).fill(0);
  const cellW = w / 8;
  const cellH = h / 8;
  for (let gy = 0; gy < 8; gy++) {
    const py = Math.min(h - 1, Math.floor((gy + 0.5) * cellH));
    const row = py * w;
    for (let gx = 0; gx < 8; gx++) {
      const px = Math.min(w - 1, Math.floor((gx + 0.5) * cellW));
      const idx = (row + px) * 4;
      const fIdx = (gy * 8 + gx) * 3;
      fingerprint[fIdx] = d[idx];
      fingerprint[fIdx + 1] = d[idx + 1];
      fingerprint[fIdx + 2] = d[idx + 2];
    }
  }

  return { sharpness, brightness, fingerprint };
}

function compareFingerprints(fpA: number[], fpB: number[]): number {
  if (!fpA || !fpB || fpA.length !== fpB.length || fpA.length === 0) return 0;
  let diff = 0;
  for (let i = 0; i < fpA.length; i++) {
    diff += Math.abs(fpA[i] - fpB[i]);
  }
  return diff / fpA.length;
}

export function generateSampleFramesBase64(count = 4): string[] {
  const frames: string[] = [];
  if (typeof document === 'undefined') return frames;
  const canvas = document.createElement('canvas');
  canvas.width = 518;
  canvas.height = 294;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const palettes = ['#1a1918', '#262420', '#302b24', '#21262d', '#1f2421', '#2c221e', '#231e24', '#1e2426'];
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = palettes[i % palettes.length];
    ctx.fillRect(0, 0, 518, 294);
    ctx.strokeStyle = 'rgba(212, 180, 131, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 478, 254);
    ctx.fillStyle = '#D4B483';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ATELIER CONTINUOUS VIEW 0${i + 1}`, 259, 147);
    frames.push(canvas.toDataURL('image/jpeg', 0.90));
  }
  return frames;
}

export async function extractMultiViewFramesFromVideo(
  videoFile: File | Blob,
  count = 4,
  onProgress?: (stage: string, percent: number) => void
): Promise<string[]> {
  return new Promise((resolve) => {
    onProgress?.('Finding continuous single-room walkthrough segment...', 10);
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(generateSampleFramesBase64(count));
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove?.();
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(generateSampleFramesBase64(count));
    }, 20000);

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(generateSampleFramesBase64(count));
    };

    video.onloadedmetadata = async () => {
      const dur = Math.max(1, video.duration || 5);
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // Exact 518x294 canvas (VGGT patch-14 compliant: 37*14 x 21*14)
      const outCanvas = document.createElement('canvas');
      outCanvas.width = 518;
      outCanvas.height = 294;
      const outCtx = outCanvas.getContext('2d');

      // Center crop coordinates to 16:9 (518:294)
      const targetRatio = 518 / 294;
      const videoRatio = vw / vh;
      let cropW: number, cropH: number, cropX: number, cropY: number;
      if (videoRatio > targetRatio) {
        cropH = vh;
        cropW = Math.round(vh * targetRatio);
        cropX = Math.round((vw - cropW) / 2);
        cropY = 0;
      } else {
        cropW = vw;
        cropH = Math.round(vw / targetRatio);
        cropX = 0;
        cropY = Math.round((vh - cropH) / 2);
      }

      // Small scoring canvas for sharpness & scene-cut guard
      const scoreCanvas = document.createElement('canvas');
      scoreCanvas.width = 128;
      scoreCanvas.height = 72;
      const scoreCtx = scoreCanvas.getContext('2d');

      const seek = (time: number): Promise<void> =>
        new Promise((r) => {
          video.currentTime = Math.min(dur - 0.05, Math.max(0.05, time));
          video.onseeked = () => r();
        });

      const frameStep = Math.min(1.2, Math.max(0.5, (dur * 0.35) / count));
      const windowDuration = (count - 1) * frameStep;

      // Candidate starting times (~15%-20% into video, shift if scene cuts detected)
      const idealStart = Math.max(0.1, dur * 0.18);
      const candidateStarts: number[] = [idealStart];
      for (let offset = 5.0; offset <= dur - windowDuration - 0.5; offset += 5.0) {
        candidateStarts.push(Math.min(dur - windowDuration - 0.1, idealStart + offset));
      }
      if (candidateStarts.length === 1 && dur > windowDuration + 0.2) {
        candidateStarts.push(Math.max(0.1, (dur - windowDuration) * 0.5));
      }

      interface SampledFrame {
        time: number;
        sharpness: number;
        brightness: number;
        fingerprint: number[];
      }

      let bestWindowFrames: SampledFrame[] = [];
      let bestWindowScore = -1;

      for (let wIdx = 0; wIdx < candidateStarts.length; wIdx++) {
        const startT = candidateStarts[wIdx];
        if (startT + windowDuration >= dur) continue;

        const currentWindow: SampledFrame[] = [];
        let hasHardCut = false;

        for (let i = 0; i < count; i++) {
          const centerT = startT + i * frameStep;
          // Sample 3 micro-offsets (±0.15s) to pick the sharpest sub-frame
          const microTimes = [
            Math.max(0.05, centerT - 0.15),
            centerT,
            Math.min(dur - 0.05, centerT + 0.15)
          ];

          let bestMicro: SampledFrame | null = null;
          for (const mt of microTimes) {
            await seek(mt);
            if (scoreCtx) {
              scoreCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 128, 72);
              const stats = analyzeCanvasFrame(scoreCtx, 128, 72);
              if (stats.brightness < 15 || stats.brightness > 245) continue;
              if (!bestMicro || stats.sharpness > bestMicro.sharpness) {
                bestMicro = {
                  time: mt,
                  sharpness: stats.sharpness,
                  brightness: stats.brightness,
                  fingerprint: stats.fingerprint
                };
              }
            }
          }

          if (!bestMicro) {
            hasHardCut = true;
            break;
          }

          if (currentWindow.length > 0) {
            const prev = currentWindow[currentWindow.length - 1];
            const cutDiff = compareFingerprints(prev.fingerprint, bestMicro.fingerprint);
            // If hard cut detected (>38 avg channel difference), abandon this window
            if (cutDiff > 38) {
              hasHardCut = true;
              break;
            }
          }

          currentWindow.push(bestMicro);
        }

        if (currentWindow.length === count && !hasHardCut) {
          const avgSharpness = currentWindow.reduce((acc, f) => acc + f.sharpness, 0) / count;
          if (avgSharpness > bestWindowScore) {
            bestWindowScore = avgSharpness;
            bestWindowFrames = currentWindow;
          }
          break;
        } else if (currentWindow.length === count && bestWindowFrames.length === 0) {
          bestWindowFrames = currentWindow;
        }
      }

      // If no candidate window succeeded cleanly, fallback to even spacing
      if (bestWindowFrames.length < count) {
        bestWindowFrames = [];
        for (let i = 0; i < count; i++) {
          const t = Math.max(0.1, Math.min(dur - 0.1, (dur * 0.15) + i * frameStep));
          bestWindowFrames.push({ time: t, sharpness: 1, brightness: 128, fingerprint: [] });
        }
      }

      // Render the 4 continuous frames onto exact 518x294 canvas
      const frames: string[] = [];
      for (let i = 0; i < bestWindowFrames.length; i++) {
        const frameInfo = bestWindowFrames[i];
        await seek(frameInfo.time);
        if (outCtx) {
          outCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 518, 294);
          frames.push(outCanvas.toDataURL('image/jpeg', 0.90));
        }
        onProgress?.(
          `Extracting continuous room frame ${i + 1} of ${count}...`,
          25 + Math.round(((i + 1) / count) * 45)
        );
      }

      clearTimeout(timeout);
      cleanup();
      resolve(frames.length > 0 ? frames : generateSampleFramesBase64(count));
    };
  });
}

export async function buildGlbFromVideo(
  videoFile: File | Blob,
  onProgress?: (stage: string, percent: number) => void
): Promise<ReconstructedGlbResult> {
  onProgress?.('Extracting 4 continuous room frames at 518x294 (facebook/vggt)...', 20);
  const framesBase64 = await extractMultiViewFramesFromVideo(videoFile, 4, onProgress);

  onProgress?.('Connecting to Hugging Face ZeroGPU (facebook/vggt)...', 55);
  const fileName = (videoFile as File).name || 'walkthrough_video';

  const res = await fetch('/api/3d/reconstruct-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ framesBase64, fileName }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `3D reconstruction failed with status ${res.status}`);
  }

  const data = await res.json();
  onProgress?.('Solid 3D Mesh Reconstructed', 100);
  return {
    glbUrl: data.modelUrl,
    glbFileName: `${fileName.replace(/\.[^.]+$/, '')}_reconstructed.glb`,
    isVideoReconstructed: true,
    engine: data.engine,
  };
}
