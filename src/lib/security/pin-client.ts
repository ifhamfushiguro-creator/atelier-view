import type {
  ProjectRecord,
  PublicProjectMeta,
  SaveProjectPayload,
  SaveProjectResponse,
  VerifyPinResponse,
} from '../../types/project';

export interface ProjectApproval {
  clientName: string;
  note?: string;
  approvedAt: string;
}

export interface ApproveProjectPayload {
  projectId: string;
  clientName: string;
  note?: string;
  pinCode?: string;
}

export interface ApproveProjectResponse {
  success: boolean;
  approval: ProjectApproval;
  approvals: ProjectApproval[];
  error?: string;
}

declare module '../../types/project' {
  interface ProjectRecord {
    approvals?: ProjectApproval[];
  }
  interface VerifyPinResponse {
    approvals?: ProjectApproval[];
  }
}

export const DESIGNER_TOKEN_KEY = 'atelier_designer_token';

const CLIENT_PIN_KEY_PREFIX = 'atelier_client_pin_';
const memoryPinCache = new Map<string, string>();

export function setStoredClientPin(projectId: string, pin: string): void {
  memoryPinCache.set(projectId, pin);
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`${CLIENT_PIN_KEY_PREFIX}${projectId}`, pin);
    } catch {
      // sessionStorage unavailable
    }
  }
}

export function getStoredClientPin(projectId: string): string | null {
  if (memoryPinCache.has(projectId)) {
    return memoryPinCache.get(projectId)!;
  }
  if (typeof window !== 'undefined') {
    try {
      return sessionStorage.getItem(`${CLIENT_PIN_KEY_PREFIX}${projectId}`);
    } catch {
      return null;
    }
  }
  return null;
}

export function getOrCreateDesignerToken(): string {
  if (typeof window === 'undefined') return 'ssr_designer_token';

  let token = localStorage.getItem(DESIGNER_TOKEN_KEY);
  if (!token) {
    const randomHex = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).substring(2, 10);
    token = `des_${randomHex}`;
    localStorage.setItem(DESIGNER_TOKEN_KEY, token);
  }
  return token;
}

export function generateRandomPin(length: 4 | 6 = 4): string {
  return length === 6
    ? Math.floor(100000 + Math.random() * 900000).toString()
    : Math.floor(1000 + Math.random() * 9000).toString();
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

export async function uploadGlbBlob(blobUrl: string, fileName?: string): Promise<string> {
  const blobRes = await fetch(blobUrl);
  if (!blobRes.ok) throw new Error('Failed to read local 3D model blob');
  const blob = await blobRes.blob();

  const res = await fetch('/api/projects/upload-glb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-file-name': fileName || 'model.glb',
    },
    body: blob,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to persist 3D model to server');
  return data.modelUrl as string;
}

export async function saveProjectWithPin(
  payload: SaveProjectPayload
): Promise<SaveProjectResponse> {
  let effectiveModelUrl = payload.modelUrl;

  if (effectiveModelUrl && effectiveModelUrl.startsWith('blob:')) {
    effectiveModelUrl = await uploadGlbBlob(
      effectiveModelUrl,
      `${payload.title || 'project_space'}.glb`
    );
  }

  const token = payload.designerToken || getOrCreateDesignerToken();
  const res = await fetch('/api/projects/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-designer-token': token,
    },
    body: JSON.stringify({
      ...payload,
      modelUrl: effectiveModelUrl,
      designerToken: token,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save project');
  return data as SaveProjectResponse;
}

export async function getMyProjects(
  designerToken?: string
): Promise<ProjectRecord[]> {
  const token = designerToken || getOrCreateDesignerToken();
  const res = await fetch(`/api/projects/my-projects?designerToken=${encodeURIComponent(token)}`, {
    headers: { 'x-designer-token': token },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch projects');
  return (data.projects || data) as ProjectRecord[];
}

export async function getPublicProjectMeta(
  projectId: string
): Promise<PublicProjectMeta> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/public`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Project not found');
  return data as PublicProjectMeta;
}

export async function verifyProjectPin(
  projectId: string,
  pinCode: string
): Promise<VerifyPinResponse> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/verify-pin`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinCode: pinCode.trim() }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    return {
      verified: false,
      error: data.error || 'Invalid access code',
    };
  }

  if (data.verified) {
    setStoredClientPin(projectId, pinCode.trim());
  }

  return data as VerifyPinResponse;
}

export async function approveProject(
  payload: ApproveProjectPayload
): Promise<ApproveProjectResponse> {
  const pin = payload.pinCode ?? getStoredClientPin(payload.projectId) ?? '';
  const token = getOrCreateDesignerToken();
  const res = await fetch(`/api/projects/${encodeURIComponent(payload.projectId)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-designer-token': token,
    },
    body: JSON.stringify({
      pinCode: pin,
      clientName: payload.clientName.trim(),
      note: payload.note?.trim(),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit design approval');
  }
  return data as ApproveProjectResponse;
}

export async function getProjectApprovals(projectId: string): Promise<ProjectApproval[]> {
  const pin = getStoredClientPin(projectId) || '';
  try {
    const res = await verifyProjectPin(projectId, pin);
    return res.approvals || [];
  } catch {
    return [];
  }
}

export function buildClientShareUrl(projectId: string): string {
  if (typeof window === 'undefined') return `?project=${projectId}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?project=${encodeURIComponent(projectId)}`;
}
