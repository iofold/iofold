# New Brand Color Palette Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Mint/Coral color palette with a new muted brand palette featuring Seafoam (#4ECDC4) as primary and Blush (#FF6B9D) as secondary, with proper dark mode support.

**Architecture:** The color system is centralized in CSS custom properties (`globals.css`) with Tailwind consuming these via `hsl(var(--...))` pattern. We'll update the CSS variables, add accent palette for charts/tags, and ensure the theme provider is functional.

**Tech Stack:** Next.js 15, Tailwind CSS 4, CSS Custom Properties, next-themes

---

## Color Palette Reference

### Brand Colors
| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Primary | #4ECDC4 | 174 58% 56% | Primary actions, focus rings |
| Primary Muted | #B2DFDB | 174 37% 79% | Subtle primary backgrounds |
| Secondary | #FF6B9D | 342 100% 71% | Secondary actions, highlights |
| Secondary Muted | #FFCDD2 | 354 100% 90% | Subtle secondary backgrounds |

### Dark Mode Backgrounds
| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| BG 1 (Page) | #0D1117 | 216 28% 7% | Page background |
| BG 2 (Card) | #161B22 | 215 21% 11% | Card surfaces |
| BG 3 (Elevated) | #21262D | 215 14% 15% | Elevated elements |
| BG 4 (Border) | #30363D | 212 12% 21% | Borders |

### Light Mode Backgrounds
| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| BG 1 (Page) | #FFFFFF | 0 0% 100% | Page background |
| BG 2 (Card) | #F6F8FA | 210 20% 98% | Card surfaces |
| BG 3 (Elevated) | #EAEEF2 | 210 17% 93% | Elevated elements |
| BG 4 (Border) | #D0D7DE | 210 14% 84% | Borders |

### Status/Semantic Colors
| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Success | #4CAF50 | 122 39% 49% | Success states |
| Success Muted | #81C784 | 123 38% 65% | Subtle success |
| Warning | #FFC107 | 45 100% 51% | Warning states |
| Warning Muted | #FFD54F | 45 100% 65% | Subtle warning |
| Error | #D84315 | 14 82% 47% | Error states |
| Error Muted | #FF8A8A | 0 100% 77% | Subtle error |
| Info | #5C9EAD | 192 32% 52% | Info states |
| Info Muted | #90A4AE | 200 15% 62% | Subtle info |

### Accent Palette (Charts, Tags, Differentiation)
| Name | Hex | Usage |
|------|-----|-------|
| mint | #A8E6CF | Chart series 1 |
| seafoam | #4ECDC4 | Chart series 2 (primary) |
| coral | #FF8A8A | Chart series 3 |
| blush | #FF6B9D | Chart series 4 (secondary) |
| peach | #FFAB76 | Chart series 5 |
| gold | #FFC107 | Highlights, warnings |
| sage | #4CAF50 | Success indicators |
| forest | #1B5E20 | Deep success |
| teal | #37474F | Neutral dark |
| clay | #8D6E63 | Neutral warm |

---

