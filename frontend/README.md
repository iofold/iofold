# iofold.com Frontend

Modern, type-safe web dashboard for the iofold automated eval generation platform. Built with Next.js 15, TypeScript, and Tailwind CSS, deployed on Cloudflare Workers via OpenNext adapter.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **State Management:** TanStack Query (React Query)
- **Authentication:** Clerk
- **Code Editor:** Monaco Editor
- **Deployment:** Cloudflare Workers via @opennextjs/cloudflare
- **Icons:** Lucide React
- **Notifications:** Sonner
- **Charts:** Recharts
- **AI SDK:** Vercel AI SDK

## Project Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── (auth)/                   # Auth routes (Clerk)
│   │   ├── sign-in/[[...sign-in]]/
│   │   └── sign-up/[[...sign-up]]/
│   ├── (main)/                   # Protected main app routes
│   │   ├── agents/               # Agent management
│   │   │   ├── [id]/             # Agent detail, playground, evals
│   │   │   │   ├── playground/   # Agent testing interface
│   │   │   │   ├── evals/        # Agent-specific evals
│   │   │   │   ├── gepa/         # GEPA optimization dashboard
│   │   │   │   └── tasksets/     # Taskset management
│   │   │   └── page.tsx          # Agent list
│   │   ├── playground/           # Global playground
│   │   ├── traces/               # Trace list & detail
│   │   ├── review/               # Trace review interface
│   │   ├── evals/                # Generated evals
│   │   ├── matrix/               # Comparison matrix
│   │   ├── analytics/            # Analytics dashboard
│   │   ├── integrations/         # Platform connections
│   │   ├── resources/            # Tool registry
│   │   ├── settings/             # User settings
│   │   ├── setup/                # Initial setup wizard
│   │   ├── system/               # System info
│   │   └── page.tsx              # Home page
│   ├── layout.tsx                # Root layout with Clerk
│   ├── globals.css               # Global styles & Tailwind
│   └── not-found.tsx             # 404 page
├── components/                   # React components
│   ├── ui/                       # Base UI components
│   ├── layout/                   # Layout components
│   ├── providers.tsx             # React Query + Clerk providers
│   └── skip-link.tsx             # Accessibility component
├── lib/                          # Utilities & API client
│   ├── api-client.ts             # Type-safe API SDK
│   └── utils.ts                  # Helper functions
├── types/                        # TypeScript definitions
│   ├── agent.ts                  # Agent types
│   ├── taskset.ts                # Taskset types
│   └── api.ts                    # API types
├── hooks/                        # Custom React hooks
│   └── use-playground-chat.ts    # Playground chat logic
├── e2e/                          # Playwright E2E tests
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
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
# Backend API endpoint
NEXT_PUBLIC_API_URL=http://localhost:8787/v1

# Clerk authentication (required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Optional: E2E test credentials
E2E_TEST_EMAIL=e2e-test@iofold.com
E2E_TEST_PASSWORD=...
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

# Build and preview for Cloudflare Workers
pnpm run preview

# Deploy to Cloudflare Workers (production)
pnpm run deploy

# Deploy to staging environment
pnpm run deploy:staging

# Run E2E tests
pnpm run test:e2e

# Run E2E tests in UI mode
pnpm run test:e2e:ui

# Run E2E tests with browser visible
pnpm run test:e2e:headed
```

## Features

### 1. Agent Management

Create and configure AI agents with tools and prompts:

- Agent list and detail views
- Agent-specific playgrounds for testing
- GEPA optimization dashboard for prompt iteration
- Taskset management for benchmarking

**Routes:**
- List: `/agents`
- Detail: `/agents/[id]`
- Playground: `/agents/[id]/playground`
- GEPA: `/agents/[id]/gepa`
- Tasksets: `/agents/[id]/tasksets`

### 2. Playground

Interactive AI agent testing interface:

- Real-time streaming responses
- Tool execution visualization
- Global and agent-specific playgrounds
- Chat history and context management

**Routes:**
- Global: `/playground`
- Agent-specific: `/agents/[id]/playground`
- Eval-specific: `/evals/[id]/playground`

### 3. Trace Review

Browse and annotate imported traces:

- List view with summaries
- Detail view with expandable execution steps
- Filter by source, rating, date range
- Feedback buttons (thumbs up/down/neutral)

**Routes:**
- List: `/traces`
- Detail: `/traces/[id]`
- Review interface: `/review`

### 4. Eval Management

View and manage generated eval functions:

- Python code display with syntax highlighting
- Training accuracy metrics
- Test results breakdown
- Refine and execute actions
- Eval-specific playground for testing

**Routes:**
- List: `/evals`
- Detail: `/evals/[id]`
- Playground: `/evals/[id]/playground`
- Agent evals: `/agents/[id]/evals`

### 5. Comparison Matrix

Compare eval predictions vs human feedback:

- Side-by-side table view
- Contradiction highlighting
- Filter by disagreements/errors
- Drill-down into execution details

**Routes:**
- List: `/matrix`
- Detail: `/matrix/[agent_id]`

### 6. Integrations

Connect to observability platforms (Langfuse, Langsmith):

- Add/remove platform connections
- Test connection status
- View last sync timestamps

**Route:** `/integrations`

### 7. Analytics

System-wide analytics and metrics:

- Usage statistics
- Performance monitoring
- Trace and eval trends

**Route:** `/analytics`

### 8. Resources (Tool Registry)

Manage tools and functions available to agents:

- View and edit tool definitions
- Test tool execution
- Configure tool parameters

**Route:** `/resources`

### 9. System & Settings

Configuration and system information:

- User settings and preferences
- System status and diagnostics
- Initial setup wizard

**Routes:**
- Settings: `/settings`
- System: `/system`
- Setup: `/setup`

## API Integration

The frontend uses a type-safe API client (`lib/api-client.ts`) with Clerk authentication:

```typescript
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@clerk/nextjs'

