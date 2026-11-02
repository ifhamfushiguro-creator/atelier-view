import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSampleFramesBase64, extractMultiViewFramesFromVideo } from './video-to-glb-builder.ts';

if (typeof globalThis.document === 'undefined') {
  const mockCanvas = {
    width: 640,
    height: 480,
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