## Task 1: Update CSS Custom Properties (Light Mode)

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/app/globals.css:7-108`

**Step 1: Replace :root color variables**

Replace lines 7-108 with:

```css
:root {
  /* shadcn/ui HSL variables for compatibility */
  --background: 0 0% 100%;
  --foreground: 215 14% 15%;
  --card: 210 20% 98%;
  --card-foreground: 215 14% 15%;
  --primary: 174 58% 56%;
  --primary-foreground: 0 0% 100%;
  --secondary: 342 100% 71%;
  --secondary-foreground: 0 0% 100%;
  --muted: 210 17% 93%;
  --muted-foreground: 215 14% 40%;
  --accent: 174 37% 79%;
  --accent-foreground: 215 14% 15%;
  --destructive: 14 82% 47%;
  --destructive-foreground: 0 0% 100%;
  --border: 210 14% 84%;
  --input: 210 14% 84%;
  --ring: 174 58% 56%;
  --radius: 0.5rem;

  /* Semantic colors */
  --success: 122 39% 49%;
  --success-foreground: 0 0% 100%;
  --warning: 45 100% 51%;
  --warning-foreground: 0 0% 0%;
  --error: 14 82% 47%;
  --error-foreground: 0 0% 100%;

  /* Info color */
  --info: 192 32% 52%;
  --info-foreground: 0 0% 100%;

  /* Elevation shadows */
  --shadow-elevation-1: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-elevation-2: 0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
  --shadow-elevation-3: 0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04);

  /* IOFold Brand Colors - New Palette */
  --color-background: #FFFFFF;
  --color-foreground: #21262D;
  --color-border: #D0D7DE;
  --color-input: #FFFFFF;
  --color-ring: #4ECDC4;

  /* Surface Colors */
  --color-card: #F6F8FA;
  --color-card-foreground: #21262D;
  --color-popover: #FFFFFF;
  --color-popover-foreground: #21262D;

  /* Muted Colors */
  --color-muted: #EAEEF2;
  --color-muted-foreground: #57606A;

  /* Primary Colors - Seafoam */
  --color-primary: #4ECDC4;
  --color-primary-foreground: #FFFFFF;
  --color-primary-muted: #B2DFDB;

  /* Secondary Colors - Blush */
  --color-secondary: #FF6B9D;
  --color-secondary-foreground: #FFFFFF;
  --color-secondary-muted: #FFCDD2;

  /* Accent Colors */
  --color-accent: #B2DFDB;
  --color-accent-foreground: #21262D;

  /* Status Colors */
  --color-success: #4CAF50;
  --color-success-foreground: #FFFFFF;
  --color-success-muted: #81C784;

  --color-warning: #FFC107;
  --color-warning-foreground: #21262D;
  --color-warning-muted: #FFD54F;

  --color-error: #D84315;
  --color-error-foreground: #FFFFFF;
  --color-error-muted: #FF8A8A;

  --color-destructive: #D84315;
  --color-destructive-foreground: #FFFFFF;

  /* Chart Colors - Accent Palette */
  --chart-primary: #4ECDC4;
  --chart-primary-dark: #37474F;
  --chart-primary-light: #A8E6CF;

  --chart-secondary: #FF6B9D;
  --chart-secondary-dark: #D84315;
  --chart-secondary-light: #FF8A8A;

  --chart-tertiary: #FFAB76;
  --chart-quaternary: #FFC107;
  --chart-quinary: #8D6E63;

  --chart-grid: #EAEEF2;
  --chart-axis: #57606A;
  --chart-text: #21262D;

  /* Accent Palette for Tags/Charts */
  --accent-mint: #A8E6CF;
  --accent-seafoam: #4ECDC4;
  --accent-coral: #FF8A8A;
  --accent-blush: #FF6B9D;
  --accent-peach: #FFAB76;
  --accent-gold: #FFC107;
  --accent-sage: #4CAF50;
  --accent-forest: #1B5E20;
  --accent-teal: #37474F;
  --accent-clay: #8D6E63;

  /* Heat Map Colors */
  --heatmap-success: #4CAF50;
  --heatmap-error: #D84315;
  --heatmap-neutral: #B2DFDB;
}
```

**Step 2: Verify the file saved correctly**

Run: `head -120 /home/ygupta/workspace/iofold/frontend/app/globals.css`

**Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(theme): update light mode colors to new brand palette"
```

---

## Task 2: Update CSS Custom Properties (Dark Mode)

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/app/globals.css:110-153`

**Step 1: Replace .dark selector variables**

Replace lines 110-153 with:

```css
.dark {
  --background: 216 28% 7%;
  --foreground: 210 17% 93%;
  --card: 215 21% 11%;
  --card-foreground: 210 17% 93%;
  --primary: 174 58% 56%;
  --primary-foreground: 216 28% 7%;
  --secondary: 342 100% 71%;
  --secondary-foreground: 216 28% 7%;
  --muted: 215 14% 15%;
  --muted-foreground: 210 14% 60%;
  --accent: 215 14% 15%;
  --accent-foreground: 210 17% 93%;
  --destructive: 14 82% 47%;
  --destructive-foreground: 0 0% 100%;
  --border: 212 12% 21%;
  --input: 212 12% 21%;
  --ring: 174 58% 56%;

  /* Semantic colors - dark mode */
  --success: 122 39% 49%;
  --success-foreground: 0 0% 100%;
  --warning: 45 100% 51%;
  --warning-foreground: 0 0% 0%;
  --error: 14 82% 55%;
  --error-foreground: 0 0% 100%;
  --info: 192 32% 52%;
  --info-foreground: 0 0% 100%;

  /* IOFold Brand Colors - Dark Mode */
  --color-background: #0D1117;
  --color-foreground: #EAEEF2;
  --color-border: #30363D;
  --color-input: #161B22;
  --color-ring: #4ECDC4;

  --color-card: #161B22;
  --color-card-foreground: #EAEEF2;
  --color-popover: #161B22;
  --color-popover-foreground: #EAEEF2;

  --color-muted: #21262D;
  --color-muted-foreground: #8B949E;

  --color-primary-muted: #21403E;
  --color-secondary-muted: #3D2030;
  --color-success-muted: #1E3A1E;
  --color-warning-muted: #3D3010;
  --color-error-muted: #3D1510;

  /* Chart colors for dark mode */
  --chart-grid: #30363D;
  --chart-axis: #8B949E;
  --chart-text: #EAEEF2;
}
```

**Step 2: Verify the file**

Run: `sed -n '110,160p' /home/ygupta/workspace/iofold/frontend/app/globals.css`

**Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(theme): update dark mode colors to new brand palette"
```

