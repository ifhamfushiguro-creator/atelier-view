import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import app, {
  loadProjectsDatabase,
  saveProjectsDatabase,
  PROJECTS_DB_PATH,
  pinFailures,
  sanitizeFileName,
} from '../../../server';

// Lightweight in-memory request simulation helper for express app
async function makeRequest(
  method: 'GET' | 'POST',
  url: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url, 'http://localhost');
    const pathName = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    const req: any = {
      method,
      url,
      path: pathName,
      query,
      params: {},
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: body || {},
    };

    let statusCode = 200;
    const responseHeaders: Record<string, string> = {};

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(k: string, v: string) {
        responseHeaders[k.toLowerCase()] = v;
        return this;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data, headers: responseHeaders });
      },
      send(data: any) {
        resolve({ status: statusCode, body: data, headers: responseHeaders });
      },
      end() {
        resolve({ status: statusCode, body: null, headers: responseHeaders });
      },
    };

    (app as any).handle(req, res, (err: any) => {
      if (err) reject(err);
      else resolve({ status: statusCode, body: null, headers: responseHeaders });
    });
  });
}

test('PIN Security: Full Project Lifecycle and Access Control', async (t) => {
  // Setup clean temporary test state in DB
  const backupDb = loadProjectsDatabase();
  const testDbFile = PROJECTS_DB_PATH;

  t.after(() => {
    // Restore backup
    saveProjectsDatabase(backupDb);
  });

  const testDesignerToken = `test_designer_${Date.now()}`;
  const testModelUrl = '/uploads/reconstructed_mast3r_test.glb';

  await t.test('1. Rejects project save with invalid PIN format (< 4 or > 6 digits)', async () => {
    const resShort = await makeRequest('POST', '/api/projects/save', {
      title: 'Penthouse Suite',
      modelUrl: testModelUrl,
      pinCode: '12',
      designerToken: testDesignerToken,
    });
    assert.equal(resShort.status, 400);
    assert.match(resShort.body.error, /PIN must be between 4 and 6 digits/);

    const resAlpha = await makeRequest('POST', '/api/projects/save', {
      title: 'Penthouse Suite',
      modelUrl: testModelUrl,
      pinCode: '12AB',
      designerToken: testDesignerToken,
    });
    assert.equal(resAlpha.status, 400);
  });

  let savedProjectId = '';

  await t.test('2. Saves a new project with valid 4-digit PIN', async () => {
    const res = await makeRequest('POST', '/api/projects/save', {
      title: 'The Solenne Brickell Bay',
      modelUrl: testModelUrl,
      pinCode: '8492',
      designerToken: testDesignerToken,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.projectId);
    assert.equal(res.body.title, 'The Solenne Brickell Bay');
    assert.equal(res.body.pinCode, '8492');
    savedProjectId = res.body.projectId;

    // Verify it was written to disk
    assert.ok(fs.existsSync(testDbFile));
    const reloaded = loadProjectsDatabase();
    assert.ok(reloaded[savedProjectId]);
    assert.equal(reloaded[savedProjectId].pinCode, '8492');
  });

  await t.test('3. Designer can retrieve their projects with PIN & modelUrl intact', async () => {
    const res = await makeRequest(
      'GET',
      `/api/projects/my-projects?designerToken=${testDesignerToken}`,
      undefined,
      { 'x-designer-token': testDesignerToken }
    );

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
    const found = res.body.projects.find((p: any) => p.projectId === savedProjectId);
    assert.ok(found);
    assert.equal(found.pinCode, '8492');
    assert.equal(found.modelUrl, testModelUrl);
    assert.equal(found.title, 'The Solenne Brickell Bay');
  });

  await t.test('4. Public endpoint NEVER exposes modelUrl or pinCode', async () => {
    const res = await makeRequest('GET', `/api/projects/${savedProjectId}/public`);
    assert.equal(res.status, 200);
    assert.equal(res.body.projectId, savedProjectId);
    assert.equal(res.body.title, 'The Solenne Brickell Bay');
    assert.equal(res.body.requiresPin, true);

    // CRITICAL SECURITY ASSERTIONS:
    assert.equal(res.body.modelUrl, undefined, 'Public endpoint must NOT expose modelUrl!');
    assert.equal(res.body.pinCode, undefined, 'Public endpoint must NOT expose pinCode!');
    assert.equal(res.body.designerToken, undefined, 'Public endpoint must NOT expose designerToken!');
  });

  await t.test('5. Verify PIN fails with incorrect code (401)', async () => {
    const res = await makeRequest('POST', `/api/projects/${savedProjectId}/verify-pin`, {
      pinCode: '0000',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.verified, false);
    assert.equal(res.body.modelUrl, undefined);
    assert.equal(res.body.error, 'Invalid access code');
  });

  await t.test('6. Verify PIN succeeds with correct code and unlocks modelUrl (200)', async () => {
    const res = await makeRequest('POST', `/api/projects/${savedProjectId}/verify-pin`, {
      pinCode: '8492',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.verified, true);
    assert.equal(res.body.modelUrl, testModelUrl);
    assert.equal(res.body.title, 'The Solenne Brickell Bay');
  });

  await t.test('7. Unauthorized designer cannot overwrite another designer project', async () => {
    const res = await makeRequest('POST', '/api/projects/save', {
      projectId: savedProjectId,
      title: 'Hacked Title',
      modelUrl: '/hacked.glb',
      pinCode: '9999',
      designerToken: 'other_designer_token_attacker',
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Unauthorized/);
  });

  await t.test('8. Rate limiter blocks verification after 5 failed attempts (429)', async () => {
    const rateLimitIp = '198.51.100.42';
    const hdrs = { 'x-forwarded-for': rateLimitIp };

    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(
        'POST',
        `/api/projects/${savedProjectId}/verify-pin`,
        { pinCode: '0000' },
        hdrs
      );
      assert.equal(res.status, 401);
    }

    const blockedRes = await makeRequest(
      'POST',
      `/api/projects/${savedProjectId}/verify-pin`,
      { pinCode: '8492' },
      hdrs
    );
    assert.equal(blockedRes.status, 429);
    assert.match(blockedRes.body.error, /Too many failed attempts/);
    pinFailures.delete(rateLimitIp);
  });

  await t.test('9. Sanitizes uploaded filenames and enforces extension allowlist', () => {
    assert.equal(sanitizeFileName('../../../passwd.exe'), 'passwd.glb');
    assert.equal(sanitizeFileName('C:\\Windows\\system32\\video.mp4'), 'video.mp4');
    assert.equal(sanitizeFileName('luxury suite penthouse!.glb'), 'luxury_suite_penthouse_.glb');
  });

  await t.test('10. Sets security headers on responses', async () => {
    const res = await makeRequest('GET', '/api/projects/my-projects');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });
});
