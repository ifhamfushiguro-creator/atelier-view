# Antigravity Flux: Architecture & Reactive Lifecycle

Welcome to **Antigravity Flux**—the unified reactive data flow and operational architecture powering **Atelier View v1** within Google Antigravity.

---

## 1. Permanent Working Rules

### A. Ponytail Anti-Slop Core Rules (`DietrichGebert/ponytail`)
- **Smallest Complete Diff:** Solve problems with the minimum necessary code. Deletion beats addition.
- **Inspect Before Editing:** Grep every caller, import, export, and test before touching any component or hook signature.
- **Zero AI Slop:** Never write robotic comments repeating syntax, dead wrapper functions, or speculative unused code.

### B. Protect PIN Security in `src/app/page.tsx` (CRITICAL INVARIANT)
`<ClientPinGate>`, `<PinSetupModal>`, and `<DesignerPinSettingsModal>` from `src/components/security/` are now permanently wired into `src/app/page.tsx`.
When Flux or any frontend agent edits `src/app/page.tsx`, you **MUST PRESERVE**:
1. The imports from `../components/security` (`ClientPinGate`, `PinSetupModal`, `DesignerPinSettingsModal`).
2. The modal states (`isPinSetupOpen`, `isDesignerSettingsOpen`).
3. The top-bar trigger buttons ("Share & Set PIN", "My Models & PINs") in both landing and model-loaded views.
4. The `<ClientPinGate>` root wrapper with its `onModelUnlocked` callback.
**Never wipe or omit these during UI redesigns or layout refactors.**

---

## 2. Core Architectural Pillars

Antigravity Flux establishes a unidirectional, leak-free state cycle between the 3D WebGL renderer, spatial navigation funnels, Model Context Protocol (MCP) tool integrations, and real-time reactive UI.

```
       ┌────────────────────────────────────────────────────────┐
       │                 User Interaction & Intent               │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             Atelier View State Orchestrator            │
       │    (Mode: Exterior ──▶ Floor ──▶ Room ──▶ Street Walk)  │
       └──────────────┬──────────────────────────┬──────────────┘
                      │                          │
                      ▼                          ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   Three.js 3D Engine   │      │    MCP Tool Bridges    │
       │  - Zero-rAF State Sync │      │  - Figma Design Tokens │
       │  - GPU Memory Disposal │      │  - Headless Playwright │
       │  - Twilight Diorama    │      │  - Local RPC Handshake │
       └──────────────┬─────────┘      └──────────┬─────────────┘
                      │                           │
                      └─────────────┬─────────────┘
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             Rendered Viewport & Validation             │
       │       (120 FPS Frameloop + Headless Playwright)        │
       └────────────────────────────────────────────────────────┘
```

---

## 3. Unidirectional Data Flow

### A. Intent & Spatial Transitions
1. **Camera Position Decoupling:**
   - Camera vectors `(x, y, z)` and look-at targets are mutated directly inside Three.js animation matrices via `useRef<[number, number, number]>`.
   - **Zero React `useState` triggers per frame:** Eliminates 60–120 FPS component-tree thrashing.
   - **Pixel Ratio Clamping:** Set to `Math.min(window.devicePixelRatio, 1.75)` for optimal rendering budget.

2. **Spatial Funnel Transitions:**
   - **Exterior View:** Full living twilight diorama with procedural skyline, streetlights, moving vehicle grid, and animated cloud drifts.
   - **Floor Focus:** Full-story vertical bounding box highlighter measuring interior wall dimensions while strictly excluding exterior roof overhangs.
   - **Dollhouse Cutaway:** Real-time vertical clipping planes shearing ceilings for top-down walkthroughs.
   - **Room Dive & FPS Walk:** Raycast-constrained collision physics preventing wall clip-through with stair stepping ($h \le 0.35\text{m}$) and invisible floor plane collider at $Y = 0$.

### B. Asset Normalization & Raycasting
- **Roof Rejection Heuristic:**
   - Upward raycasts (`[0, +1, 0]`) from candidate walkable points check for interior ceiling containment ($1.6\text{m} \le \text{clearance} \le 6.0\text{m}$).
   - Candidate hits in the top $26\%$ of total structure height without ceiling bounds are immediately classified as exterior roof tiles and discarded.
- **WebGL Lifecycle & Garbage Collection:**
   - Overlay groups (`floorBandsGroup`, `roomMarkersGroup`, `waypointsGroup`, `pinsGroup`) execute hierarchical geometry and texture disposal before invoking `.clear()` to prevent VRAM memory leaks.
- **Material Invariant:** Always enforce `vertexColors: true` in `src/lib/3d/simple-normalizer.ts`.

---

## 4. Tool & Protocol Integration (MCP)

### Model Context Protocol (MCP) Matrix
| Provider | Transport | Endpoint / Target | Primary Function |
| :--- | :--- | :--- | :--- |
| **Figma Desktop** | Local HTTP | `http://127.0.0.1:3845/mcp` | Direct Dev Mode node inspection & design-token sync |
| **Figma Remote** | Streamable HTTP/SSE | `https://mcp.figma.com/mcp` | Cloud component mapping, motion specs & library export |
| **Playwright** | Local CLI IPC | `e2e/funnel.spec.ts` | Headless visual regression & spatial stage verification |
| **Antigravity Hub** | Local ConnectRPC | `127.0.0.1:<hub-port>` | Background language server coordination & tool dispatch |

---

## 5. Verification & Testing Standards

All code modifications under Antigravity Flux must pass the automated gatekeepers before deployment:

```bash
# 1. Run unit test suite (Physics, Normalizer, Waypoints, Video-to-GLB, Server PIN)
npm test

# 2. Strict TypeScript typechecking
npm run lint

# 3. Production Vite build verification
npm run build
```

---

## 6. Deployment & Release Flow

1. **Source Control:** Monitored on branch `main` at [github.com/ifhamfushiguro-creator/atelier-view](https://github.com/ifhamfushiguro-creator/atelier-view).
2. **Production Runtime:** `server.ts` serves `dist/` in production (`NODE_ENV=production`), binds `0.0.0.0:$PORT`, provides `/api/health`, and enforces PIN rate-limiting.
3. **Artifact Integrity:** All 3D assets (`.glb`, `.gltf`) and extracted video frames are stored with case-insensitive validation and sanitized MIME classification.
