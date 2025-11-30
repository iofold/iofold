# iofold UI Upgrade Plan

**Created:** 2025-11-30
**Status:** Ready for Execution

This document details the complete upgrade plan for the iofold frontend, covering both dependency upgrades and UI enhancements from the `auto_evals_dashboard` prototype.

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 0: Dependency Upgrades](#phase-0-dependency-upgrades)
3. [Phase 1: UI Foundation](#phase-1-ui-foundation)
4. [Phase 2: UI Enhancements](#phase-2-ui-enhancements)
5. [Execution Checklist](#execution-checklist)
6. [Rollback Plan](#rollback-plan)

---

## Overview

### Current State

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| next | 14.2.33 | 15.5.x | Latest Clerk-compatible |
| react | 18.3.1 | 18.3.1 | Keep (React 19 needs Next 16) |
| @clerk/nextjs | 5.7.5 | 6.35.x | Async APIs |
| tailwindcss | 3.4.18 | 4.x | CSS-first config |
| lucide-react | 0.454.0 | 0.555.x | Minor update |

### Key Constraints

- **Clerk blocks Next.js 16** - Peer dependency limits us to Next.js 15.x
- **React 19 needs Next.js 16** - We stay on React 18
- **Tailwind 4 requires Node 20+** - Must verify Node version
- **Browser support** - Tailwind 4 needs Safari 16.4+, Chrome 111+, Firefox 128+

---

## Phase 0: Dependency Upgrades

### Prerequisites

```bash
# Verify Node.js version (need 20+)
node --version

# Create upgrade branch
git checkout -b feature/dependency-upgrade
```

### Step 0.1: Upgrade Next.js to 15.5

**Tool:** Next.js Codemod CLI

```bash
cd frontend
npx @next/codemod@canary upgrade 15.5
```

**Manual Changes Required:**

1. **Async Request APIs** - `cookies()`, `headers()`, `params`, `searchParams` are now async:
   ```typescript
   // Before
   const cookieStore = cookies()

   // After
   const cookieStore = await cookies()
   ```

2. **Caching defaults changed** - Fetch requests no longer cached by default:
   ```typescript
   // To restore old behavior (opt-in caching)
   fetch(url, { cache: 'force-cache' })
   ```

3. **Config renames**:
   - `experimental.bundlePagesExternals` → `bundlePagesRouterDependencies`
   - `experimental.serverComponentsExternalPackages` → `serverExternalPackages`

**Files likely affected:**
- `frontend/app/**/page.tsx` (any using searchParams)
- `frontend/next.config.js`

### Step 0.2: Upgrade @clerk/nextjs to v6

**Status:** Clerk is installed but NOT integrated yet. Simple package update.

```bash
cd frontend
npm install @clerk/nextjs@latest
```

**Note:** Since we're not using Clerk APIs yet, no code changes needed. When we do integrate:
- `auth()` will be async
- `clerkMiddleware()` handlers will be async
- `clerkClient()` will be async

### Step 0.3: Upgrade Tailwind CSS to v4

**Tool:** Tailwind upgrade CLI

```bash
cd frontend
npx @tailwindcss/upgrade@next
```

**Major Changes:**

1. **PostCSS plugin moved** - Update `postcss.config.js`:
   ```javascript
   // Before
   module.exports = {
     plugins: {
       tailwindcss: {},
       autoprefixer: {},
     },
   }

   // After
   module.exports = {
     plugins: {
       '@tailwindcss/postcss': {},
     },
   }
   ```

2. **Config moves to CSS** - `tailwind.config.ts` → CSS variables:
   ```css
   /* app/globals.css */
   @import "tailwindcss";

   @theme {
     --color-primary: oklch(0.6 0.2 250);
     --color-secondary: oklch(0.7 0.1 200);
     --radius: 0.5rem;
   }
   ```

3. **Content detection is automatic** - Remove `content` array (uses `.gitignore` heuristics)

4. **@tailwind directives replaced**:
   ```css
   /* Before */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   /* After */
   @import "tailwindcss";
   ```

**Files affected:**
- `frontend/tailwind.config.ts` → migrate to CSS or keep for complex config
- `frontend/postcss.config.js` → update plugin
- `frontend/app/globals.css` → update imports

### Step 0.4: Update Minor Dependencies

```bash
cd frontend
npm install lucide-react@latest tailwind-merge@latest sonner@latest
npm install -D eslint-config-next@15.5
```

### Step 0.5: Verification

```bash
# Clean build
rm -rf .next
npm run build

# Type check
npm run type-check

# Run dev server
npm run dev

# Run E2E tests
cd .. && npx playwright test
```

---

## Phase 1: UI Foundation

After Phase 0 completes and all tests pass.

### Step 1.1: Add Missing Dependencies

```bash
cd frontend
npm install recharts class-variance-authority react-window
```

### Step 1.2: Extend Tailwind Theme

Add to CSS theme (or keep in config if using compatibility mode):

```css
/* In globals.css @theme block */
@theme {
  /* Semantic colors */
  --color-success: oklch(0.7 0.2 145);
  --color-success-foreground: white;
  --color-warning: oklch(0.8 0.15 85);
  --color-warning-foreground: black;
  --color-error: oklch(0.6 0.25 25);
  --color-error-foreground: white;

  /* Elevation shadows */
  --shadow-elevation-1: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-elevation-2: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-elevation-3: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
}
```

### Step 1.3: Enhance Button Component

Update `frontend/components/ui/button.tsx`:

```typescript
// Add new variants
const buttonVariants = cva(
  "...",
  {
    variants: {
      variant: {
        // ... existing variants
        success: "bg-success text-success-foreground hover:bg-success/90",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        danger: "bg-error text-error-foreground hover:bg-error/90",
      },
      size: {
        // ... existing sizes
        xs: "h-8 rounded-md px-2 text-xs",
        xl: "h-12 rounded-md px-10 text-base",
      },
    },
  }
)

// Add props
interface ButtonProps {
  loading?: boolean
  iconName?: string
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
}
```

### Step 1.4: Add CSS Variables for Dark Mode Prep

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --success: 142 76% 36%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 0%;
  --error: 0 84% 60%;
  --error-foreground: 0 0% 100%;
}
```

---

## Phase 2: UI Enhancements

Adopt patterns from `auto_evals_dashboard`. Each feature is independent.

### Step 2.1: Enhanced Traces Explorer

**Source:** `auto_evals_dashboard/src/pages/traces-explorer/`

**Features to add:**
- [ ] Metrics bar with KPIs (total traces, avg latency, error rate, cost)
- [ ] Saved views functionality
- [ ] Column customization
- [ ] Keyboard shortcuts indicator

**Files to modify:**
- `frontend/app/traces/page.tsx`
- Create: `frontend/components/traces/MetricsBar.tsx`
- Create: `frontend/components/traces/ColumnCustomizer.tsx`

### Step 2.2: Daily Review Workflow

**Source:** `auto_evals_dashboard/src/pages/daily-review-workflow/`

**Features to add:**
- [ ] Keyboard shortcuts (1=positive, 2=neutral, 3=negative, Space=skip)
- [ ] Auto-advance mode with configurable delay
- [ ] Undo functionality with undo stack
- [ ] Session statistics (positive/neutral/negative counts)
- [ ] Break reminders for long sessions
- [ ] Completion celebration screen

**Files to modify:**
- `frontend/app/review/page.tsx`
- Create: `frontend/components/review/ReviewStats.tsx`
- Create: `frontend/components/review/SwipeableTraceCard.tsx`

### Step 2.3: Contradiction Matrix Enhancement

**Source:** `auto_evals_dashboard/src/pages/contradiction-detection-matrix-analysis/`

**Features to add:**
- [ ] Two-step flow: Agent Version Overview → Trace Details
- [ ] Bulk selection for refinement
- [ ] Visual contradiction highlighting
- [ ] Filter controls (severity, contradiction type)
- [ ] Resolution actions panel

**Files to modify:**
- `frontend/app/matrix/[agent_id]/page.tsx`
- Create: `frontend/components/matrix/AgentVersionOverview.tsx`
- Create: `frontend/components/matrix/TraceEvaluationDetails.tsx`
- Create: `frontend/components/matrix/FilterControls.tsx`

### Step 2.4: TraceReviewCard Enhancement

**Source:** `auto_evals_dashboard/src/components/IOFoldIntegration/TraceReviewCard.jsx`

**Features to add:**
- [ ] Message rendering by role (user/assistant/system) with color coding
- [ ] Tool call visualization with arguments/results
- [ ] Compact feedback buttons with selection state
- [ ] Loading state for feedback submission

**Files to modify:**
- `frontend/components/trace-review/TraceCard.tsx`

### Step 2.5: Collapsible Sidebar (Optional)

**Source:** `auto_evals_dashboard/src/components/ui/Sidebar.jsx`

**Features to add:**
- [ ] Expand/collapse with animation
- [ ] Section grouping (Navigation, Workflows)
- [ ] Active indicator with framer-motion
- [ ] Persist collapsed state

**Files to modify:**
- `frontend/components/navigation.tsx`
- Create: `frontend/components/ui/sidebar.tsx`

---

## Execution Checklist

### Pre-Flight

- [ ] Create feature branch: `git checkout -b feature/ui-upgrade`
- [ ] Verify Node.js 20+: `node --version`
- [ ] Take database backup (if applicable)
- [ ] Note current test status

### Phase 0: Dependencies

- [ ] **0.1** Run Next.js codemod: `npx @next/codemod@canary upgrade 15.5`
- [ ] **0.1** Fix any async API usage (searchParams, cookies, headers)
- [ ] **0.1** Verify build: `npm run build`
- [ ] **0.2** Upgrade Clerk: `npm install @clerk/nextjs@latest`
- [ ] **0.3** Run Tailwind upgrade: `npx @tailwindcss/upgrade@next`
- [ ] **0.3** Update postcss.config.js
- [ ] **0.3** Migrate tailwind.config.ts to CSS or verify compatibility mode
- [ ] **0.4** Update minor deps: lucide-react, tailwind-merge, sonner, eslint-config-next
- [ ] **0.5** Clean rebuild: `rm -rf .next && npm run build`
- [ ] **0.5** Type check: `npm run type-check`
- [ ] **0.5** Run E2E tests: `npx playwright test`
- [ ] **0.5** Manual smoke test in browser

### Phase 1: Foundation

- [ ] **1.1** Install: recharts, class-variance-authority, react-window
- [ ] **1.2** Add semantic colors to theme
- [ ] **1.3** Enhance Button component
- [ ] **1.4** Add CSS variables
- [ ] Verify build and tests

### Phase 2: Enhancements

- [ ] **2.1** Traces Explorer metrics bar
- [ ] **2.1** Saved views
- [ ] **2.1** Column customization
- [ ] **2.2** Review keyboard shortcuts
- [ ] **2.2** Auto-advance mode
- [ ] **2.2** Undo functionality
- [ ] **2.2** Session stats
- [ ] **2.3** Matrix two-step flow
- [ ] **2.3** Bulk selection
- [ ] **2.4** TraceReviewCard enhancements
- [ ] **2.5** Collapsible sidebar (optional)

### Post-Flight

- [ ] Full E2E test suite
- [ ] Manual testing of all pages
- [ ] Performance check (Lighthouse)
- [ ] Create PR with detailed changelog
- [ ] Deploy to staging

---

## Rollback Plan

### If Phase 0 fails:

```bash
# Revert all changes
git checkout main
git branch -D feature/ui-upgrade

# Or restore from specific commit
git reset --hard <commit-before-upgrade>
```

### If Tailwind 4 causes issues:

```bash
# Downgrade Tailwind
npm install tailwindcss@3.4.18
# Restore old config
git checkout main -- tailwind.config.ts postcss.config.js app/globals.css
```

### If Next.js 15 causes issues:

```bash
# Downgrade Next.js
npm install next@14.2.33 eslint-config-next@14.2.33
# Restore any async API changes
git checkout main -- app/**/*.tsx
```

---

## References

- [Next.js 15 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Clerk v6 Upgrade Guide](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/nextjs-v6)
- [Next.js 15.5 Release Notes](https://nextjs.org/blog/next-15-5)
- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4)

---

## Estimated Time

| Phase | Task | Estimate |
|-------|------|----------|
| 0.1 | Next.js upgrade | 30-60 min |
| 0.2 | Clerk upgrade | 5 min |
| 0.3 | Tailwind upgrade | 60-90 min |
| 0.4-0.5 | Minor deps + verify | 30 min |
| 1.x | UI Foundation | 60 min |
| 2.1 | Traces Explorer | 2-3 hours |
| 2.2 | Review Workflow | 2-3 hours |
| 2.3 | Matrix Enhancement | 3-4 hours |
| 2.4 | TraceReviewCard | 1-2 hours |
| 2.5 | Sidebar (optional) | 2-3 hours |

**Total Phase 0:** ~2-3 hours
**Total Phase 1:** ~1 hour
**Total Phase 2:** ~10-15 hours (incremental)
