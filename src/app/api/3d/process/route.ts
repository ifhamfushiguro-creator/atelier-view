import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createProceduralSampleGlbBuffer,
  getDemoPenthouseWaypoints,
  optimizeAndAnalyzeGlb,
  reconstructVideoToGlb,
  type Process3DResult
} from '../../../../lib/3d/video-to-glb-service';

function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName || 'model.glb').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.length > 0 ? base : 'model.glb';
}

export async function GET(): Promise<Response> {
  const waypoints = getDemoPenthouseWaypoints();
  const payload: Process3DResult = {
    modelUrl: 'procedural://luxury-penthouse',
    waypoints,
    mode: 'local-fallback-demo',
    stats: {
      meshCount: 54,
      vertexCount: 164200,
      materialCount: 16,
      originalBytes: 28_450_000,
      optimizedBytes: 5_140_000,
      compressionRatio: 'Built-in Architectural Penthouse · 60fps PBR',
      bounds: {
        min: [-6.0, 0, -5.0],
        max: [6.0, 3.8, 6.0],
        size: [12.0, 3.8, 11.0],
        center: [0, 1.9, 0.5],
        floorY: 0
      },
      processingTimeMs: 18
    },
    pipelineSteps: [
      {
        id: 'init-demo',
        label: 'Loaded Built-in Luxury Penthouse Showroom',
        detail: '12.0m × 3.8m × 11.0m architectural room with 6 Street View floor circles',
        durationMs: 18,
        status: 'completed'
      }
    ],
    projectMeta: {
      title: 'The Mercer Penthouse — Residence 42A',
      clientName: 'Vance & Sterling Private Collection',
      baseBudget: 120000,
      vipPasscode: '4829',
      sourceFileName: 'mercer_penthouse_v4.glb'
    }
  };

  return Response.json(payload, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    let modeInput = 'auto';
    let title = 'The Mercer Penthouse — Residence 42A';
    let clientName = 'Vance & Sterling Private Collection';
    let baseBudget = 120000;
    let vipPasscode = '4829';
    let uploadedFile: File | null = null;
    let generateSampleGlb = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntry = formData.get('file');
      if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
        uploadedFile = fileEntry as File;
      }
      modeInput = String(formData.get('mode') || 'auto');
      title = String(formData.get('title') || title);
      clientName = String(formData.get('clientName') || clientName);
      baseBudget = Number(formData.get('baseBudget') || baseBudget) || 120000;
      vipPasscode = String(formData.get('vipPasscode') || vipPasscode);
      generateSampleGlb = formData.get('generateSampleGlb') === 'true';
    } else if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      modeInput = String(body.mode || 'auto');
      title = String(body.title || title);
      clientName = String(body.clientName || clientName);
      baseBudget = Number(body.baseBudget || baseBudget) || 120000;
      vipPasscode = String(body.vipPasscode || vipPasscode);
      generateSampleGlb = Boolean(body.generateSampleGlb);
    }

    // Option 1: Generate and optimize a real binary .GLB file on disk for instant testing
    if (generateSampleGlb) {
      const sampleBuffer = await createProceduralSampleGlbBuffer();
      const fileName = `spatial_pavilion_${Date.now()}.glb`;
      const publicModelUrl = `/uploads/${fileName}`;
      const { optimizedBuffer, waypoints, stats, pipelineSteps } =
        await optimizeAndAnalyzeGlb(sampleBuffer, fileName, publicModelUrl);

      await fs.writeFile(path.join(uploadsDir, fileName), Buffer.from(optimizedBuffer));

      const responsePayload: Process3DResult = {
        modelUrl: publicModelUrl,
        waypoints,
        mode: 'optimized-glb',
        stats,
        pipelineSteps,
        projectMeta: {
          title,
          clientName,
          baseBudget,
          vipPasscode,
          sourceFileName: fileName
        }
      };

      return Response.json(responsePayload, { status: 200 });
    }

    // Option 2: Direct .GLB / .GLTF upload optimization & bounding box waypoint seeding
    if (
      uploadedFile &&
      (uploadedFile.name.toLowerCase().endsWith('.glb') ||
        uploadedFile.name.toLowerCase().endsWith('.gltf') ||
        modeInput === 'glb')
    ) {
      const safeBaseName = sanitizeFileName(uploadedFile.name);
      const finalFileName = `${Date.now()}_${
        safeBaseName.toLowerCase().endsWith('.glb') ? safeBaseName : `${safeBaseName}.glb`
      }`;
      const publicModelUrl = `/uploads/${finalFileName}`;

      const rawArrayBuffer = await uploadedFile.arrayBuffer();
      const rawUint8 = new Uint8Array(rawArrayBuffer);

      const { optimizedBuffer, waypoints, stats, pipelineSteps } =
        await optimizeAndAnalyzeGlb(rawUint8, safeBaseName, publicModelUrl);

      await fs.writeFile(path.join(uploadsDir, finalFileName), Buffer.from(optimizedBuffer));

      const responsePayload: Process3DResult = {
        modelUrl: publicModelUrl,
        waypoints,
        mode: 'optimized-glb',
        stats,
        pipelineSteps,
        projectMeta: {
          title,
          clientName,
          baseBudget,
          vipPasscode,
          sourceFileName: safeBaseName
        }
      };

      return Response.json(responsePayload, { status: 200 });
    }

    // Option 3: Video (.MP4 / .MOV) or Photo Set to 3D GLB via KIRI Engine API / Local Dev Fallback
    const videoFileBuffer = uploadedFile
      ? new Uint8Array(await uploadedFile.arrayBuffer())
      : undefined;
    const videoFileName = uploadedFile
      ? sanitizeFileName(uploadedFile.name)
      : 'penthouse_walkthrough_60fps.mp4';
    const videoFileSize = uploadedFile ? uploadedFile.size : 28_450_000;

    const reconstructionResult = await reconstructVideoToGlb({
      fileBuffer: videoFileBuffer,
      fileName: videoFileName,
      fileSize: videoFileSize
    });

    reconstructionResult.projectMeta = {
      title,
      clientName,
      baseBudget,
      vipPasscode,
      sourceFileName: videoFileName
    };

    return Response.json(reconstructionResult, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to process 3D asset payload.';
    return Response.json({ error: message }, { status: 500 });
  }
}
