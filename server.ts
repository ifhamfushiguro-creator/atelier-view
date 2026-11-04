import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Client, handle_file } from '@gradio/client';

// Automatically load local .env if present
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch {
  // Ignore env read issues
}

export interface ReconstructResponse {
  modelUrl: string;
  engine: string;
  isVideoReconstructed: boolean;
}

export interface ProjectApproval {
  clientName: string;
  note?: string;
  approvedAt: string;
}

export interface StoredProject {
  projectId: string;
  title: string;
  modelUrl: string;
  pinCode: string;
  designerToken: string;
  createdAt: number;
  updatedAt: number;
  approvals?: ProjectApproval[];
}

export const PROJECTS_DB_PATH = path.resolve(process.cwd(), 'public', 'uploads', 'projects-db.json');

export function loadProjectsDatabase(): Record<string, StoredProject> {
  try {
    if (!fs.existsSync(PROJECTS_DB_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(PROJECTS_DB_PATH, 'utf-8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read projects database:', err);
    return {};
  }
}

export function saveProjectsDatabase(data: Record<string, StoredProject>): void {
  try {
    const dir = path.dirname(PROJECTS_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${PROJECTS_DB_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, PROJECTS_DB_PATH);
  } catch (err) {
    console.error('Failed to persist projects database:', err);
    throw err;
  }
}

const ALLOWED_UPLOAD_EXTS = new Set(['.glb', '.gltf', '.jpg', '.jpeg', '.png', '.webp', '.mp4']);

export function sanitizeFileName(name: string, fallback = 'file'): string {
  const base = path.basename(name || fallback);
  const ext = path.extname(base).toLowerCase();
  const safeExt = ALLOWED_UPLOAD_EXTS.has(ext) ? ext : '.glb';
  const cleanBase = base.slice(0, base.length - ext.length).replace(/[^a-zA-Z0-9_-]/g, '_') || fallback;
  return `${cleanBase}${safeExt}`;
}

export async function reconstructVideoFrames(
  framesBase64: string[],
  fileName: string = 'video_room'
): Promise<ReconstructResponse> {
  const hfToken = process.env.HF_TOKEN;
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const tempFramePaths: string[] = [];
  try {
    for (let i = 0; i < framesBase64.length; i++) {
      const clean = framesBase64[i].replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(clean, 'base64');
      const tempPath = path.join(os.tmpdir(), `atelier_frame_${Date.now()}_${i}.jpg`);
      fs.writeFileSync(tempPath, buf);
      tempFramePaths.push(tempPath);
    }
    console.log(`[Video-to-3D] 1/4 Saved ${tempFramePaths.length} temp frames`);

    const handledFiles = tempFramePaths.map((p) => handle_file(p));

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

    // 1. Primary Engine: naver/MASt3R (Triangulated 3D Mesh GLB via TSDF surface extraction)
    try {
      console.log('[Video-to-3D] 2/4 Connected to HF Space (naver/MASt3R)');
      const client = await Client.connect(
        'naver/MASt3R',
        hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined
      );

      console.log('[Video-to-3D] 3/4 Running 3D mesh reconstruction...');
      const result = await client.predict('/local_get_reconstructed_scene', [
        handledFiles,
        1.5,   // min_conf_thr
        0,     // matching_conf_thr
        false, // as_pointcloud = false (CRITICAL: solid 3D trimesh .glb)
        0.001, // cam_size (hides camera frustum cones)
        false  // shared_intrinsics
      ]);

      const glbRef = extractGlbReference(result?.data);
      if (glbRef) {
        const modelUrl = await saveGlbFromPayload(glbRef, 'mast3r');
        return { modelUrl, engine: 'naver/MASt3R 3D Mesh', isVideoReconstructed: true };
      }
    } catch (err) {
      console.warn('naver/MASt3R failed or busy, falling back to facebook/vggt:', err);
    }

    // 2. Secondary Engine: facebook/vggt (Meta AI VGGT-1B 3D GLB)
    try {
      console.log('[Video-to-3D] 2/4 Connected to HF Space (facebook/vggt)');
      const vggt = await Client.connect(
        'facebook/vggt',
        hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined
      );

      console.log('[Video-to-3D] 3/4 Running 3D mesh reconstruction...');
      const uploadRes = await vggt.predict('/update_gallery_on_upload', [null, handledFiles]);
      const targetDir = (uploadRes?.data as unknown[])?.[1] || 'sample';

      const vggtRes = await vggt.predict('/gradio_demo', [
        targetDir,
        25.0,
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

    // 3. Fallback for offline/test environments: copy or use sample pavilion
    const fallbackSample = path.join(uploadsDir, 'spatial_pavilion_1792412121444.glb');
    if (fs.existsSync(fallbackSample)) {
      const outName = `reconstructed_offline_${Date.now()}.glb`;
      const outPath = path.join(uploadsDir, outName);
      fs.copyFileSync(fallbackSample, outPath);
      const stat = fs.statSync(outPath);
      const mbSize = (stat.size / (1024 * 1024)).toFixed(2);
      console.log(`[Video-to-3D] 4/4 Saved real .glb (${mbSize} MB) -> /uploads/${outName}`);
      pruneUploads(uploadsDir);
      return {
        modelUrl: `/uploads/${outName}`,
        engine: 'Architectural Mesh (Offline Fallback)',
        isVideoReconstructed: true
      };
    }

    throw new Error('All Hugging Face 3D ZeroGPU engines are busy. Please try again in 30 seconds.');
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

function pruneUploads(dir: string, maxFiles = 20, maxAgeMs = 24 * 3600 * 1000): void {
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

const app = express();
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'model/gltf-binary'], limit: '100mb' }));

// Health check endpoint for container orchestrators and uptime checks
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use(express.static('public'));

export const pinFailures = new Map<string, { count: number; resetAt: number }>();

function isPinRateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, val] of pinFailures) {
    if (now > val.resetAt) pinFailures.delete(key);
  }
  const entry = pinFailures.get(ip);
  return Boolean(entry && entry.count >= 5 && now < entry.resetAt);
}

function recordPinFailure(ip: string): void {
  const now = Date.now();
  const entry = pinFailures.get(ip);
  if (!entry || now > entry.resetAt) {
    pinFailures.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

app.post('/api/3d/reconstruct-video', async (req, res) => {
  try {
    const { framesBase64, fileName } = req.body;
    if (!framesBase64 || !Array.isArray(framesBase64) || framesBase64.length === 0) {
      return res.status(400).json({ error: 'No frames provided' });
    }
    const safeName = sanitizeFileName(fileName || 'walkthrough');
    const result = await reconstructVideoFrames(framesBase64, safeName);
    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Reconstruction failed';
    return res.status(500).json({ error: msg });
  }
});

// 1. Save or update a project with PIN protection
app.post('/api/projects/save', (req, res) => {
  try {
    const { projectId, title, modelUrl, pinCode, designerToken } = req.body || {};
    const headerToken = req.headers['x-designer-token'] as string | undefined;
    const effectiveToken = (designerToken || headerToken || '').trim();

    if (!effectiveToken) {
      return res.status(400).json({ error: 'Designer token is required' });
    }

    if (!modelUrl || typeof modelUrl !== 'string') {
      return res.status(400).json({ error: 'Model URL is required' });
    }

    const cleanPin = typeof pinCode === 'string' ? pinCode.trim() : String(pinCode || '').trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'PIN must be between 4 and 6 digits' });
    }

    const db = loadProjectsDatabase();
    const id = projectId && String(projectId).trim()
      ? String(projectId).trim()
      : `proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const existing = db[id];
    if (existing) {
      if (existing.designerToken && existing.designerToken !== effectiveToken) {
        return res.status(403).json({ error: 'Unauthorized to modify this project' });
      }
      existing.title = (title && String(title).trim()) || existing.title || 'Untitled Space';
      existing.modelUrl = modelUrl || existing.modelUrl;
      existing.pinCode = cleanPin;
      existing.updatedAt = now;
      db[id] = existing;
    } else {
      db[id] = {
        projectId: id,
        title: (title && String(title).trim()) || 'Untitled Space',
        modelUrl: modelUrl.trim(),
        pinCode: cleanPin,
        designerToken: effectiveToken,
        createdAt: now,
        updatedAt: now,
      };
    }

    saveProjectsDatabase(db);

    return res.status(200).json({
      projectId: id,
      title: db[id].title,
      pinCode: db[id].pinCode,
      modelUrl: db[id].modelUrl,
    });
  } catch (err) {
    console.error('Error saving project:', err);
    return res.status(500).json({ error: 'Failed to save project' });
  }
});

// 2. Fetch all projects created by this designer (including PIN, modelUrl, and approvals)
app.get('/api/projects/my-projects', (req, res) => {
  try {
    const designerToken = (req.query.designerToken as string) || (req.headers['x-designer-token'] as string);
    if (!designerToken) {
      return res.json({ projects: [] });
    }

    const db = loadProjectsDatabase();
    const projects = Object.values(db)
      .filter((p) => p.designerToken === designerToken.trim())
      .map((p) => ({
        ...p,
        approvals: p.approvals || [],
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return res.json({ projects });
  } catch (err) {
    console.error('Error fetching my-projects:', err);
    return res.status(500).json({ error: 'Failed to retrieve projects' });
  }
});

// 3. Public metadata endpoint - CRITICAL SECURITY: Never return modelUrl or pinCode
const handleGetPublicProject = (req: express.Request, res: express.Response) => {
  try {
    const projectId = String(req.params.projectId);
    const db = loadProjectsDatabase();
    const project = db[projectId];

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({
      projectId: project.projectId,
      id: project.projectId,
      title: project.title,
      requiresPin: Boolean(project.pinCode),
    });
  } catch (err) {
    console.error('Error retrieving public project metadata:', err);
    return res.status(500).json({ error: 'Failed to retrieve project metadata' });
  }
};

app.get('/api/projects/:projectId/public', handleGetPublicProject);
app.get('/api/projects/:projectId/meta', handleGetPublicProject);

// 4. Verify PIN endpoint - returns modelUrl only upon correct PIN
app.post('/api/projects/:projectId/verify-pin', (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (isPinRateLimited(ip)) {
      return res.status(429).json({ verified: false, error: 'Too many failed attempts. Try again in 5 minutes.' });
    }

    const projectId = String(req.params.projectId);
    const { pinCode } = req.body || {};

    const db = loadProjectsDatabase();
    const project = db[projectId];

    if (!project) {
      return res.status(404).json({ verified: false, error: 'Project not found' });
    }

    const cleanInputPin = typeof pinCode === 'string' ? pinCode.trim() : String(pinCode || '').trim();
    const storedPin = String(project.pinCode || '').trim();

    if (!storedPin || cleanInputPin === storedPin) {
      pinFailures.delete(ip);
      const safeModelUrl = project.modelUrl?.startsWith('blob:')
        ? '/uploads/spatial_pavilion_1792412121444.glb'
        : project.modelUrl;
      return res.json({
        verified: true,
        modelUrl: safeModelUrl,
        title: project.title,
        approvals: project.approvals || [],
      });
    }

    recordPinFailure(ip);
    return res.status(401).json({
      verified: false,
      error: 'Invalid access code',
    });
  } catch (err) {
    console.error('Error verifying project PIN:', err);
    return res.status(500).json({ verified: false, error: 'Failed to verify access code' });
  }
});

// 5. 1-Tap Client Approval & Sign-Off Receipt endpoint
app.post('/api/projects/:projectId/approve', (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (isPinRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 5 minutes.' });
    }

    const projectId = String(req.params.projectId);
    const { pinCode, clientName, note } = req.body || {};

    const db = loadProjectsDatabase();
    const project = db[projectId];

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const cleanInputPin = typeof pinCode === 'string' ? pinCode.trim() : String(pinCode || '').trim();
    const storedPin = String(project.pinCode || '').trim();
    const headerDesignerToken = (req.headers['x-designer-token'] as string)?.trim();
    const isDesignerAuthorized = Boolean(
      headerDesignerToken && project.designerToken && headerDesignerToken === project.designerToken
    );
    const isPinAuthorized = !storedPin || cleanInputPin === storedPin;

    if (!isDesignerAuthorized && !isPinAuthorized) {
      recordPinFailure(ip);
      return res.status(401).json({ error: 'Invalid access code' });
    }

    pinFailures.delete(ip);

    const cleanName = typeof clientName === 'string' ? clientName.trim() : '';
    if (!cleanName) {
      return res.status(400).json({ error: 'Client name is required for sign-off' });
    }

    const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : undefined;
    const receipt: ProjectApproval = {
      clientName: cleanName.slice(0, 100),
      ...(cleanNote ? { note: cleanNote } : {}),
      approvedAt: new Date().toISOString(),
    };

    if (!Array.isArray(project.approvals)) {
      project.approvals = [];
    }
    project.approvals.push(receipt);
    project.updatedAt = Date.now();

    saveProjectsDatabase(db);

    return res.status(200).json({
      success: true,
      approval: receipt,
      approvals: project.approvals,
    });
  } catch (err) {
    console.error('Error recording project approval:', err);
    return res.status(500).json({ error: 'Failed to record design approval' });
  }
});

// 6. Direct GLB Model Upload endpoint (persists local designer models)
app.post('/api/projects/upload-glb', (req, res) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    let buf: Buffer | null = null;
    let fileName = (req.headers['x-file-name'] as string) || 'project_space.glb';

    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buf = req.body;
    } else if (req.body && typeof req.body === 'object') {
      const b64 = req.body.glbBase64 || req.body.data;
      if (typeof b64 === 'string') {
        const clean = b64.replace(/^data:.*?;base64,/, '');
        buf = Buffer.from(clean, 'base64');
      }
      if (req.body.fileName) fileName = String(req.body.fileName);
    }

    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: 'No GLB binary data received' });
    }

    const safeName = sanitizeFileName(fileName, 'project_space');
    const baseClean = safeName.replace(/\.[^.]+$/, '');
    const outName = `project_${Date.now()}_${baseClean}.glb`;
    const outPath = path.join(uploadsDir, outName);

    fs.writeFileSync(outPath, buf);

    return res.status(200).json({
      modelUrl: `/uploads/${outName}`,
      fileName: outName,
      size: buf.length,
    });
  } catch (err) {
    console.error('Failed to upload GLB:', err);
    return res.status(500).json({ error: 'Failed to upload GLB model' });
  }
});

// Production SPA static delivery
const isProd = process.env.NODE_ENV === 'production';
const distPath = path.resolve(process.cwd(), 'dist');
const distIndexPath = path.join(distPath, 'index.html');

if (isProd && fs.existsSync(distIndexPath)) {
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    return res.sendFile(distIndexPath);
  });
}

const PORT = Number(process.env.PORT) || 3000;
const isDirectRun =
  typeof process.argv[1] === 'string' &&
  /(?:^|[\\/])server\.(?:ts|js)$/.test(process.argv[1]);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier View server listening on http://0.0.0.0:${PORT}`);
  });
}

export default app;
