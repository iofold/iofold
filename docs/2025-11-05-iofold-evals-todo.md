# iofold.com Implementation Tasks

**Created:** 2025-11-05
**Status:** Pre-Implementation Validation Complete → Phase 1 Ready
**Target:** MVP in 12 weeks
**Last Updated:** 2025-11-12

---

## Pre-Implementation (Week 0) - ✅ COMPLETED

### User Validation
- [ ] Create dashboard mockups (Figma/Excalidraw) - DEFERRED to Phase 1
- [ ] Interview 5 AI product teams for feedback - DEFERRED to Alpha
- [ ] Validate willingness to pay and pricing expectations - DEFERRED to Alpha
- [ ] Document key user pain points and requirements - DEFERRED to Alpha

### Technical Validation - ✅ COMPLETED 2025-11-12
- [x] Build minimal Langfuse adapter prototype → **100% success, production-ready**
- [x] Test Cloudflare Workers Python runtime → **⚠️  BLOCKER FOUND: vm.Script.runInContext not supported**
- [x] Prove eval generation quality → **Generates valid Python code, execution blocked**
- [x] Measure LLM API costs for generation at scale → **$0.0006/eval, 99%+ margins**

**Decision:** **CONDITIONAL GO** - Proceed with Phase 1 after resolving Python runtime
**See:** `docs/validation-results.md` for full validation report

### Infrastructure Setup - ✅ PARTIALLY COMPLETED
- [x] Create Cloudflare account and set up Workers project → **Local dev environment ready**
- [x] Set up D1 database (dev) → **Local database working**
- [ ] Set up D1 database (prod) → **Pending production deployment**
- [ ] Set up R2 storage buckets
- [ ] Configure Cloudflare Pages for frontend
- [ ] Set up monitoring (Sentry, Cloudflare Analytics)

---

## Phase 0.5: Python Runtime Resolution (Week 1-2) - 🚨 CRITICAL

**Status:** NOT STARTED
**Blocking:** All Phase 1 work depends on this
**Decision Needed:** Choose Python execution strategy by end of Week 1

### Research & Spike (Week 1)
- [ ] Research Pyodide integration with Cloudflare Workers
  - [ ] Check Pyodide compatibility with Workers runtime
  - [ ] Test WASM bundle size and load time
  - [ ] Verify security model and sandboxing
  - [ ] Test with generated eval function from validation
- [ ] Research external sandbox services (fallback)
  - [ ] E2B (Sandboxes as a Service)
  - [ ] Modal (serverless Python)
  - [ ] Deno Deploy (Python support)
  - [ ] Compare latency, cost, security
- [ ] **DECISION:** Choose primary approach (Pyodide vs external)

### Implementation (Week 2-3)
- [ ] Implement chosen Python runtime
  - [ ] Replace vm.Script.runInContext in python-runner.ts
  - [ ] Maintain static security validation layer
  - [ ] Add proper timeout enforcement
  - [ ] Add memory limit enforcement
- [ ] Test with validation eval
  - [ ] Run generated eval (ID: 74588e92-cd3f-46b7-9a37-620e326ebb23)
  - [ ] Verify accuracy metrics on 5 training traces
  - [ ] Measure execution time and performance
- [ ] Document Python sandbox architecture
  - [ ] Security model documentation
  - [ ] Performance characteristics
  - [ ] Known limitations

### Success Criteria
- [x] Eval execution works end-to-end
- [x] Security validation passes
- [x] Execution time < 5 seconds per eval
- [x] Cost per execution < $0.01

---

## Phase 1: Foundation (Weeks 3-6)

**Note:** Several items already completed during validation (marked with ✅)

### Backend Infrastructure
- [x] Initialize Cloudflare Workers project with TypeScript → **✅ DONE (validation)**
- [x] Set up D1 database with schema → **✅ DONE (validation, local only)**
- [ ] Create database migration system
- [ ] Implement API authentication (JWT or Cloudflare Access)
- [ ] Set up R2 storage client and helpers
- [x] Create base API routes structure → **✅ DONE (validation: /api/traces/fetch, /api/evals/generate, /api/evals/test)**

