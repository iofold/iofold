# Next Steps After Validation

**Last Updated:** 2025-11-12

## Immediate Decisions Required

Before starting Phase 1 implementation, the following technical decisions must be resolved:

### 1. Python Runtime (CRITICAL)

**Decision Deadline:** Before Phase 1 begins

**Options to Evaluate:**

#### Option A: Cloudflare Workers Python SDK
- **Status:** Check if available in beta/GA
- **Pros:** Native integration, best performance, no cold start issues
- **Cons:** May not be available yet, limited ecosystem
- **Evaluation Tasks:**
  - Check Cloudflare Workers Python availability
  - Test with sandbox security constraints
  - Measure cold start time and execution performance
  - Verify import restrictions can be enforced

#### Option B: Pyodide (WebAssembly)
- **Status:** Mature, actively maintained
- **Pros:** Full Python interpreter, comprehensive stdlib, runs in Workers
- **Cons:** ~10MB bundle size, longer cold starts, memory constraints
- **Evaluation Tasks:**
  - Prototype with real Python eval execution
  - Measure bundle size impact on Workers
  - Test performance on edge (cold start + execution time)
  - Verify security isolation quality
  - Calculate cost impact of larger bundle

#### Option C: External Sandbox Service
- **Status:** Proven approach, several providers available
- **Pros:** Full isolation, no bundle size issues, can use real Python
- **Cons:** Added latency, network dependency, additional cost
- **Providers to Evaluate:**
  - Modal.com (serverless Python)
  - AWS Lambda with Python runtime
  - E2B (code execution sandbox)
  - Custom service on Fly.io/Railway
- **Evaluation Tasks:**
  - Design architecture for external sandbox integration
  - Measure added latency (network + execution)
  - Calculate cost per execution
  - Evaluate reliability and SLAs

**Decision Criteria:**
1. Security isolation quality (critical)
2. Cold start + execution time (target: < 5s p95)
3. Cost per execution at scale
4. Development complexity and maintenance burden
5. Bundle size impact (if WASM)

**Recommendation Process:**
1. Build quick prototypes of each option
2. Run same eval function through each
3. Measure: latency, cost, security, developer experience
4. Document trade-offs in decision matrix
5. Make final call based on criteria above

### 2. Frontend Framework

**Decision Made:** TanStack Router + TanStack Query

**Phase 1 Implementation Tasks:**
- Set up Cloudflare Pages project
- Configure TanStack Router with file-based routing
- Integrate TanStack Query with Workers API
- Choose UI component library:
  - **Option A:** Tailwind CSS + shadcn/ui (Radix-based)
  - **Option B:** Tailwind CSS + Headless UI
  - **Option C:** Custom components with Radix primitives
- Set up build pipeline (Vite or Next.js)

### 3. Authentication

**Decision Made:** Clerk

**Phase 1 Implementation Tasks:**
- Create Clerk account and application
- Configure OAuth providers (GitHub, Google)
- Integrate Clerk with Cloudflare Workers
- Implement JWT validation middleware
- Set up user/workspace data model
- Add session management

### 4. LLM Provider

**Current:** Claude 3.5 Sonnet (Anthropic)

**Validation Questions:**
- Is eval generation quality acceptable?
- Are costs sustainable at projected scale?
- Should we add fallback to GPT-4?

**Decision:** Keep Claude 3.5 Sonnet unless validation reveals issues

## Phase 1 Roadmap

**Target Duration:** 6-8 weeks

See `docs/2025-11-05-iofold-evals-todo.md` for complete task breakdown.

### Priority Order

#### Week 1-2: Foundation
1. Production Python sandbox (based on decision above)
2. Backend API foundation with authentication
3. User/workspace data model
4. Environment setup and deployment pipeline

#### Week 3-4: Core Features
5. Frontend setup with TanStack Router + Pages
6. Trace fetching and storage
7. Trace review UI (first user-facing feature)
8. Feedback collection (thumbs up/down/neutral)

#### Week 5-6: Eval Generation
9. Eval generation flow (end-to-end)
10. Eval testing and accuracy measurement
11. Eval management UI (view, version, compare)

#### Week 7-8: Polish & Testing
12. Error handling and validation
13. Security audit of Python sandbox
14. Performance optimization
15. Beta user onboarding
16. Documentation and deployment

### Key Milestones

- **Week 2:** Production Python sandbox working
- **Week 4:** Can fetch and label traces in UI
- **Week 6:** Can generate and test eval function end-to-end
- **Week 8:** 1-2 beta users actively using platform

## Success Metrics for Phase 1

### Technical Metrics

- [ ] 10+ traces fetched and displayed in UI
- [ ] 1 eval generated and tested with 80%+ accuracy
- [ ] Python sandbox verified secure (external audit or peer review)
- [ ] < 3s page load time (p95)
- [ ] < 5s eval execution time (p95)
- [ ] Zero security incidents in beta testing

