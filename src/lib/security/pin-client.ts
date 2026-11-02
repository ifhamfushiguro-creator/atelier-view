import type {
  ProjectRecord,
  PublicProjectMeta,
  SaveProjectPayload,
  SaveProjectResponse,
  VerifyPinResponse,
} from '../../types/project';

export const DESIGNER_TOKEN_KEY = 'atelier_designer_token';

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

export async function saveProjectWithPin(
  payload: SaveProjectPayload
): Promise<SaveProjectResponse> {
  const token = payload.designerToken || getOrCreateDesignerToken();
  const res = await fetch('/api/projects/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-designer-token': token,
    },
    body: JSON.stringify({
      ...payload,
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

  return data as VerifyPinResponse;
}

export function buildClientShareUrl(projectId: string): string {
  if (typeof window === 'undefined') return `?project=${projectId}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?project=${encodeURIComponent(projectId)}`;
}
