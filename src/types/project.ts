export interface ProjectRecord {
  projectId: string;
  title: string;
  modelUrl: string;
  pinCode: string;
  designerToken: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicProjectMeta {
  projectId: string;
  title: string;
  requiresPin: boolean;
}

export interface VerifyPinResponse {
  verified: boolean;
  modelUrl?: string;
  title?: string;
  error?: string;
}

export interface SaveProjectPayload {
  projectId?: string;
  title: string;
  modelUrl: string;
  pinCode: string;
  designerToken?: string;
}

export interface SaveProjectResponse {
  projectId: string;
  title: string;
  pinCode: string;
  modelUrl?: string;
}