### User Metrics

- [ ] 1-2 beta users onboarded
- [ ] Users can complete full workflow: fetch traces → label → generate eval
- [ ] Feedback collected on UX and value proposition
- [ ] 1 real eval deployed in production workflow
- [ ] < 5 minutes to onboard new user
- [ ] Positive sentiment on eval code quality/readability

### Business Metrics

- [ ] Validate pricing model (cost per eval + margin)
- [ ] Confirm willingness to pay from beta users
- [ ] Calculate CAC and LTV estimates

## Open Questions

Track answers in `docs/validation-results.md` after experiments:

### Technical Questions
1. Is eval accuracy acceptable with minimal training data (5-10 examples)?
2. Can we maintain < 5s execution time for complex evals?
3. Does Python sandbox security meet production standards?
4. How do we handle eval refinement when accuracy is low?
5. What's the failure mode when LLM produces invalid Python?

### Product Questions
6. Do users understand the swipe feedback interface?
7. Is generated eval code readable and maintainable by users?
8. Should users be able to edit generated evals directly?
9. How do users want to consume evals (copy/paste, API, package)?
10. What's the right threshold for "low confidence" warning?

### Business Questions
11. Are LLM costs sustainable at scale?
12. What's the right pricing model (per eval, per trace, subscription)?
13. Does Langfuse provide sufficient trace data quality?
14. Should we support other trace formats in Phase 1?
15. What's the competitive moat vs. manual eval writing?

## Technical Debt to Address

### From Validation Prototype

1. **Python Sandbox:** Replace vm module prototype with production solution
2. **Error Handling:** Comprehensive error boundaries and user-facing messages
3. **Type Safety:** Add runtime validation for all trace data
4. **Testing:** Increase test coverage to 80%+
5. **Observability:** Add structured logging and metrics
6. **Security:** Rate limiting, input sanitization, secrets management

### New for Phase 1

7. **Authentication:** Implement JWT validation and session management
8. **Multi-tenancy:** User/workspace isolation in database
9. **Caching:** Cache trace data and eval results
10. **Pagination:** Handle large trace datasets
11. **Background Jobs:** Async eval generation for large datasets
12. **Monitoring:** Error tracking (Sentry?), performance monitoring

## Resources

### Documentation
- **Cloudflare Docs:** https://developers.cloudflare.com/
  - Workers: https://developers.cloudflare.com/workers/
  - D1: https://developers.cloudflare.com/d1/
  - Pages: https://developers.cloudflare.com/pages/
- **TanStack Router:** https://tanstack.com/router
- **TanStack Query:** https://tanstack.com/query
- **Clerk Docs:** https://clerk.com/docs
- **Langfuse API:** https://langfuse.com/docs/api

### Python Runtime Options
- **Pyodide:** https://pyodide.org/
  - Workers integration: https://developers.cloudflare.com/workers/runtime-apis/python/
- **Modal:** https://modal.com/
- **E2B:** https://e2b.dev/

### UI Libraries
- **shadcn/ui:** https://ui.shadcn.com/
- **Radix UI:** https://www.radix-ui.com/
- **Headless UI:** https://headlessui.com/

### Testing & Security
- **RestrictedPython:** https://github.com/zopefoundation/RestrictedPython
- **Python Sandbox Patterns:** https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html

## Phase 2 Preview

**Not included in Phase 1, planned for later:**

### Features
- Multi-turn conversation eval support
- LLM-based eval judges (for subjective criteria)
- Auto-refinement on accuracy threshold
- Trace minification/summarization for long contexts
- Langsmith/OpenAI adapters
- Real-time trace streaming
- Eval comparison matrix (human vs eval predictions)
- Eval versioning and rollback
- Team collaboration features

### Infrastructure
- Eval execution scaling (parallel execution)
- Advanced caching strategies
- Cost optimization (model selection, prompt caching)
- Analytics dashboard
- API for external integrations

## Decision Log

Track major decisions here as they're made:

| Date | Decision | Options Considered | Rationale | Owner |
|------|----------|-------------------|-----------|-------|
| 2025-11-12 | Use TanStack Router + Query | Next.js, SvelteKit, Remix | Best DX for Cloudflare Pages, proven at scale | TBD |
| 2025-11-12 | Use Clerk for auth | Auth0, Cloudflare Access, custom | Fastest to implement, great DX, Cloudflare integration | TBD |
| TBD | Python runtime | Cloudflare Python, Pyodide, External | Pending evaluation | TBD |

---

**Created:** 2025-11-12
**Owner:** TBD - Assign project owner

**Next Review:** After validation experiments complete