---

## Task 3: Install and Configure next-themes

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/package.json`
- Modify: `/home/ygupta/workspace/iofold/frontend/components/providers.tsx`
- Modify: `/home/ygupta/workspace/iofold/frontend/app/layout.tsx`

**Step 1: Install next-themes**

Run: `cd /home/ygupta/workspace/iofold/frontend && bun add next-themes`

**Step 2: Update providers.tsx**

Add ThemeProvider to the existing providers:

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
```

**Step 3: Add suppressHydrationWarning to html tag in layout.tsx**

In `/home/ygupta/workspace/iofold/frontend/app/layout.tsx`, update the html tag:

```tsx
<html lang="en" suppressHydrationWarning>
```

**Step 4: Verify theme provider works**

Run: `cd /home/ygupta/workspace/iofold/frontend && bun run dev`

Navigate to http://localhost:3000 and check browser devtools - html element should have no class initially (system theme).

**Step 5: Commit**

```bash
git add frontend/package.json frontend/bun.lockb frontend/components/providers.tsx frontend/app/layout.tsx
git commit -m "feat(theme): add next-themes for theme switching"
```

---

## Task 4: Update Settings Theme Toggle

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/app/settings/page.tsx`

**Step 1: Import useTheme hook**

Add import at the top:

```tsx
import { useTheme } from 'next-themes'
```

**Step 2: Replace local state with useTheme**

Find the useState for theme and replace:

```tsx
// Remove: const [theme, setTheme] = useState('system')
// Add:
const { theme, setTheme } = useTheme()
const [mounted, setMounted] = useState(false)

