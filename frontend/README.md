# iofold.com Frontend

Modern, type-safe web dashboard for the iofold automated eval generation platform. Built with Next.js 14, TypeScript, and Tailwind CSS, optimized for Cloudflare Pages deployment.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** TanStack Query (React Query)
- **Authentication:** Clerk (ready to integrate)
- **Code Editor:** Monaco Editor
- **Deployment:** Cloudflare Pages
- **Icons:** Lucide React
- **Notifications:** Sonner

## Project Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Home page
│   ├── layout.tsx                # Root layout with navigation
│   ├── globals.css               # Global styles & Tailwind
│   ├── integrations/             # Platform connections
│   │   └── page.tsx
│   ├── traces/                   # Trace list & detail
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── eval-sets/                # Eval set management
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── evals/                    # Generated evals
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── matrix/                   # Comparison matrix
│       └── [eval_set_id]/page.tsx
├── components/                   # React components
│   ├── ui/                       # Base UI components
│   │   ├── button.tsx
│   │   └── card.tsx
│   ├── navigation.tsx            # Main nav bar
│   ├── providers.tsx             # React Query provider
│   ├── trace-card.tsx            # Trace list item
│   ├── trace-detail.tsx          # Expandable trace viewer
│   ├── feedback-buttons.tsx      # Thumbs up/down/neutral
│   ├── code-viewer.tsx           # Python code display
│   └── matrix-table.tsx          # Comparison grid
├── lib/                          # Utilities & API client
│   ├── api-client.ts             # Type-safe API SDK
│   └── utils.ts                  # Helper functions
├── types/                        # TypeScript definitions
│   └── api.ts                    # API types from spec
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── wrangler.toml                 # Cloudflare Pages config
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Backend API running (see `/src` for backend setup)

### Installation

1. **Install dependencies:**

```bash
cd frontend
pnpm install
```

2. **Configure environment variables:**

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# Point to your backend API (local or deployed)
NEXT_PUBLIC_API_URL=http://localhost:8787/v1

# Optional: Clerk authentication (for production)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...
```

3. **Run development server:**

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Development Commands

```bash
# Run dev server with hot reload
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start

# Run linter
pnpm run lint

# Type check
pnpm run type-check

# Build for Cloudflare Pages
pnpm run pages:build

# Deploy to Cloudflare Pages
pnpm run pages:deploy
```

## Features

### 1. Integrations Management

Connect to observability platforms (Langfuse, Langsmith, OpenAI):

- Add/remove platform connections
- Test connection status
- View last sync timestamps

**Route:** `/integrations`

### 2. Trace Review

Browse and annotate imported traces:

- List view with summaries (input/output previews)
- Detail view with expandable execution steps
- Filter by source, rating, date range
- Feedback buttons (thumbs up/down/neutral)

**Routes:**
- List: `/traces`
- Detail: `/traces/[id]`

### 3. Eval Set Management

Organize feedback collections:

- Create named eval sets
- Track feedback statistics (positive/negative/neutral counts)
- Generate button (enabled at minimum examples threshold)
- View associated evals

**Routes:**
- List: `/eval-sets`
- Detail: `/eval-sets/[id]`

### 4. Eval Viewer

View and manage generated eval functions:

- Python code display with syntax highlighting
- Training accuracy metrics
- Test results breakdown
- Execution count & contradictions
- Refine and execute actions

**Routes:**
- List: `/evals`
- Detail: `/evals/[id]`

### 5. Comparison Matrix

Compare eval predictions vs human feedback:

- Side-by-side table view
- Contradiction highlighting
- Filter by disagreements/errors
- Drill-down into execution details

**Route:** `/matrix/[eval_set_id]`

## API Integration

The frontend uses a type-safe API client (`lib/api-client.ts`) that matches the backend specification:

```typescript
import { apiClient } from '@/lib/api-client'

// Set auth (from Clerk or other provider)
apiClient.setAuth(token, workspaceId)

// Example: Fetch traces
const traces = await apiClient.listTraces({ limit: 50 })

// Example: Submit feedback
await apiClient.submitFeedback({
  trace_id: 'trace_123',
  eval_set_id: 'set_abc',
  rating: 'positive',
})

// Example: Stream job progress (SSE)
const eventSource = apiClient.streamJob('job_xyz')
eventSource.addEventListener('progress', (e) => {
  console.log(JSON.parse(e.data))
})
```

All API types are defined in `types/api.ts` based on the API specification.

## State Management

Uses **TanStack Query (React Query)** for server state:

- Automatic caching & revalidation
- Optimistic updates for feedback
- Background refetching
- SSE integration for real-time updates

Example query:

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['traces'],
  queryFn: () => apiClient.listTraces({ limit: 50 }),
})
```

