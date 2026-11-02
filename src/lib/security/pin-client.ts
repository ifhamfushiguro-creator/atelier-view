import type {
  ProjectRecord,
  PublicProjectMeta,
  SaveProjectPayload,
  SaveProjectResponse,
  VerifyPinResponse,
} from '../../types/project';

export const DESIGNER_TOKEN_KEY = 'atelier_designer_token';

/**
 * Returns the existing designer token from localStorage or generates and persists a new one.
 */
export function getOrCreateDesignerToken(): string {
  if (typeof window === 'undefined') {
    return 'ssr_designer_token';
  }

  let token = localStorage.getItem(DESIGNER_TOKEN_KEY);
  if (!token) {
    token = `des_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(DESIGNER_TOKEN_KEY, token);
  }
  return token;
}

/**
 * Generates a clean random PIN code (default 4 digits, or 6 digits).
 */
export function generateRandomPin(length: 4 | 6 = 4): string {
  if (length === 6) {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Validates whether a PIN consists of 4 to 6 numeric digits.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

/**
 * Saves or updates a project with its PIN code in the persistent store.
 */
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
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save project');
  }

  return data as SaveProjectResponse;
}

/**
 * Retrieves all projects owned by this designer, including PIN codes and model URLs.
 */
export async function getMyProjects(
  designerToken?: string
): Promise<ProjectRecord[]> {
  const token = designerToken || getOrCreateDesignerToken();
  const url = `/api/projects/my-projects?designerToken=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-designer-token': token,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch projects');
  }

  return (data.projects || data) as ProjectRecord[];
}

/**
 * Gets safe public metadata for a project.
 * CRITICAL SECURITY: Never returns modelUrl or pinCode.
 */
export async function getPublicProjectMeta(
  projectId: string
): Promise<PublicProjectMeta> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/public`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Project not found');
  }

  return data as PublicProjectMeta;
}

/**
 * Verifies a PIN code against the project.
 * If valid, returns { verified: true, modelUrl, title }.
 * If invalid, throws an error with the server message.
 */
export async function verifyProjectPin(
  projectId: string,
  pinCode: string
): Promise<VerifyPinResponse> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/verify-pin`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

/**
 * Generates a sharable client link for the project.
 */
export function buildClientShareUrl(projectId: string): string {
  if (typeof window === 'undefined') return `?project=${projectId}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?project=${encodeURIComponent(projectId)}`;
}