useEffect(() => {
  setMounted(true)
}, [])
```

**Step 3: Update theme selector to use real values**

The select should now properly toggle themes.

**Step 4: Test theme switching**

1. Navigate to http://localhost:3000/settings
2. Change theme mode dropdown
3. Verify page colors change

**Step 5: Commit**

```bash
git add frontend/app/settings/page.tsx
git commit -m "feat(theme): connect settings theme toggle to next-themes"
```

---

## Task 5: Update Hardcoded Colors in Components

**Files to scan and update:**
- `/home/ygupta/workspace/iofold/frontend/components/feedback-buttons.tsx`
- `/home/ygupta/workspace/iofold/frontend/components/feedback-history.tsx`
- `/home/ygupta/workspace/iofold/frontend/components/swipable-trace-card.tsx`
- `/home/ygupta/workspace/iofold/frontend/components/traces/trace-timeline.tsx`
- `/home/ygupta/workspace/iofold/frontend/app/agents/page.tsx`
- `/home/ygupta/workspace/iofold/frontend/app/evals/page.tsx`
- `/home/ygupta/workspace/iofold/frontend/components/matrix/*.tsx`

**Step 1: Search for hardcoded Tailwind colors**

Run: `grep -r "green-\|red-\|blue-\|yellow-\|orange-\|purple-\|gray-\|slate-" /home/ygupta/workspace/iofold/frontend/components /home/ygupta/workspace/iofold/frontend/app --include="*.tsx" | head -50`

**Step 2: Replace patterns systematically**

Color mapping for replacements:
- `green-50` → `bg-success/10` or keep for semantic success
- `green-500/600/700` → `text-success` or `bg-success`
- `red-50` → `bg-error/10` or `bg-destructive/10`
- `red-500/600/700` → `text-error` or `text-destructive`
- `yellow-50` → `bg-warning/10`
- `yellow-500/600/700` → `text-warning` or `bg-warning`
- `blue-50` → `bg-info/10`
- `blue-500/600/700` → `text-info` or `bg-info`
- `gray-*` → `text-muted-foreground`, `bg-muted`, `border-border`
- `slate-*` → Use semantic colors

**Step 3: Update each file**

For each file, replace hardcoded colors with CSS variable-based classes.

Example for feedback-buttons.tsx:
```tsx
// Before: bg-green-50 border-green-500 text-green-700
// After: bg-success/10 border-success text-success
```

**Step 4: Verify visual consistency**

Check each component visually in the browser.

**Step 5: Commit**

```bash
git add frontend/components frontend/app
git commit -m "refactor(theme): replace hardcoded colors with semantic variables"
```

---

## Task 6: Update Chart Colors

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/components/charts/evaluation-chart.tsx`
- Modify: `/home/ygupta/workspace/iofold/frontend/components/charts/pass-rate-trend-chart.tsx`
- Modify: `/home/ygupta/workspace/iofold/frontend/components/charts/distribution-chart.tsx`
- Modify: `/home/ygupta/workspace/iofold/frontend/app/evals/page.tsx` (score colors)

**Step 1: Update chart color mappings**

In evaluation-chart.tsx, update metricColors:

```tsx
const metricColors: Record<string, string> = {
  success_rate: 'var(--chart-primary)',
  performance_score: 'var(--accent-sage)',
  latency: 'var(--chart-secondary)',
  cost_per_run: 'var(--accent-peach)',
  accuracy: 'var(--accent-gold)'
}
```

**Step 2: Update score distribution colors in evals/page.tsx**

```tsx
const scoreColors = [
  '#D84315',  // 0-20: Error
  '#FF8A8A',  // 21-40: Error muted
  '#8B949E',  // 41-60: Neutral
  '#B2DFDB',  // 61-80: Primary muted
  '#4ECDC4',  // 81-90: Primary
  '#4CAF50',  // 91-100: Success
]
```

**Step 3: Verify charts display correctly**

Navigate to dashboard and evals pages, check chart colors.

**Step 4: Commit**

```bash
git add frontend/components/charts frontend/app/evals
git commit -m "feat(theme): update chart colors to new accent palette"
```

---

## Task 7: Update Sidebar Colors

**Files:**
- Modify: `/home/ygupta/workspace/iofold/frontend/components/sidebar/sidebar.tsx`

**Step 1: Update sidebar styling**

Ensure sidebar uses CSS variables:
- Background: `bg-card` (will use --color-card)
- Border: `border-border`
- Active item: `bg-primary text-primary-foreground`
- Inactive item: `text-muted-foreground hover:text-foreground`

**Step 2: Verify sidebar in light and dark modes**

Toggle theme and verify sidebar looks correct.

**Step 3: Commit**

```bash
git add frontend/components/sidebar
git commit -m "feat(theme): update sidebar to use CSS variables"
```

---

## Task 8: Visual QA Across All Pages

**Step 1: Create QA checklist**

Pages to verify:
- [ ] Dashboard (/)
- [ ] Agents (/agents)
- [ ] Agent Detail (/agents/[id])
- [ ] Traces (/traces)
- [ ] Trace Detail (/traces/[id])
- [ ] Evals (/evals)
- [ ] Eval Detail (/evals/[id])
- [ ] Review (/review)
- [ ] Matrix (/matrix)
- [ ] Settings (/settings)
- [ ] System (/system)
- [ ] Integrations (/integrations)

**Step 2: Test each page in light mode**

Navigate to each page and verify:
- Text is readable
- Buttons have proper contrast
- Cards are distinguishable from background
- Status colors are correct (success=green, error=red, warning=yellow)
- Charts display correctly

**Step 3: Test each page in dark mode**

Toggle to dark mode and repeat verification.

**Step 4: Take screenshots for documentation**

Save before/after screenshots to `.tmp/screenshots/`

**Step 5: Document any issues found**

Create a list of any visual issues that need fixing.

---

## Task 9: Update Progress Log

**Files:**
- Modify: `/home/ygupta/workspace/iofold/docs/progress_log.md`

**Step 1: Add entry for theme update**

```markdown
## 2025-11-30

### New Brand Color Palette Implementation

**Completed:**
- Updated light mode color variables in globals.css
- Updated dark mode color variables in globals.css
- Installed and configured next-themes for theme switching
- Connected settings page theme toggle to next-themes
- Updated hardcoded colors in components to use CSS variables
- Updated chart colors to new accent palette
- Updated sidebar colors

**Files Changed:**
- `frontend/app/globals.css` - CSS custom properties
- `frontend/components/providers.tsx` - ThemeProvider
- `frontend/app/layout.tsx` - suppressHydrationWarning
- `frontend/app/settings/page.tsx` - Theme toggle
- `frontend/components/charts/*.tsx` - Chart colors
- `frontend/components/sidebar/sidebar.tsx` - Sidebar colors
- Various component files - Hardcoded color replacements

**New Color Palette:**
- Primary: #4ECDC4 (Seafoam)
- Secondary: #FF6B9D (Blush)
- Success: #4CAF50
- Warning: #FFC107
- Error: #D84315
- Info: #5C9EAD
```

**Step 2: Commit**

```bash
git add docs/progress_log.md
git commit -m "docs: update progress log with theme implementation"
```

---

## Execution Summary

Total tasks: 9
Estimated time: 2-3 hours

**Critical path:**
1. Task 1-2: CSS variables (foundation)
2. Task 3: Theme provider (enables dark mode)
3. Task 4: Settings toggle (user control)
4. Task 5-7: Component updates (visual consistency)
5. Task 8: QA (verification)
6. Task 9: Documentation

**Dependencies:**
- Tasks 1-2 must complete before Task 3-8
- Task 3 must complete before Task 4
- Tasks 5-7 can run in parallel after Task 2