// In a component, set auth from Clerk
const { getToken } = useAuth()
const token = await getToken()
apiClient.setAuth(token, workspaceId)

// Example: Fetch agents
const agents = await apiClient.listAgents()

// Example: Submit feedback
await apiClient.submitFeedback({
  trace_id: 'trace_123',
  agent_id: 'agent_abc',
  rating: 'positive',
})

// Example: Stream playground responses
const stream = await apiClient.streamPlaygroundChat({
  agent_id: 'agent_abc',
  messages: [...],
})
```

All API types are defined in `types/` based on the API specification.

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

### Cloudflare Workers (via OpenNext)

The frontend is deployed on **Cloudflare Workers** using the `@opennextjs/cloudflare` adapter:

1. **Build for Cloudflare:**

```bash
pnpm run preview  # Build and preview locally
```

2. **Deploy to production:**

```bash
pnpm run deploy
```

3. **Deploy to staging:**

```bash
pnpm run deploy:staging
```

This uses the OpenNext Cloudflare adapter which supports:
- Dynamic routes without static generation
- Server-side rendering on the edge
- API routes (if needed)
- Streaming responses
- Full Next.js 15 App Router features

### Environment Variables in Production

Set in Cloudflare Workers dashboard or via `wrangler secret`:

```bash
# Public variables (set in dashboard)
NEXT_PUBLIC_API_URL=https://api.iofold.com/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# Secret variables (use wrangler)
wrangler secret put CLERK_SECRET_KEY
```

### Build Configuration

- `next.config.js` does NOT use `output: 'export'` (supports dynamic routes)
- Uses `@opennextjs/cloudflare` adapter for Workers deployment
- Images are unoptimized (as configured)
- Supports dynamic rendering and streaming

## Authentication

Authentication is fully implemented using **Clerk** (@clerk/nextjs 6.35.5):

### Setup

1. **ClerkProvider** wraps the app in `app/layout.tsx`
2. **Route groups** separate auth and protected routes:
   - `(auth)/` - Sign in/sign up pages
   - `(main)/` - Protected app routes
3. **Middleware** protects routes (configured in `middleware.ts`)

### Usage

Get auth token in components:

```typescript
import { useAuth } from '@clerk/nextjs'

const { getToken, userId } = useAuth()
const token = await getToken()
apiClient.setAuth(token, workspaceId)
```

### E2E Testing

Clerk testing is configured for Playwright tests:

```typescript
import { clerkSetup } from '@clerk/testing/playwright'

// In global setup
await clerkSetup()

// Test credentials in .env.local:
// E2E_TEST_EMAIL=e2e-test@iofold.com
// E2E_TEST_PASSWORD=...
```

See `frontend/e2e/CLERK_TESTING_SETUP.md` for details.

## Performance Optimizations

- **React Server Components** for static pages (home, lists)
- **Client Components** only where needed (forms, interactive UI)
- **Cursor-based pagination** for large datasets
- **Optimistic updates** for feedback submission
- **Code splitting** via Next.js automatic splitting
- **Stale-while-revalidate** caching with React Query

## Testing

### E2E Tests (Playwright)

Comprehensive E2E test suite covering:

- Authentication flows (sign in/sign up)
- Agent management
- Playground interactions
- Trace review
- Eval generation
- Accessibility testing

Run tests:

```bash
cd frontend
pnpm run test:e2e              # Run all tests
pnpm run test:e2e:ui           # Run in UI mode
pnpm run test:e2e:headed       # Run with browser visible
pnpm run test:e2e:debug        # Debug mode
pnpm run test:e2e:accessibility # Accessibility tests only
```

See `frontend/e2e/README.md` for detailed testing documentation.

## Next Steps

### Future Enhancements

1. **Dark mode** - Theme toggle (next-themes is installed)
2. **Advanced filtering** - More filter options on list pages
3. **Export functionality** - Download Python code, export data
4. **Keyboard shortcuts** - Power user shortcuts
5. **Bulk operations** - Multi-select and batch actions
6. **Enhanced analytics** - More charts and metrics
7. **Collaborative features** - Multi-user workspace support

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

### Cloudflare Workers Deployment Issues

Common issues:
- Check `@opennextjs/cloudflare` is installed and up to date
- Verify environment variables are set in Cloudflare dashboard
- Check Wrangler configuration in `wrangler.toml`
- Ensure Node.js compatibility settings are correct

## Contributing

When adding new pages or components:

1. **Add types** to appropriate files in `types/`
2. **Update API client** in `lib/api-client.ts` if needed
3. **Create reusable components** in `components/`
4. **Use TanStack Query** for data fetching
5. **Follow existing patterns** (see existing pages)
6. **Write E2E tests** for critical user flows
7. **Test accessibility** with Playwright accessibility tests

## Support

For issues or questions:
- Check `/docs` for design documentation
- Review API spec: `docs/plans/2025-11-12-api-specification.md`
- Open GitHub issue with reproduction steps

---

**Built with Next.js 15 + TypeScript + Tailwind CSS v4**
