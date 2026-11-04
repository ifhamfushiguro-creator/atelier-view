import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Client, handle_file } from '@gradio/client';

if (typeof globalThis.FormData !== 'undefined' && !(globalThis.FormData as any).__jpgPatched) {
  const origAppend = globalThis.FormData.prototype.append;
  globalThis.FormData.prototype.append = function (name: string, value: any, filename?: string) {
    if (
      name === 'files' &&
      value instanceof Blob &&
      !filename &&
      !(value as File).name?.toLowerCase().endsWith('.jpg')
    ) {
      return origAppend.call(
        this,
        name,
        value,
        `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
      );
    }
    return filename !== undefined
      ? origAppend.call(this, name, value, filename)
      : origAppend.call(this, name, value);
  };
  (globalThis.FormData as any).__jpgPatched = true;
}

const makeFileHandles = (paths: string[]) => paths.map((p) => handle_file(p));

export interface ReconstructResponse {
  modelUrl: string;
  engine: string;
  isVideoReconstructed: boolean;
}

const ALLOWED_UPLOAD_EXTS = new Set(['.glb', '.gltf', '.jpg', '.jpeg', '.png', '.webp', '.mp4']);

export function sanitizeFileName(name: string, fallback = 'file'): string {
  const base = path.basename(name || fallback);
  const ext = path.extname(base).toLowerCase();
  const safeExt = ALLOWED_UPLOAD_EXTS.has(ext) ? ext : '.glb';
  const cleanBase = base.slice(0, base.length - ext.length).replace(/[^a-zA-Z0-9_-]/g, '_') || fallback;
  return `${cleanBase}${safeExt}`;
}

export function pruneUploads(dir: string, maxFiles = 20, maxAgeMs = 24 * 3600 * 1000): void {
  try {
    const now = Date.now();
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('reconstructed_') && f.endsWith('.glb'))
      .map((f) => {
        const fullPath = path.join(dir, f);
        return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    files.forEach((file, index) => {
      if (index >= maxFiles || (now - file.mtime) > maxAgeMs) {
        fs.unlinkSync(file.path);
      }
    });
  } catch {
    // Non-critical background disk cleanup
  }
}

export async function reconstructVideoFrames(
  framesBase64: string[],
  fileName: string = 'video_room'
): Promise<ReconstructResponse> {
  const hfToken = process.env.HF_TOKEN as (`hf_${string}` | undefined);
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const tempFramePaths: string[] = [];
  try {
    // Select at most 4 frames to keep naver/MASt3R scenegraph_type = 'complete' (< 5 frames)
    let selectedB64 = framesBase64;
    if (selectedB64.length > 4) {
      const idxs = [
        Math.floor(selectedB64.length * 0.15),
        Math.floor(selectedB64.length * 0.38),
        Math.floor(selectedB64.length * 0.62),
        Math.min(selectedB64.length - 1, Math.floor(selectedB64.length * 0.85))
      ];
      selectedB64 = idxs.map((i) => selectedB64[i]);
    }

    for (let i = 0; i < selectedB64.length; i++) {
      const clean = selectedB64[i].replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(clean, 'base64');
      const tempPath = path.join(os.tmpdir(), `atelier_frame_${Date.now()}_${i}.jpg`);
      fs.writeFileSync(tempPath, buf);
      tempFramePaths.push(tempPath);
    }
    console.log(`[Video-to-3D] 1/4 Saved ${tempFramePaths.length} temp frames`);

    const saveGlbFromPayload = async (
      payloadUrlOrPath: string,
      prefix: string
    ): Promise<string> => {
      let buf: Buffer;
      if (/^https?:\/\//i.test(payloadUrlOrPath)) {
        const res = await fetch(payloadUrlOrPath);
        if (!res.ok) throw new Error(`Failed to download reconstructed GLB: ${res.statusText}`);
        buf = Buffer.from(await res.arrayBuffer());
      } else if (fs.existsSync(payloadUrlOrPath)) {
        buf = fs.readFileSync(payloadUrlOrPath);
      } else {
        throw new Error(`Reconstructed GLB path or URL unreachable: ${payloadUrlOrPath}`);
      }

      if (buf.byteLength < 10240) {
        throw new Error(`Reconstructed GLB file is invalid or too small (${buf.byteLength} bytes)`);
      }

      const safeName = sanitizeFileName(fileName, 'video_room');
      const baseClean = safeName.replace(/\.[^.]+$/, '');
      const outName = `reconstructed_${prefix}_${Date.now()}_${baseClean}.glb`;
      const outPath = path.join(uploadsDir, outName);
      fs.writeFileSync(outPath, buf);
      pruneUploads(uploadsDir);

      const mbSize = (buf.byteLength / (1024 * 1024)).toFixed(2);
      console.log(`[Video-to-3D] 4/4 Saved real .glb (${mbSize} MB) -> /uploads/${outName}`);
      return `/uploads/${outName}`;
    };

    const extractGlbReference = (outputData: unknown): string | null => {
      if (!outputData) return null;
      if (typeof outputData === 'string' && (outputData.includes('.glb') || /^https?:\/\//i.test(outputData))) {
        return outputData;
      }
      if (Array.isArray(outputData)) {
        for (const item of outputData) {
          const found = extractGlbReference(item);
          if (found) return found;
        }
      } else if (typeof outputData === 'object') {
        const obj = outputData as Record<string, unknown>;
        if (typeof obj.url === 'string') return obj.url;
        if (typeof obj.path === 'string') return obj.path;
        for (const val of Object.values(obj)) {
          const found = extractGlbReference(val);
          if (found) return found;
        }
      }
      return null;
    };

    // 1. Primary Engine: naver/MASt3R (4 frames -> complete graph)
    try {
      console.log('[Video-to-3D] 2/4 Connected to HF Space (naver/MASt3R)');
      const client = await Client.connect(
        'naver/MASt3R',
        hfToken ? { token: hfToken } : undefined
      );

      console.log('[Video-to-3D] 3/4 Running 3D mesh reconstruction (4 frames)...');
      let result: any = null;
      try {
        result = await client.predict('/local_get_reconstructed_scene', [
          makeFileHandles(tempFramePaths),
          1.5,   // min_conf_thr
          0.0,   // matching_conf_thr = 0.0 (prevents AssertionError in sparse_ga.py)
          false, // as_pointcloud = false (solid 3D trimesh .glb)
          0.001, // cam_size (hides camera frustum cones)
          true   // shared_intrinsics (single video camera)
        ]);
      } catch (err: any) {
        console.warn('naver/MASt3R 4-frame pass failed, retrying with 2 center frames:', err?.message || err);
        // Fallback retry using middle 2 frames to bypass multi-view sparse alignment assertions
        const pairPaths = tempFramePaths.length >= 2
          ? [tempFramePaths[Math.floor(tempFramePaths.length / 2) - 1], tempFramePaths[Math.floor(tempFramePaths.length / 2)]]
          : tempFramePaths;
        result = await client.predict('/local_get_reconstructed_scene', [
          makeFileHandles(pairPaths),
          1.5,
          0.0,
          false,
          0.001,
          true
        ]);
      }

      const glbRef = extractGlbReference(result?.data);
      if (glbRef) {
        const modelUrl = await saveGlbFromPayload(glbRef, 'mast3r');
        return { modelUrl, engine: 'naver/MASt3R 3D Mesh', isVideoReconstructed: true };
      }
    } catch (err) {
      console.warn('naver/MASt3R failed or busy, falling back to facebook/vggt:', err);
    }

    // 2. Secondary Engine: facebook/vggt (2-step pipeline)
    try {
      console.log('[Video-to-3D] 2/4 Connected to HF Space (facebook/vggt)');
      const vggt = await Client.connect(
        'facebook/vggt',
        hfToken ? { token: hfToken } : undefined
      );

      // Ensure api_info is populated even if Space /info errored
      if (!vggt.api_info) {
        vggt.api_info = {
          named_endpoints: {
            '/update_gallery_on_upload': { parameters: [], returns: [] },
            '/gradio_demo': { parameters: [], returns: [] }
          },
          unnamed_endpoints: {}
        };
      }

      console.log('[Video-to-3D] 3/4 Running 3D mesh reconstruction (facebook/vggt)...');
      const uploadRes = await vggt.predict('/update_gallery_on_upload', [null, makeFileHandles(tempFramePaths)]) as any;
      const uploadData = (uploadRes?.data as unknown[]) || [];
      const targetDir = uploadData[1] || 'sample';

      const vggtRes = await vggt.predict('/gradio_demo', [
        targetDir,
        3.0,
        'All',
        false,
        false,
        false,
        false,
        'Depthmap and Camera Branch'
      ]);

      const vGlbRef = extractGlbReference(vggtRes?.data);
      if (vGlbRef) {
        const modelUrl = await saveGlbFromPayload(vGlbRef, 'vggt');
        return { modelUrl, engine: 'facebook/vggt 3D', isVideoReconstructed: true };
      }
    } catch (err) {
      console.warn('facebook/vggt failed:', err);
    }

    throw new Error('Cloud 3D GPU failed to reconstruct 3D mesh. Please try again or verify HF_TOKEN.');
  } finally {
    for (const p of tempFramePaths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // Temp frame cleanup
      }
    }
  }
}