Example mutation with optimistic updates:

```typescript
const mutation = useMutation({
  mutationFn: (feedback) => apiClient.submitFeedback(feedback),
  onMutate: async (feedback) => {
    // Update UI immediately
    updateUIOptimistically(feedback)
  },
  onSuccess: () => {
    // Invalidate and refetch
    queryClient.invalidateQueries(['traces'])
  },
})
```

## Styling

Uses **Tailwind CSS** with custom design system:

- CSS variables for theming (see `app/globals.css`)
- Utility-first approach
- Responsive design with mobile breakpoints
- Dark mode ready (add theme toggle)

Custom utilities in `lib/utils.ts`:

```typescript
cn()                    // Merge Tailwind classes
formatDate()            // Format ISO timestamps
formatRelativeTime()    // "2h ago", "3d ago"
formatDuration()        // "1m 30s"
formatPercentage()      // "90%"
getStatusColor()        // Status badge colors
getRatingColor()        // Feedback badge colors
getRatingEmoji()        // 👍 👎 😐
```

## Deployment

### Cloudflare Pages

The frontend is configured for **static export** to deploy on Cloudflare Pages:

1. **Build for Cloudflare:**

```bash
pnpm run pages:build
```

This creates a static export in `.vercel/output/static/` compatible with Cloudflare Pages.

2. **Deploy:**

```bash
pnpm run pages:deploy
```

Or connect your GitHub repo to Cloudflare Pages dashboard for automatic deployments.

### Environment Variables in Production

Set in Cloudflare Pages dashboard:

```
NEXT_PUBLIC_API_URL=https://api.iofold.com/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
```

### Build Configuration

- `next.config.js` sets `output: 'export'` for static generation
- Images are unoptimized (no server-side image optimization)
- All pages are pre-rendered at build time
- Client-side data fetching with React Query

## Authentication (TODO)

Authentication is **not yet implemented** but ready for Clerk integration:

1. **Install Clerk:**

```bash
pnpm add @clerk/nextjs
```

2. **Wrap app in ClerkProvider** (in `app/layout.tsx`)

3. **Protect routes with middleware**

4. **Get auth token:**

```typescript
import { useAuth } from '@clerk/nextjs'

const { getToken } = useAuth()
const token = await getToken()
apiClient.setAuth(token, workspaceId)
```

See Clerk docs: https://clerk.com/docs/quickstarts/nextjs

## Performance Optimizations

- **React Server Components** for static pages (home, lists)
- **Client Components** only where needed (forms, interactive UI)
- **Cursor-based pagination** for large datasets
- **Optimistic updates** for feedback submission
- **Code splitting** via Next.js automatic splitting
- **Stale-while-revalidate** caching with React Query

## Next Steps

### Immediate

1. **Run backend API** (see `/src` directory)
2. **Test all routes** with real data
3. **Implement authentication** with Clerk
4. **Add SSE progress bars** for job monitoring

### Future Enhancements

1. **Real-time updates** with Server-Sent Events
2. **Dark mode toggle**
3. **Advanced filtering** on list pages
4. **Export functionality** (download Python code)
5. **Keyboard shortcuts** for power users
6. **Bulk operations** (delete multiple traces)
7. **Analytics dashboard** with charts (Recharts/Victory)
8. **Monaco Editor** for code editing (inline eval refinement)

## Troubleshooting

### API Connection Issues

If you see "Failed to fetch" errors:

1. Check backend is running: `curl http://localhost:8787/v1/api/integrations`
2. Verify `NEXT_PUBLIC_API_URL` in `.env.local`
3. Check CORS settings in backend (`src/index.ts`)

### Build Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Type check
pnpm run type-check
```

### Cloudflare Pages Build Fails

Ensure:
- `output: 'export'` in `next.config.js`
- No server-side APIs (API routes not supported in static export)
- All data fetching is client-side

## Contributing

When adding new pages or components:

1. **Add types** to `types/api.ts` if needed
2. **Update API client** in `lib/api-client.ts`
3. **Create reusable components** in `components/`
4. **Use TanStack Query** for data fetching
5. **Follow existing patterns** (see existing pages)

## Support

For issues or questions:
- Check `/docs` for design documentation
- Review API spec: `docs/plans/2025-11-12-api-specification.md`
- Open GitHub issue with reproduction steps

---

**Built with Next.js 14 + TypeScript + Tailwind CSS**