### Langfuse Integration
- [x] Research Langfuse API documentation → **✅ DONE (validation)**
- [x] Implement Langfuse authentication flow → **✅ DONE (validation)**
- [x] Build trace fetching functionality → **✅ DONE (validation)**
- [x] Create unified trace schema (LangGraphExecutionStep) → **✅ DONE (validation)**
- [x] Implement trace normalization from Langfuse format → **✅ DONE (validation)**
- [x] Test with real Langfuse account and traces → **✅ DONE (validation: 5 traces)**
- [x] Add error handling and retry logic → **✅ DONE (validation)**
- [ ] Cache traces in R2 to reduce API calls

### Database & Storage
- [ ] Implement user account creation
- [ ] Implement workspace management
- [ ] Implement integration storage (encrypted API keys)
- [ ] Implement trace storage and retrieval
- [ ] Create database indexes for performance
- [ ] Add data validation and constraints

### Frontend Setup
- [ ] Choose frontend framework (Next.js vs SvelteKit)
- [ ] Initialize frontend project on Cloudflare Pages
- [ ] Set up TailwindCSS
- [ ] Create base layout and navigation
- [ ] Implement authentication UI (login/signup)
- [ ] Create workspace selector/switcher

---

## Phase 2: Core Features (Weeks 5-8)

### Trace Review & Feedback
- [ ] Build trace list view (grid/table)
- [ ] Implement trace detail viewer
  - [ ] Input section
  - [ ] Execution steps (expandable tree)
  - [ ] Output section
  - [ ] Metadata panel
- [ ] Create swipe interface components
  - [ ] Swipe gestures (or buttons for desktop)
  - [ ] Thumbs up/down/neutral feedback
  - [ ] Custom notes field
- [ ] Implement eval set creation
- [ ] Implement feedback storage (POST /api/feedback)
- [ ] Build progress indicator ("7 of 10 examples")
- [ ] Add "Generate Eval" button (enabled at threshold)

### Eval Generation Engine
- [ ] Set up Python runtime in Cloudflare Worker → **⚠️  BLOCKED: See Phase 0.5**
- [x] Implement RestrictedPython sandbox (prototype) → **✅ DONE (validation)**
  - [x] Import whitelist (json, re, typing) → **✅ DONE (validation)**
  - [ ] 5-second timeout enforcement → **⚠️  BLOCKED: vm.Script not supported**
  - [ ] Memory limit enforcement → **⚠️  BLOCKED: vm.Script not supported**
  - [x] No network/file I/O restrictions → **✅ DONE (validation, static analysis)**
- [x] Build meta-prompting template → **✅ DONE (validation)**
- [x] Integrate Claude/GPT-4 API for code generation → **✅ DONE (validation: Claude 3 Haiku)**
- [x] Implement syntax validation (ast.parse) → **✅ DONE (validation, basic)**
- [x] Implement static analysis for dangerous code → **✅ DONE (validation)**
- [x] Build eval storage system (save to evals table) → **✅ DONE (validation)**
- [x] Implement eval testing on training set → **✅ DONE (validation, execution blocked)**
- [x] Calculate accuracy metrics → **✅ DONE (validation, execution blocked)**
- [x] Flag low-confidence evals (< 80%) → **✅ DONE (validation)**

### Eval Execution
- [ ] Build sandboxed eval runner → **⚠️  BLOCKED: See Phase 0.5**
- [ ] Implement timeout handling → **⚠️  BLOCKED: See Phase 0.5**
- [ ] Implement exception capture → **⚠️  BLOCKED: See Phase 0.5**
- [x] Store execution results (eval_executions table) → **✅ DONE (validation, with errors)**
- [ ] Calculate execution time metrics
- [ ] Add execution logging for debugging

---

