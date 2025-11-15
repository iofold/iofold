# Frontend Setup Guide

Quick reference for getting the iofold frontend up and running.

## Prerequisites

- Node.js 18+ installed
- Backend API running at `http://localhost:8787`
- Git repository cloned

## Quick Start (5 minutes)

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local

# 4. Start development server
npm run dev
```

Open http://localhost:3000 and you should see the iofold dashboard!

## Project Overview

### Framework Choice: Next.js 14 (App Router)

**Why Next.js over SvelteKit?**

1. **Cloudflare Pages Support** - First-class static export support
2. **React Server Components** - Better for data-heavy dashboards
3. **Larger Ecosystem** - More components and libraries available
4. **TypeScript-first** - Matches backend architecture
5. **Better SSE Support** - Important for real-time job progress

### Directory Structure

```
frontend/
├── app/              # Routes (Next.js App Router)
├── components/       # Reusable React components
├── lib/              # API client & utilities
├── types/            # TypeScript definitions
└── package.json      # Dependencies
```

### Key Technologies

- **Styling:** Tailwind CSS (utility-first)
- **State:** TanStack Query (server state caching)
- **Auth:** Clerk (ready to integrate)
- **Editor:** Monaco (for code viewing)
- **Icons:** Lucide React
- **Toasts:** Sonner

## Route Structure

| Route | Description |
|-------|-------------|
| `/` | Dashboard home |
| `/integrations` | Platform connections (Langfuse, etc) |
| `/traces` | Trace list |
| `/traces/[id]` | Trace detail with feedback |
| `/eval-sets` | Eval set management |
| `/eval-sets/[id]` | Eval set detail with generation |
| `/evals` | Generated eval list |
| `/evals/[id]` | Eval code viewer |
| `/matrix/[eval_set_id]` | Comparison matrix |

## Component Overview

### UI Components (`components/ui/`)

Base components following shadcn/ui patterns:
- `button.tsx` - Button with variants (default, outline, ghost)
- `card.tsx` - Card container with header/content/footer

### Domain Components (`components/`)

Application-specific components:
- `navigation.tsx` - Top nav bar with route links
- `providers.tsx` - React Query provider wrapper
- `trace-card.tsx` - Trace list item with preview
- `trace-detail.tsx` - Expandable trace viewer with steps
- `feedback-buttons.tsx` - Thumbs up/down/neutral with optimistic updates
- `code-viewer.tsx` - Python code display with copy button
- `matrix-table.tsx` - Comparison grid with contradiction highlighting

## API Integration

### Client SDK (`lib/api-client.ts`)

Type-safe wrapper for all backend endpoints:

```typescript
import { apiClient } from '@/lib/api-client'

// All methods are typed based on API spec
const traces = await apiClient.listTraces({ limit: 50 })
const trace = await apiClient.getTrace('trace_123')
await apiClient.submitFeedback({
  trace_id: 'trace_123',
  eval_set_id: 'set_abc',
  rating: 'positive',
})
```

### Type Definitions (`types/api.ts`)

All types match the API specification exactly:
- Request/response types
- Entity types (Trace, Eval, EvalSet, etc)
- Pagination types
- Error types
- SSE event types

## Configuration Files

### `next.config.js`

- Static export for Cloudflare Pages
- Environment variable configuration
- Image optimization settings

### `tailwind.config.ts`

- Design system tokens (colors, spacing)
- Custom theme configuration
- Plugin configuration

### `tsconfig.json`

- Path aliases (@/components, @/lib, etc)
- Strict TypeScript settings
- Next.js plugin integration

### `wrangler.toml`

- Cloudflare Pages deployment config
- Environment settings (production/preview)

## Development Workflow

### 1. Creating New Pages

```typescript
// app/my-page/page.tsx
'use client' // If using client features

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export default function MyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data'],
    queryFn: () => apiClient.listSomething(),
  })

  return <div>{/* Your UI */}</div>
}
```

### 2. Creating Components

```typescript
// components/my-component.tsx
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MyComponentProps {
  data: SomeType
}

export function MyComponent({ data }: MyComponentProps) {
  return (
    <Card className={cn("p-4", /* conditional classes */)}>
      {/* Component UI */}
    </Card>
  )
}
```

### 3. Adding API Methods

```typescript
// lib/api-client.ts
async getSomething(id: string): Promise<Something> {
  return this.request(`/api/something/${id}`)
}
```

### 4. Adding Types

```typescript
// types/api.ts
export interface MyNewType {
  id: string
  name: string
  // ...
}
```

## Testing with Backend

### 1. Start Backend API

```bash
# In project root
npm run dev
# API runs at http://localhost:8787
```

### 2. Verify API Connection

```bash
curl http://localhost:8787/v1/api/integrations
```

Should return `{"integrations":[]}` or actual data.

### 3. Test Frontend Routes

1. Visit http://localhost:3000
2. Navigate through each route
3. Check browser console for errors
4. Verify API calls in Network tab

## Deployment

### To Cloudflare Pages

#### Option 1: CLI Deploy

```bash
npm run pages:build
npm run pages:deploy
```

#### Option 2: GitHub Integration

1. Push code to GitHub
2. Connect repo in Cloudflare Pages dashboard
3. Set build command: `cd frontend && npm run pages:build`
4. Set output directory: `frontend/.vercel/output/static`
5. Add environment variables

### Environment Variables (Production)

Set in Cloudflare Pages dashboard:

```
NEXT_PUBLIC_API_URL=https://api.iofold.com/v1
```

## Common Issues & Solutions

### "Module not found" errors

```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript errors

```bash
npm run type-check
```

### API connection fails

1. Check backend is running: `curl http://localhost:8787/v1/api/integrations`
2. Verify NEXT_PUBLIC_API_URL in .env.local
3. Check CORS settings in backend

### Build fails for Cloudflare

- Ensure `output: 'export'` in next.config.js
- No API routes (use backend API instead)
- No server-side rendering (use client-side fetching)

## Next Steps

1. **Run backend**: See `/src` directory for setup
2. **Add authentication**: Integrate Clerk
3. **Test all features**: Import traces, create eval sets, generate evals
4. **Deploy**: Push to Cloudflare Pages

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [API Specification](../docs/plans/2025-11-12-api-specification.md)

---

**Need help?** Check the main README.md or open an issue on GitHub.
