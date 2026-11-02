# ATELIER VIEW — PIN SECURITY HANDOFF FOR DEVELOPER B (FLUX)

**To Developer B (Flux):**
Backend and Security are completely implemented, tested, and active. As agreed in `AGENTS.md`, I did **NOT** touch `src/app/page.tsx`.

Here are the **exact lines of code** for you to drop into `src/app/page.tsx`.

---

### Step 1: Add the import (Top of `src/app/page.tsx`)
```tsx
import { ClientPinGate, PinSetupModal, DesignerPinSettingsModal, DesignerPinBadge } from '../components/security';
```

---

### Step 2: Add modal state (Inside `SpatialWorkspacePage`)
```tsx
const [isPinSetupOpen, setIsPinSetupOpen] = useState(false);
const [isDesignerSettingsOpen, setIsDesignerSettingsOpen] = useState(false);
```

---

### Step 3: Add the Security button to your Header (Right Action Bar)
Place `<DesignerPinBadge>` inside the header next to `Video (.MP4)` or `Close Model`:
```tsx
<DesignerPinBadge onClick={() => isModelLoaded ? setIsPinSetupOpen(true) : setIsDesignerSettingsOpen(true)} />
```

---

### Step 4: Wrap the Viewport with `<ClientPinGate>`
Wrap around your 3D view or canvas container so visiting clients entering `?project=<id>` must enter their PIN to unlock the `.glb`:
```tsx
<ClientPinGate onModelUnlocked={(unlockedUrl, title) => { setModelUrl(unlockedUrl); if (title) setModelFileName(title); }}>
```

---

### Step 5: Render the modals (Before the closing `</div>`)
```tsx
<PinSetupModal isOpen={isPinSetupOpen} onClose={() => setIsPinSetupOpen(false)} modelUrl={modelUrl} defaultTitle={modelFileName} />
<DesignerPinSettingsModal isOpen={isDesignerSettingsOpen} onClose={() => setIsDesignerSettingsOpen(false)} onSelectModel={(url, title) => { setModelUrl(url); setModelFileName(title); }} />
```

---

## What each component does:
- `<ClientPinGate>`:
  Checks `?project=<id>`. If not present, renders normal workspace immediately. If present, securely queries `GET /api/projects/:id/public` (which NEVER reveals the `.glb` or PIN), displays the luxury PIN unlock prompt, and only supplies the model URL after `POST /api/projects/:id/verify-pin` passes.
- `<PinSetupModal>`:
  Allows the designer to enter a 4-6 digit PIN (or click "Auto-Generate Code"), saves the project into `public/uploads/projects-db.json`, and generates a "Copy Client Link + Code" button.
- `<DesignerPinSettingsModal>`:
  Profile & Settings manager where the designer can view all their saved models, see saved PIN codes, change codes, and copy links.
- `<DesignerPinBadge>`:
  Luxury gold badge button indicating PIN protection status.

