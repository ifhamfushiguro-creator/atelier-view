import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSampleFramesBase64, extractMultiViewFramesFromVideo } from './video-to-glb-builder.ts';
import { convertPointCloudGlbToSolidMeshGlb } from './video-reconstruction-service.ts';

if (typeof globalThis.document === 'undefined') {
  const mockCanvas = {
    width: 518,
    height: 294,
    getContext: () => ({
      fillStyle: '',
      fillRect: () => {},
      strokeStyle: '',
      lineWidth: 0,
      strokeRect: () => {},
      font: '',
      textAlign: '',
      fillText: () => {},
      drawImage: () => {}
    }),
    toDataURL: () => 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return mockCanvas;
      return {};
    }
  };
}

if (typeof globalThis.URL.createObjectURL === 'undefined') {
  globalThis.URL.createObjectURL = () => 'blob:http://localhost/mock-video';
  globalThis.URL.revokeObjectURL = () => {};
}

test('generateSampleFramesBase64 returns specified number of base64 JPEG frames', () => {
  const frames = generateSampleFramesBase64(8);
  assert.equal(frames.length, 8);
  assert.ok(frames[0].startsWith('data:image/jpeg;base64,'));
});

test('extractMultiViewFramesFromVideo handles Blob input with fallback', async () => {
  const blob = new Blob(['mock video data'], { type: 'video/mp4' });
  const stages: string[] = [];
  const frames = await extractMultiViewFramesFromVideo(blob, 4, (stage, pct) => {
    stages.push(`${stage} (${pct}%)`);
  });
  assert.ok(frames.length >= 4);
  assert.ok(stages.length >= 1);
});

test('convertPointCloudGlbToSolidMeshGlb converts mode: 0 point cloud to solid mode: 4 triangle mesh with upright coordinates', () => {
  const S = 1, H = 10, W = 10;
  const N = S * H * W;
  const posBytes = Buffer.alloc(N * 3 * 4);
  const colBytes = Buffer.alloc(N * 4);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      posBytes.writeFloatLE(c * 0.01, idx * 12);
      posBytes.writeFloatLE(r * 0.01, idx * 12 + 4);
      posBytes.writeFloatLE(1.0, idx * 12 + 8);
      colBytes[idx * 4] = 200;
      colBytes[idx * 4 + 1] = 100;
      colBytes[idx * 4 + 2] = 50;
      colBytes[idx * 4 + 3] = 255;
    }
  }
  const bin = Buffer.concat([posBytes, colBytes]);
  const gltf = {
    asset: { version: '2.0' },
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, mode: 0 }] }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: N, type: 'VEC3' },
      { bufferView: 1, byteOffset: 0, componentType: 5121, count: N, type: 'VEC4' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
      { buffer: 0, byteOffset: posBytes.length, byteLength: colBytes.length }
    ],
    buffers: [{ byteLength: bin.length }]
  };
  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf-8');
  while (jsonBuf.length % 4 !== 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);
  const totalLen = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const glb = Buffer.alloc(totalLen);
  glb.writeUInt32LE(0x46546C67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLen, 8);
  glb.writeUInt32LE(jsonBuf.length, 12);
  glb.writeUInt32LE(0x4E4F534A, 16);
  jsonBuf.copy(glb, 20);
  const binOff = 20 + jsonBuf.length;
  glb.writeUInt32LE(bin.length, binOff);
  glb.writeUInt32LE(0x004E4942, binOff + 4);
  bin.copy(glb, binOff + 8);

  const solidGlb = convertPointCloudGlbToSolidMeshGlb(glb, 1);
  assert.ok(solidGlb.byteLength > 20);
  assert.equal(solidGlb.readUInt32LE(0), 0x46546C67);

  const chunk0Len = solidGlb.readUInt32LE(12);
  const outGltf = JSON.parse(solidGlb.toString('utf-8', 20, 20 + chunk0Len));
  assert.equal(outGltf.meshes[0].primitives[0].mode, 4); // mode: 4 TRIANGLES
  assert.ok(outGltf.accessors[0].count > 0); // triangle indices present
  assert.ok(outGltf.accessors[1].count > 0); // vertices present
  // Upright coordinates check: original Y was positive (0..0.09), pre-flipped Y is negative
  assert.ok(outGltf.accessors[1].min[1] <= 0);
});
