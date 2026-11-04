# ATELIER VIEW — MULTI-AGENT CO-FOUNDER CONSTITUTION (`AGENTS.md`)

## CRITICAL WARNING FOR AI AGENTS (ANTIGRAVITY / GEMINI 3.8)
Two co-founders are actively developing this repository in parallel using AI agents:
1. **Developer A (Backend, Security & Model Persistence)**
2. **Developer B / Flux (Frontend UI/UX, Three.js Viewport & 3D Model Behavior)**

**ABSOLUTE RULE:** Before modifying ANY file, check which developer session you are running in. You are **STRICTLY FORBIDDEN** from editing files owned by the other developer. If your feature requires a change in a file owned by the other developer, DO NOT EDIT IT. Instead, create a modular component/hook in your own folder and output a 3-line integration snippet for the human to hand off to their partner.

---

## 1. PONYTAIL ANTI-SLOP CORE RULES (`DietrichGebert/ponytail`)
Permanent standard across all backend and frontend agent workflows:
- **Smallest Complete Diff:** Solve the problem with the least code necessary. Deletion beats addition.
- **Inspect Before Editing:** Grep every caller, import, export, and test before touching a signature or component. Never break existing callers.
- **Zero AI Slop:** Never write robotic AI comments that merely repeat code syntax. Never add dead wrappers, speculative "future" abstractions, or unused dependencies/imports.

---

## 2. FILE OWNERSHIP MATRIX (STRICT LOCKS)

### 🔒 OWNED BY DEVELOPER A (Backend, Security, Persistence)
- `server.ts` (Express API, production static serving of `dist/`, `/api/health`, `/api/projects/*`, PIN rate-limiting, GLB uploads, persistent DB)
- `src/lib/security/**` (PIN generation, PIN verification API client, session tokens, auth helpers)
- `src/lib/supabase/**` (Cloud database & persistent storage client)
- `src/components/security/**` (`ClientPinGate.tsx`, `PinSetupModal.tsx`, `DesignerPinSettingsModal.tsx`, `PinUnlockScreen.tsx`, `DesignerPinBadge.tsx`)

### 🔒 OWNED BY DEVELOPER B / FLUX (Frontend UI, Three.js, 3D Normalization)
- `src/components/canvas/street-view-viewer.tsx` (Three.js canvas, `Y = 0` invisible floor collider, pixel ratio clamped at 1.75, camera/walking controls, dollhouse view)
- `src/lib/3d/simple-normalizer.ts` (`vertexColors: true` material patching, bounding box normalization, mesh cleanup)
- `src/components/ui/**` (All studio styling, buttons, panels, luxury layout)

### ⚠️ RESTRICTED BRIDGE FILE: `src/app/page.tsx`
- **Primary Owner:** Developer B (Flux)
- **CRITICAL PERMANENT INVARIANT:** `<ClientPinGate>`, `<PinSetupModal>`, and `<DesignerPinSettingsModal>` from `src/components/security/` are wired into `src/app/page.tsx`. When Flux edits `src/app/page.tsx`, his agent **MUST PRESERVE** these imports, modal states (`isPinSetupOpen`, `isDesignerSettingsOpen`), and top-bar action buttons ("Share & Set PIN", "My Models & PINs").
- **Rule for Developer A:** NEVER rewrite or reformat `src/app/page.tsx`. Build security and backend state in `src/components/security/` and hand off minimal integration snippets.

---

## 3. ARCHITECTURE & PIPELINE TRUTH

### A. Designer PIN & Client Access Security Flow
1. **Designer Setup:** When a designer loads a model, they set a 4–6 digit PIN before sharing (`PinSetupModal`). The designer can view/copy/change codes in `DesignerPinSettingsModal`.
2. **Client Verification:** When a client opens `?project=<id>`, `GET /api/projects/:id/meta` and `/public` returns ONLY `{ id, title, requiresPin: true }`—never exposing the `.glb` URL in public metadata.
3. **PIN Verification & Rate-Limiting:** `POST /api/projects/:id/verify-pin` returns the `.glb` URL only upon correct PIN. Rate-limited to max 5 failed tries per IP per 5 minutes (HTTP 429) with expired entry pruning.

### B. Production Server Invariants (`server.ts`)
1. **Production Static Serving:** When `NODE_ENV === "production"`, serves `dist/assets` with `Cache-Control: public, max-age=31536000, immutable`, serves `dist/` static files, and falls back non-API/non-upload GET requests to `dist/index.html`.
2. **Health Check:** `GET /api/health` returns `{ status: "ok" }`.
3. **Security Headers:** Global `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.
4. **File Sanitization & Caching:** Uploaded filenames sanitized with `path.basename()` and extension allowlist; `/uploads` cached with `Cache-Control: public, max-age=31536000, immutable`.
5. **Host Binding:** Binds to `0.0.0.0` on `Number(process.env.PORT) || 3000`.
