# ATELIER VIEW — MULTI-AGENT CO-FOUNDER CONSTITUTION (`AGENTS.md`)

## CRITICAL WARNING FOR AI AGENTS (ANTIGRAVITY / GEMINI 3.8)
Two co-founders are actively developing this repository in parallel using AI agents:
1. **Developer A (Backend, Security, Persistence & Video-to-GLB Pipeline)**
2. **Developer B / Flux (Frontend UI/UX, Three.js Viewport & 3D Model Behavior)**

**ABSOLUTE RULE:** Before modifying ANY file, check which developer session you are running in. You are **STRICTLY FORBIDDEN** from editing files owned by the other developer. If your feature requires a change in a file owned by the other developer, DO NOT EDIT IT. Instead, create a modular component/hook in your own folder and output a 3-line integration snippet for the human to hand off to their partner.

---

## 1. FILE OWNERSHIP MATRIX (STRICT LOCKS)

### 🔒 OWNED BY DEVELOPER A (Backend, Security, Video Extraction)
- `server.ts` (Express/Node API, `/api/3d/reconstruct-video`, `/api/projects/*`, PIN auth, Gradio `MASt3R`/`vggt` client, Supabase storage/DB)
- `src/lib/3d/video-to-glb-builder.ts` (Browser-side `.mp4` frame extraction, Laplacian sharpness scoring, frame payload to `/api/3d/reconstruct-video`)
- `src/lib/security/**` (PIN generation, PIN verification API client, session tokens, auth helpers)
- `src/lib/supabase/**` (Cloud database & persistent storage client)
- `src/components/security/**` (`PinSetupModal.tsx`, `PinUnlockScreen.tsx`, `DesignerPinBadge.tsx`)

### 🔒 OWNED BY DEVELOPER B / FLUX (Frontend UI, Three.js, 3D Normalization)
- `src/components/canvas/street-view-viewer.tsx` (Three.js canvas, `model.rotation.x = Math.PI` flip, `Y = 0` invisible floor collider, camera/walking controls, dollhouse view)
- `src/lib/3d/simple-normalizer.ts` (`vertexColors: true` material patching, bounding box normalization, mesh cleanup)
- `src/components/ui/**` (All studio styling, buttons, panels, luxury layout)

### ⚠️ RESTRICTED BRIDGE FILE: `src/app/page.tsx`
- **Primary Owner:** Developer B (Flux)
- **Rule for Developer A:** NEVER rewrite or reformat `src/app/page.tsx`. Build all security, PIN modals, and backend state inside `src/components/security/` and `src/hooks/`, and give Developer B a minimal `<PinGate>` wrapper or hook import (max 5 lines) to drop into `src/app/page.tsx`.

---

## 2. ARCHITECTURE & PIPELINE TRUTH

### A. Video-to-3D Reconstruction Pipeline (`MASt3R` / `VGGT`)
1. **Browser Extraction (`src/lib/3d/video-to-glb-builder.ts`):**
   - Samples ~20 timestamps across an uploaded `.mp4` walkthrough.
   - Scores frames for sharpness (skips motion blur) and selects 8–10 diverse, sharp snapshots covering the room.
   - Sends frames to `POST /api/3d/reconstruct-video`.
2. **Server Reconstruction (`server.ts`):**
   - Uses `@gradio/client` to call Hugging Face Spaces: primary `naver/MASt3R`, fallback `facebook/vggt`.
   - Required parameters: `as_pointcloud: false` (outputs solid mesh instead of points), `transparent_cams: true`, `cam_size: 0.001` (hides camera frustum cones).
   - Saves resulting `.glb` and returns URL (`/uploads/reconstructed_<id>.glb` or persistent Cloud Storage URL).
3. **Three.js Normalization & Viewer (`simple-normalizer.ts` & `street-view-viewer.tsx`):**
   - Enforces `vertexColors: true` on meshes (since AI meshes bake RGB into vertices rather than UV textures).
   - Flips model right-side up (`model.rotation.x = Math.PI`).
   - Adds an invisible floor plane at `Y = 0` so first-person walking never falls through missing floor geometry.

### B. Designer PIN & Client Access Security Flow
1. **Designer Setup:** When a customer (designer) uploads or reconstructs a model, they set a Project Access Code (PIN) before sharing. The designer can always view or update this code in their Project Settings / Profile panel.
2. **Client Verification:** When the client opens the shared link, the `.glb` model URL is NOT loaded until the client enters the valid PIN. Once verified via `POST /api/projects/:id/verify-pin`, the server returns the `.glb` URL and unlocks the 3D viewer.