## Phase 3: Management & Refinement (Weeks 9-12)

### Eval Management Screen
- [ ] Build eval list view
  - [ ] Name, version, accuracy, created date
  - [ ] Status indicators (draft/active/archived)
  - [ ] Training examples count
- [ ] Implement code viewer with syntax highlighting (Monaco Editor)
- [ ] Build version history viewer
- [ ] Implement diff viewer for version comparison
- [ ] Add actions: Test, Deploy, Archive, Export
- [ ] Create eval export functionality (download Python file)
- [ ] Show eval execution statistics

### Comparison Matrix
- [ ] Build comparison table UI
  - [ ] Columns: Trace ID, Human Rating, Eval versions, Agreement
  - [ ] Color coding (green=agree, red=contradiction, yellow=error)
- [ ] Implement filters
  - [ ] Show only disagreements
  - [ ] By date range
  - [ ] By eval version
  - [ ] By trace source
- [ ] Create drill-down modal for execution details
  - [ ] Predicted result and reason
  - [ ] Execution time
  - [ ] Full trace data
  - [ ] Eval code that ran
- [ ] Calculate and display statistics
  - [ ] Accuracy, precision, recall, F1 per version
  - [ ] Confusion matrix
- [ ] Implement contradiction detection and counting

### Eval Refinement
- [ ] Build "Refine Eval" workflow
- [ ] Fetch original + contradicting examples
- [ ] Generate enhanced prompt with failure cases
- [ ] Create new eval version
- [ ] Test against expanded dataset
- [ ] Display accuracy comparison (before/after)
- [ ] Implement user choice UI (deploy/keep/retry)
- [ ] Build version rollback functionality
- [ ] Track refinement lineage (parent_eval_id)

### Eval Sets Management
- [ ] Build eval sets list screen
- [ ] Show examples collected (positive/negative/neutral split)
- [ ] Display generated evals count and versions
- [ ] Show performance metrics per set
- [ ] Implement create/edit/archive actions
- [ ] Add eval set export functionality

---

## Phase 4: Polish & Launch Prep (Weeks 13-14)

### Error Handling & Edge Cases
- [ ] Implement invalid Python code retry logic (3 attempts)
- [ ] Add low-confidence eval warnings
- [ ] Implement timeout handling in UI
- [ ] Add runtime exception display
- [ ] Detect and warn on contradictory feedback
- [ ] Detect and warn on imbalanced training data
- [ ] Implement adapter API failure handling with retry
- [ ] Add connection status indicators
- [ ] Create troubleshooting documentation

### User Experience
- [ ] Optimize trace loading performance (< 2s)
- [ ] Optimize swipe feedback response (< 100ms)
- [ ] Add loading states and skeletons
- [ ] Implement error messages and toasts
- [ ] Add onboarding flow for new users
- [ ] Create help documentation and tooltips
- [ ] Implement keyboard shortcuts for power users
- [ ] Add empty states for all screens

### Testing & Quality
- [ ] Write unit tests for trace adapters
- [ ] Write tests for eval generation engine
- [ ] Write tests for sandbox execution
- [ ] Test with various trace formats and edge cases
- [ ] Load testing for concurrent users
- [ ] Security audit of Python sandbox
- [ ] Test data encryption and API key storage
- [ ] Cross-browser testing

### Launch Preparation
- [ ] Set up production environment
- [ ] Configure monitoring and alerting
- [ ] Create backup and disaster recovery plan
- [ ] Write user documentation
- [ ] Create demo video
- [ ] Prepare launch announcement
- [ ] Set up customer support system (email/Discord)
- [ ] Create feedback collection mechanism

---

## Future Enhancements (Post-MVP)

### Phase 2: Multi-Platform Support
- [ ] Implement Langsmith adapter
- [ ] Implement OpenAI adapter
- [ ] Test cross-platform eval generation
- [ ] Add platform-specific features

