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

export function convertPointCloudGlbToSolidMeshGlb(glbBuffer: Buffer, numFrames = 4): Buffer {
  if (!glbBuffer || glbBuffer.byteLength < 20) return glbBuffer;
  if (glbBuffer.readUInt32LE(0) !== 0x46546C67) return glbBuffer; // "glTF"
  if (glbBuffer.readUInt32LE(4) !== 2) return glbBuffer; // version 2

  const chunk0Len = glbBuffer.readUInt32LE(12);
  const chunk0Type = glbBuffer.readUInt32LE(16);
  if (chunk0Type !== 0x4E4F534A) return glbBuffer; // "JSON"

  const jsonStr = glbBuffer.toString('utf-8', 20, 20 + chunk0Len);
  let gltf: any;
  try {
    gltf = JSON.parse(jsonStr);
  } catch {
    return glbBuffer;
  }

  const binOff = 20 + chunk0Len;
  if (binOff + 8 > glbBuffer.byteLength) return glbBuffer;
  const chunk1Len = glbBuffer.readUInt32LE(binOff);
  const chunk1Type = glbBuffer.readUInt32LE(binOff + 4);
  if (chunk1Type !== 0x004E4942) return glbBuffer; // "BIN\0"
  const binData = glbBuffer.subarray(binOff + 8, binOff + 8 + chunk1Len);

  const prim = gltf.meshes?.[0]?.primitives?.[0];
  if (!prim) return glbBuffer;
  // If not points (e.g. already triangles mode 4) or already indexed with triangles, keep original
  if (prim.mode !== undefined && prim.mode !== 0) return glbBuffer;
  if (prim.indices !== undefined && prim.mode !== 0) return glbBuffer;

  const posIdx = prim.attributes?.POSITION;
  if (posIdx === undefined || !gltf.accessors?.[posIdx]) return glbBuffer;
  const posAcc = gltf.accessors[posIdx];
  const posBv = gltf.bufferViews[posAcc.bufferView];
  const posOffset = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
  const N = posAcc.count;
  if (N < 3) return glbBuffer;

  const posArray = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) {
    posArray[i] = binData.readFloatLE(posOffset + i * 4);
  }

  const rgbaArray = new Uint8Array(N * 4);
  const colIdx = prim.attributes?.COLOR_0;
  if (colIdx !== undefined && gltf.accessors?.[colIdx]) {
    const colAcc = gltf.accessors[colIdx];
    const colBv = gltf.bufferViews[colAcc.bufferView];
    const colOffset = (colBv.byteOffset || 0) + (colAcc.byteOffset || 0);
    const isVec4 = colAcc.type === 'VEC4';
    const numComp = isVec4 ? 4 : 3;
    const isFloat = colAcc.componentType === 5126;
    const isUByte = colAcc.componentType === 5121;
    for (let i = 0; i < N; i++) {
      const base = colOffset + i * numComp * (isFloat ? 4 : 1);
      let r = 220, g = 220, b = 220, a = 255;
      if (isFloat) {
        r = Math.min(255, Math.max(0, Math.round(binData.readFloatLE(base) * 255)));
        g = Math.min(255, Math.max(0, Math.round(binData.readFloatLE(base + 4) * 255)));
        b = Math.min(255, Math.max(0, Math.round(binData.readFloatLE(base + 8) * 255)));
        if (isVec4) a = Math.min(255, Math.max(0, Math.round(binData.readFloatLE(base + 12) * 255)));
      } else if (isUByte) {
        r = binData[base];
        g = binData[base + 1];
        b = binData[base + 2];
        if (isVec4) a = binData[base + 3];
      }
      rgbaArray[i * 4] = r;
      rgbaArray[i * 4 + 1] = g;
      rgbaArray[i * 4 + 2] = b;
      rgbaArray[i * 4 + 3] = a;
    }
  } else {
    rgbaArray.fill(220);
    for (let i = 0; i < N; i++) rgbaArray[i * 4 + 3] = 255;
  }

  // Pre-flip orientation: negate y and z so Three.js rotation.x = Math.PI leaves room upright
  for (let i = 0; i < N; i++) {
    posArray[i * 3 + 1] = -posArray[i * 3 + 1];
    posArray[i * 3 + 2] = -posArray[i * 3 + 2];
  }

  // Infer per-frame grid dimensions (S, H, W)
  let S = Math.max(1, numFrames);
  let W = 518;
  let H = 294;

  if (N % (S * 518) === 0) {
    W = 518;
    H = Math.floor(N / (S * 518));
  } else if (N % 518 === 0) {
    W = 518;
    const tot = N / 518;
    S = tot % numFrames === 0 ? numFrames : 1;
    H = Math.floor(tot / S);
  } else {
    const candidates = [518, 504, 532, 644, 448, 378, 256, 128, 64, 32, 16, 14, 10];
    let found = false;
    for (const c of candidates) {
      if (N % (S * c) === 0) {
        W = c;
        H = Math.floor(N / (S * c));
        found = true;
        break;
      }
    }
    if (!found) {
      const perFrame = Math.floor(N / S);
      W = Math.max(2, Math.round(Math.sqrt(perFrame * (16 / 9))));
      H = Math.max(2, Math.floor(perFrame / W));
    }
  }

  // Compute 2nd and 98th percentile bounding box
  const sampleStep = Math.max(1, Math.floor(N / 4000));
  const sampleX: number[] = [];
  const sampleY: number[] = [];
  const sampleZ: number[] = [];
  for (let i = 0; i < N; i += sampleStep) {
    const x = posArray[i * 3];
    const y = posArray[i * 3 + 1];
    const z = posArray[i * 3 + 2];
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      sampleX.push(x);
      sampleY.push(y);
      sampleZ.push(z);
    }
  }
  if (sampleX.length < 3) return glbBuffer;

  sampleX.sort((a, b) => a - b);
  sampleY.sort((a, b) => a - b);
  sampleZ.sort((a, b) => a - b);

  const x02 = sampleX[Math.floor(sampleX.length * 0.02)];
  const x98 = sampleX[Math.floor(sampleX.length * 0.98)];
  const y02 = sampleY[Math.floor(sampleY.length * 0.02)];
  const y98 = sampleY[Math.floor(sampleY.length * 0.98)];
  const z02 = sampleZ[Math.floor(sampleZ.length * 0.02)];
  const z98 = sampleZ[Math.floor(sampleZ.length * 0.98)];

  const dx = Math.max(0.01, x98 - x02);
  const dy = Math.max(0.01, y98 - y02);
  const dz = Math.max(0.01, z98 - z02);
  const sceneScale = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1.0;
  const maxEdge = Math.max(0.05, sceneScale * (W >= 100 ? 0.06 : 0.35));
  const maxEdgeSq = maxEdge * maxEdge;

  const minX = x02 - dx * 2.0; const maxX = x98 + dx * 2.0;
  const minY = y02 - dy * 2.0; const maxY = y98 + dy * 2.0;
  const minZ = z02 - dz * 2.0; const maxZ = z98 + dz * 2.0;

  function isValidVertex(idx: number): boolean {
    const x = posArray[idx * 3];
    const y = posArray[idx * 3 + 1];
    const z = posArray[idx * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) return false;
    return true;
  }

  function edgeDistSq(a: number, b: number): number {
    const dX = posArray[a * 3] - posArray[b * 3];
    const dY = posArray[a * 3 + 1] - posArray[b * 3 + 1];
    const dZ = posArray[a * 3 + 2] - posArray[b * 3 + 2];
    return dX * dX + dY * dY + dZ * dZ;
  }

  const step = (H >= 32 && W >= 32) ? 2 : 1;
  const newIndexMap = new Int32Array(N).fill(-1);
  const compactedPos: number[] = [];
  const compactedCol: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;

  function getOrAddVertex(origIdx: number): number {
    let mapped = newIndexMap[origIdx];
    if (mapped === -1) {
      mapped = vertexCount++;
      newIndexMap[origIdx] = mapped;
      compactedPos.push(posArray[origIdx * 3], posArray[origIdx * 3 + 1], posArray[origIdx * 3 + 2]);
      compactedCol.push(rgbaArray[origIdx * 4], rgbaArray[origIdx * 4 + 1], rgbaArray[origIdx * 4 + 2], rgbaArray[origIdx * 4 + 3]);
    }
    return mapped;
  }

  for (let s = 0; s < S; s++) {
    const frameOffset = s * H * W;
    for (let r = 0; r <= H - 1 - step; r += step) {
      for (let c = 0; c <= W - 1 - step; c += step) {
        const v00 = frameOffset + r * W + c;
        const v01 = frameOffset + r * W + (c + step);
        const v10 = frameOffset + (r + step) * W + c;
        const v11 = frameOffset + (r + step) * W + (c + step);

        if (isValidVertex(v00) && isValidVertex(v01) && isValidVertex(v10)) {
          const d01 = edgeDistSq(v00, v01);
          const d12 = edgeDistSq(v01, v10);
          const d20 = edgeDistSq(v10, v00);
          if (d01 < maxEdgeSq && d12 < maxEdgeSq && d20 < maxEdgeSq) {
            const m00 = getOrAddVertex(v00);
            const m01 = getOrAddVertex(v01);
            const m10 = getOrAddVertex(v10);
            indices.push(m00, m01, m10, m00, m10, m01);
          }
        }

        if (isValidVertex(v01) && isValidVertex(v11) && isValidVertex(v10)) {
          const d01 = edgeDistSq(v01, v11);
          const d12 = edgeDistSq(v11, v10);
          const d20 = edgeDistSq(v10, v01);
          if (d01 < maxEdgeSq && d12 < maxEdgeSq && d20 < maxEdgeSq) {
            const m01 = getOrAddVertex(v01);
            const m11 = getOrAddVertex(v11);
            const m10 = getOrAddVertex(v10);
            indices.push(m01, m11, m10, m01, m10, m11);
          }
        }
      }
    }
  }

  if (indices.length === 0) return glbBuffer;

  let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
  let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const px = compactedPos[i * 3]; const py = compactedPos[i * 3 + 1]; const pz = compactedPos[i * 3 + 2];
    if (px < bMinX) bMinX = px; if (px > bMaxX) bMaxX = px;
    if (py < bMinY) bMinY = py; if (py > bMaxY) bMaxY = py;
    if (pz < bMinZ) bMinZ = pz; if (pz > bMaxZ) bMaxZ = pz;
  }

  const indicesByteLen = indices.length * 4;
  const posByteLen = vertexCount * 12;
  const colByteLen = vertexCount * 4;
  const totalBinLen = indicesByteLen + posByteLen + colByteLen;
  const binBuffer = Buffer.alloc(totalBinLen);

  let byteOff = 0;
  for (let i = 0; i < indices.length; i++) {
    binBuffer.writeUInt32LE(indices[i], byteOff);
    byteOff += 4;
  }
  const posByteOffset = byteOff;
  for (let i = 0; i < compactedPos.length; i++) {
    binBuffer.writeFloatLE(compactedPos[i], byteOff);
    byteOff += 4;
  }
  const colByteOffset = byteOff;
  for (let i = 0; i < compactedCol.length; i++) {
    binBuffer[byteOff] = compactedCol[i];
    byteOff += 1;
  }

  const newGltf = {
    asset: { version: '2.0', generator: 'Atelier View Solid Mesh Converter' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'reconstructed_room' }],
    materials: [
      {
        name: 'room_material',
        pbrMetallicRoughness: {
          baseColorFactor: [1.0, 1.0, 1.0, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.8
        },
        doubleSided: true
      }
    ],
    meshes: [
      {
        name: 'room_mesh',
        primitives: [
          {
            attributes: {
              POSITION: 1,
              COLOR_0: 2
            },
            indices: 0,
            material: 0,
            mode: 4 // TRIANGLES
          }
        ]
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5125, // UNSIGNED_INT
        count: indices.length,
        type: 'SCALAR'
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: vertexCount,
        type: 'VEC3',
        min: [bMinX, bMinY, bMinZ],
        max: [bMaxX, bMaxY, bMaxZ]
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5121, // UNSIGNED_BYTE
        normalized: true,
        count: vertexCount,
        type: 'VEC4'
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: indicesByteLen,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: posByteOffset,
        byteLength: posByteLen,
        target: 34962 // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: colByteOffset,
        byteLength: colByteLen,
        target: 34962 // ARRAY_BUFFER
      }
    ],
    buffers: [{ byteLength: totalBinLen }]
  };

  let newJson = Buffer.from(JSON.stringify(newGltf), 'utf-8');
  while (newJson.length % 4 !== 0) newJson = Buffer.concat([newJson, Buffer.from(' ')]);

  const outTotal = 12 + 8 + newJson.length + 8 + totalBinLen;
  const outGlb = Buffer.alloc(outTotal);
  outGlb.writeUInt32LE(0x46546C67, 0);
  outGlb.writeUInt32LE(2, 4);
  outGlb.writeUInt32LE(outTotal, 8);

  outGlb.writeUInt32LE(newJson.length, 12);
  outGlb.writeUInt32LE(0x4E4F534A, 16);
  newJson.copy(outGlb, 20);

  const outBinOff = 20 + newJson.length;
  outGlb.writeUInt32LE(totalBinLen, outBinOff);
  outGlb.writeUInt32LE(0x004E4942, outBinOff + 4);
  binBuffer.copy(outGlb, outBinOff + 8);

  return outGlb;
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
    // Select at most 4 continuous frames
    let selectedB64 = framesBase64;
    if (selectedB64.length > 4) {
      selectedB64 = selectedB64.slice(0, 4);
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

      if (buf.byteLength < 1024) {
        throw new Error(`Reconstructed GLB file is invalid or too small (${buf.byteLength} bytes)`);
      }

      try {
        buf = convertPointCloudGlbToSolidMeshGlb(buf, tempFramePaths.length || 4);
      } catch (convErr) {
        console.warn('[Video-to-3D] Point cloud to solid mesh conversion fallback:', convErr);
      }

      const safeName = sanitizeFileName(fileName, 'video_room');
      const baseClean = safeName.replace(/\.[^.]+$/, '');
      const outName = `reconstructed_${prefix}_${Date.now()}_${baseClean}.glb`;
      const outPath = path.join(uploadsDir, outName);
      fs.writeFileSync(outPath, buf);
      pruneUploads(uploadsDir);

      const mbSize = (buf.byteLength / (1024 * 1024)).toFixed(2);
      console.log(`[Video-to-3D] 4/4 Saved solid .glb (${mbSize} MB) -> /uploads/${outName}`);
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

    // 1. Primary Engine: facebook/vggt (2-step pipeline, conf_thres = 0.0 solid raster grid)
    try {
      console.log('[Video-to-3D] 2/4 Connected to HF Space (facebook/vggt)');
      const vggt = await Client.connect(
        'facebook/vggt',
        hfToken ? { token: hfToken } : undefined
      );

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
        0.0, // conf_thres = 0.0 keeps 100% of points in exact raster order
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
        return { modelUrl, engine: 'facebook/vggt 3D Solid Mesh', isVideoReconstructed: true };
      }
    } catch (err) {
      console.warn('facebook/vggt failed, falling back to naver/MASt3R:', err);
    }

    // 2. Secondary Fallback: naver/MASt3R (4 frames -> complete graph)
    try {
      console.log('[Video-to-3D] 2/4 Fallback: Connecting to HF Space (naver/MASt3R)');
      const client = await Client.connect(
        'naver/MASt3R',
        hfToken ? { token: hfToken } : undefined
      );

      console.log('[Video-to-3D] 3/4 Running 3D mesh reconstruction (naver/MASt3R)...');
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
      console.warn('naver/MASt3R fallback failed:', err);
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
