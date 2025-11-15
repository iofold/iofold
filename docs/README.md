# iofold Documentation

**Welcome to the iofold platform documentation.** This directory contains all design documents, implementation plans, testing reports, and operational guides for the automated evaluation generation platform.

**Last Updated**: 2025-11-15
**Project Status**: 85% Production Ready (Staging Deployment)

---

## Quick Navigation

### Getting Started
- [Project Overview](#project-overview)
- [Documentation Structure](#documentation-structure)
- [For New Team Members](#for-new-team-members)
- [For Alpha Users](#for-alpha-users)

### Key Documents
- [Architecture & Design](#architecture--design)
- [Implementation](#implementation)
- [Testing](#testing)
- [Production](#production)
- [API Reference](#api-reference)

---

## Project Overview

**iofold.com** is an automated evaluation generation platform for AI agents. The platform integrates with existing observability tools (Langfuse, Langsmith, OpenAI) to bootstrap high-quality eval functions through human feedback and meta-prompting.

**Core Value Proposition**: Reduce eval writing time by automatically generating code-based eval functions from labeled trace examples, with continuous refinement based on user feedback.

**Current Status**: Design and implementation complete, ready for staging deployment.

---

## Documentation Structure

### Architecture & Design

#### Primary Design Document
**[2025-11-05-iofold-auto-evals-design.md](/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-auto-evals-design.md)** (28,396 lines)
- Complete system architecture
- Database schema design
- API specifications
- Security model
- Technology stack decisions
- Success metrics
- **Start here** for comprehensive understanding of the platform

#### UI/UX Specifications
**[UI_UX_SPECIFICATION.md](/home/ygupta/workspace/iofold/docs/UI_UX_SPECIFICATION.md)** (763 lines)
- Card-swiping trace review interface
- Swipe gestures and keyboard shortcuts
- Visual design and animations
- Accessibility requirements (WCAG 2.1 Level A)
- Mobile optimization
- **Implementation Status**: ✅ COMPLETE

#### API Specification
**[plans/2025-11-12-api-specification.md](/home/ygupta/workspace/iofold/docs/plans/2025-11-12-api-specification.md)**
- Complete REST API documentation
- 35+ endpoints with request/response examples
- Authentication and authorization
- Error handling patterns
- Rate limiting and pagination

---

### Implementation

#### Main Implementation Tracker
**[2025-11-05-iofold-evals-todo.md](/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-evals-todo.md)** (525 lines)
- Phase-by-phase implementation plan
- Task tracking and completion status
- Next steps and priorities
- **Current Status**: Phase 1-4 complete (85%)

#### Card UI Implementation Plan
**[IMPLEMENTATION_PLAN_CARD_UI.md](/home/ygupta/workspace/iofold/docs/IMPLEMENTATION_PLAN_CARD_UI.md)** (260 lines)
- 6-worker parallel execution plan
- Card component specifications
- Swipe gesture implementation
- Timeline and success criteria
- **Status**: ✅ COMPLETE

#### Implementation Progress Reports
- **[2025-11-12-implementation-progress.md](/home/ygupta/workspace/iofold/docs/2025-11-12-implementation-progress.md)** - Phase 1 & 2 completion
- **[FINAL_IMPLEMENTATION_SUMMARY_2025-11-13.md](/home/ygupta/workspace/iofold/docs/FINAL_IMPLEMENTATION_SUMMARY_2025-11-13.md)** - Sprint 1-3 summary

#### Phase Specifications
- **[PHASE_2_SPEC.md](/home/ygupta/workspace/iofold/docs/PHASE_2_SPEC.md)** - Core features specification
- **[sprint3-eval-generation-ui-implementation.md](/home/ygupta/workspace/iofold/docs/sprint3-eval-generation-ui-implementation.md)** - Eval generation UI

---

### Testing

#### E2E Testing
**[E2E_TESTING_README.md](/home/ygupta/workspace/iofold/docs/E2E_TESTING_README.md)** (10,611 lines)
- Playwright E2E test framework guide
- Test organization and structure
- Running and debugging tests
- Writing new tests

**[E2E_TEST_EXECUTION_REPORT.md](/home/ygupta/workspace/iofold/docs/E2E_TEST_EXECUTION_REPORT.md)** (515 lines)
- Latest test execution results
- Pass/fail breakdown by category
- Bug findings and recommendations
- **Current Pass Rate**: 66% (48/73 tests, smoke tests 100%)

**[E2E_TESTING_PLAN.md](/home/ygupta/workspace/iofold/docs/E2E_TESTING_PLAN.md)** - Comprehensive test scenarios
**[E2E_TESTING_QUICK_REFERENCE.md](/home/ygupta/workspace/iofold/docs/E2E_TESTING_QUICK_REFERENCE.md)** - Quick command reference

#### Testing Reports
- **[TESTING_REPORT_2025-11-13.md](/home/ygupta/workspace/iofold/docs/TESTING_REPORT_2025-11-13.md)** - Sprint 2 testing
- **[TESTING_SUMMARY_2025-11-13_COMPREHENSIVE.md](/home/ygupta/workspace/iofold/docs/TESTING_SUMMARY_2025-11-13_COMPREHENSIVE.md)** - Comprehensive results
- **[INTEGRATION_TEST_RESULTS.md](/home/ygupta/workspace/iofold/docs/INTEGRATION_TEST_RESULTS.md)** - API integration tests
- **[PARALLEL_IMPLEMENTATION_TEST_RESULTS.md](/home/ygupta/workspace/iofold/docs/PARALLEL_IMPLEMENTATION_TEST_RESULTS.md)** - Parallel worker tests

---

### Production

#### Production Readiness
**[PRODUCTION_READINESS_CHECKLIST.md](/home/ygupta/workspace/iofold/docs/PRODUCTION_READINESS_CHECKLIST.md)** (NEW)
- Pre-deployment checklist (23 criteria)
- P0/P1 bug tracking
- Security checklist
- Performance benchmarks
- Monitoring setup
- **Current Score**: 85/100 - READY FOR STAGING

#### Deployment
**[DEPLOYMENT_GUIDE.md](/home/ygupta/workspace/iofold/docs/DEPLOYMENT_GUIDE.md)** (NEW)
- Step-by-step deployment instructions
- Environment setup
- Database migrations
- Backend deployment (Cloudflare Workers)
- Frontend deployment (Cloudflare Pages)
- Post-deployment verification
- Rollback procedures
- Troubleshooting

**[plans/2025-11-12-deployment-guide.md](/home/ygupta/workspace/iofold/docs/plans/2025-11-12-deployment-guide.md)** - Additional deployment notes

#### Version History
**[CHANGELOG.md](/home/ygupta/workspace/iofold/docs/CHANGELOG.md)** (NEW)
- Comprehensive changelog from v0.0.1 to present
- All features added
- All bugs fixed
- Breaking changes
- Migration guides

#### Success Criteria
**[success_criteria.md](/home/ygupta/workspace/iofold/docs/success_criteria.md)** (NEW)
- MVP launch criteria (23 items)
- 3-month success metrics
- Risk assessment
- Measurement dashboard
- Quarterly goals

---

### API Reference

#### TypeScript SDK
**[../src/client/README.md](/home/ygupta/workspace/iofold/src/client/README.md)** (510 lines)
- Complete TypeScript SDK documentation
- Installation and setup
- API methods for all resources
- Code examples
- SSE streaming guide
- Error handling

**[../src/client/examples.ts](/home/ygupta/workspace/iofold/src/client/examples.ts)** (482 lines)
- Real-world usage examples
- Complete workflow demonstrations
- Best practices

#### API Testing
**[API_TEST_COMMANDS.md](/home/ygupta/workspace/iofold/docs/API_TEST_COMMANDS.md)** (7,262 lines)
- curl commands for all endpoints
- Testing workflows
- Authentication examples

---

### Technical Deep Dives

#### Python Runtime
**[cloudflare-sandbox-migration.md](/home/ygupta/workspace/iofold/docs/cloudflare-sandbox-migration.md)** (5,915 lines)
- Migration from Node.js VM to Cloudflare Sandbox SDK
- Security model
- Implementation details
- Testing strategy

#### LLM Models
**[llm-models-2025.md](/home/ygupta/workspace/iofold/docs/llm-models-2025.md)** (8,303 lines)
- Claude and GPT-4 model reference
- Pricing comparison
- Token usage optimization
- Model selection guide

#### SSE Implementation
- **[sse-implementation.md](/home/ygupta/workspace/iofold/docs/sse-implementation.md)** - Server-Sent Events architecture
- **[sse-summary.md](/home/ygupta/workspace/iofold/docs/sse-summary.md)** - Implementation summary
- **[sse-verification.md](/home/ygupta/workspace/iofold/docs/sse-verification.md)** - Testing and verification
- **[sse-quick-reference.md](/home/ygupta/workspace/iofold/docs/sse-quick-reference.md)** - Quick command reference

---

### Validation & Planning

#### Pre-Implementation Validation
**[validation-results.md](/home/ygupta/workspace/iofold/docs/validation-results.md)** (13,791 lines)
- Technical validation results
- Langfuse integration validation (100% success)
- Python sandbox testing
- LLM cost analysis ($0.0006/eval)
- Go/No-Go decision (CONDITIONAL GO → GO)

**[plans/2025-11-12-pre-implementation-validation.md](/home/ygupta/workspace/iofold/docs/plans/2025-11-12-pre-implementation-validation.md)** - Validation plan

#### Remaining Tasks
**[REMAINING_TASKS.md](/home/ygupta/workspace/iofold/docs/REMAINING_TASKS.md)** (12,113 lines)
- Outstanding work items
- Bug fixes needed
- Enhancement requests

#### Next Steps
**[next-steps.md](/home/ygupta/workspace/iofold/docs/next-steps.md)** (9,485 lines)
- Immediate next actions
- Phase 1 roadmap and timeline
- Decision points

---

## For New Team Members

### 1. Understand the Architecture (Day 1)
Start with these documents in order:
1. Read [2025-11-05-iofold-auto-evals-design.md](/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-auto-evals-design.md) (focus on sections 1-5)
2. Review [CHANGELOG.md](/home/ygupta/workspace/iofold/docs/CHANGELOG.md) to understand what's been built
3. Check [2025-11-05-iofold-evals-todo.md](/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-evals-todo.md) for current status

### 2. Set Up Development Environment (Day 1)
1. Clone repository
2. Follow setup instructions in [../README.md](/home/ygupta/workspace/iofold/README.md)
3. Run local development server (backend + frontend)
4. Run tests: `npm test` and `npx playwright test`

### 3. Explore the Codebase (Day 2)
1. Review [../src/client/README.md](/home/ygupta/workspace/iofold/src/client/README.md) for API usage
2. Run [../src/client/examples.ts](/home/ygupta/workspace/iofold/src/client/examples.ts) examples
3. Test API endpoints using [API_TEST_COMMANDS.md](/home/ygupta/workspace/iofold/docs/API_TEST_COMMANDS.md)

### 4. Understand Current Priorities (Day 2)
1. Review [PRODUCTION_READINESS_CHECKLIST.md](/home/ygupta/workspace/iofold/docs/PRODUCTION_READINESS_CHECKLIST.md)
2. Check P0 bugs (3 issues blocking staging deployment)
3. Review [success_criteria.md](/home/ygupta/workspace/iofold/docs/success_criteria.md) for launch goals

### 5. Make Your First Contribution (Day 3+)
1. Pick a P1 or P2 issue from [REMAINING_TASKS.md](/home/ygupta/workspace/iofold/docs/REMAINING_TASKS.md)
2. Write tests first (see [E2E_TESTING_README.md](/home/ygupta/workspace/iofold/docs/E2E_TESTING_README.md))
3. Submit PR with tests and implementation
4. Update documentation if needed

---

## For Alpha Users

### Getting Started with iofold

**Welcome!** Thank you for being an early user of iofold. Here's how to get started:

1. **Create Account** (if authentication enabled)
   - Sign up at https://iofold.com (staging URL TBD)
   - Verify your email address

2. **Connect Your Langfuse Account**
   - Go to Integrations page
   - Click "Add Integration"
   - Enter your Langfuse public key and secret key
   - Test connection

3. **Import Traces**
   - Go to Traces page
   - Click "Import Traces"
   - Select your Langfuse integration
   - Import 10-20 traces to start

4. **Review and Label Traces**
   - Use the card-swiping interface at `/review`
   - Swipe right (or press 1) for good traces 👍
   - Swipe left (or press 3) for bad traces 👎
   - Swipe down (or press 2) for neutral 😐
   - Goal: Label at least 5 traces (3 positive, 2 negative minimum)

5. **Generate Your First Eval**
   - Go to Eval Sets page
   - Create a new eval set
   - Once you have ≥ 5 labeled traces, click "Generate Eval"
   - Wait for Claude AI to generate Python code (~3-5 seconds)
   - Review the generated eval function

6. **Execute Eval**
   - Go to Evals page
   - Find your generated eval
   - Click "Execute" to test it on your traces
   - View results and accuracy

### Providing Feedback

We'd love to hear from you! Please share:
- What works well
- What's confusing or difficult
- Bugs you encounter
- Feature requests
- How accurate the generated evals are

**Feedback Channels**:
- Email: ygupta@iofold.com (replace with actual)
- Slack: #iofold-alpha (if applicable)
- GitHub Issues: Report bugs directly

---

## Document Maintenance

### How to Update Documentation

1. **Major Features**: Update [CHANGELOG.md](/home/ygupta/workspace/iofold/docs/CHANGELOG.md)
2. **Implementation Status**: Update [2025-11-05-iofold-evals-todo.md](/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-evals-todo.md)
3. **Production Readiness**: Update [PRODUCTION_READINESS_CHECKLIST.md](/home/ygupta/workspace/iofold/docs/PRODUCTION_READINESS_CHECKLIST.md)
4. **Bug Fixes**: Add to [CHANGELOG.md](/home/ygupta/workspace/iofold/docs/CHANGELOG.md) and update [E2E_TEST_EXECUTION_REPORT.md](/home/ygupta/workspace/iofold/docs/E2E_TEST_EXECUTION_REPORT.md)
5. **API Changes**: Update [plans/2025-11-12-api-specification.md](/home/ygupta/workspace/iofold/docs/plans/2025-11-12-api-specification.md) and [../src/client/README.md](/home/ygupta/workspace/iofold/src/client/README.md)

### Documentation Standards

- **Use Markdown**: All docs in `.md` format
- **Include Timestamps**: Add "Last Updated" date at top
- **Link Between Docs**: Use relative paths to cross-reference
- **Code Examples**: Use syntax highlighting (```typescript, ```bash, etc.)
- **Keep It Current**: Update docs when code changes
- **Be Specific**: Use absolute file paths, not relative

---

## Contact & Support

**Project Lead**: ygupta
**Repository**: /home/ygupta/workspace/iofold
**Documentation**: /home/ygupta/workspace/iofold/docs

**Need Help?**
1. Check [TROUBLESHOOTING](#troubleshooting) section in deployment guide
2. Search existing documentation
3. Ask in team chat (if applicable)
4. Contact project lead

---

## License & Contribution

**Status**: Private project (not open source yet)

**Contributors**:
- ygupta (Project Lead)
- Claude Code (AI-powered implementation assistant)

---

**Last Updated**: 2025-11-15
**Next Review**: After staging deployment (target: 2025-11-18)
**Document Version**: 1.0