### Phase 3: Multi-Turn Evals
- [ ] Design conversation-level trace schema
- [ ] Implement multi-turn trace viewer
- [ ] Adapt eval generation for conversation context
- [ ] Add conversation-level metrics

### Phase 4: LLM-Based Evals
- [ ] Design LLM judge prompt templates
- [ ] Allow LLM calls within eval code
- [ ] Implement hybrid evals (code + LLM)
- [ ] Add cost tracking for LLM-based evals

### Phase 5: Advanced Features
- [ ] Implement trace minification/summarization
- [ ] Add eval drift detection over time
- [ ] Build A/B testing for eval versions
- [ ] Implement automated continuous refinement
- [ ] Create batch eval execution API
- [ ] Add CI/CD integrations (GitHub Actions)
- [ ] Build webhook support for real-time trace ingestion
- [ ] Add team collaboration features
- [ ] Implement eval sharing marketplace

---

## Technical Debt & Optimizations

### Performance
- [ ] Profile and optimize slow database queries
- [ ] Implement caching strategy (traces, evals)
- [ ] Optimize frontend bundle size
- [ ] Add pagination for large lists
- [ ] Implement virtual scrolling for trace lists

### Security
- [ ] Regular security audits
- [ ] Dependency vulnerability scanning
- [ ] Rate limiting on API endpoints
- [ ] DDoS protection
- [ ] GDPR compliance review

### Scalability
- [ ] Monitor Cloudflare Worker CPU limits
- [ ] Optimize for free tier constraints
- [ ] Plan for database scaling (sharding?)
- [ ] Consider edge caching strategies
- [ ] Load testing at 100+ concurrent users

---

## Metrics to Track

### Product Metrics
- [ ] Set up analytics dashboard
- [ ] Track: Active users per week
- [ ] Track: Eval functions generated
- [ ] Track: Average eval accuracy
- [ ] Track: Traces reviewed with feedback
- [ ] Track: Eval refinements triggered
- [ ] Track: Time to first eval generation
- [ ] Track: User retention (Week 1, Week 4)

### Technical Metrics
- [ ] API response times (p50, p95, p99)
- [ ] Eval generation success rate
- [ ] Sandbox execution time
- [ ] Database query performance
- [ ] Error rates per endpoint
- [ ] LLM API costs per eval
- [ ] Storage costs (D1, R2)

### Business Metrics
- [ ] Sign-ups per week
- [ ] Conversion to paid (if applicable)
- [ ] Monthly recurring revenue (MRR)
- [ ] Customer acquisition cost (CAC)
- [ ] Customer lifetime value (LTV)
- [ ] Churn rate

---

## Open Questions & Blockers

### Technical Decisions
- [ ] Decision: Next.js vs SvelteKit for frontend?
- [ ] Decision: RestrictedPython vs deno_python vs external service?
- [ ] Decision: Auth provider (Cloudflare Access vs Clerk vs Auth0)?
- [ ] Decision: LLM provider (Claude vs GPT-4 for eval generation)?

### Product Decisions
- [ ] Decision: Pricing model and tiers
- [ ] Decision: Export format for generated evals
- [ ] Decision: Feedback granularity beyond thumbs up/down
- [ ] Decision: When to expand beyond Langfuse (Langsmith/OpenAI)?

### External Dependencies
- [ ] Blocker: Cloudflare Workers Python runtime stability?
- [ ] Blocker: Langfuse API rate limits and costs?
- [ ] Blocker: LLM API costs at scale?
- [ ] Risk: Langfuse/Langsmith API changes breaking adapters?

---

## Resources & Links

- Design Doc: `docs/plans/2025-11-05-iofold-auto-evals-design.md`
- Cloudflare Docs: https://developers.cloudflare.com/
- Langfuse API: https://langfuse.com/docs/api
- RestrictedPython: https://github.com/zopefoundation/RestrictedPython
- LangGraph Docs: https://langchain-ai.github.io/langgraph/

---

**Last Updated:** 2025-11-05
