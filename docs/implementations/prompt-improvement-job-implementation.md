# Prompt Improvement Job Implementation

**Date:** 2025-11-28
**Status:** Complete
**Design Doc:** `/home/ygupta/workspace/iofold/docs/plans/2025-11-28-agent-jobs-design.md`

## Overview

Implemented the Prompt Improvement Job for the iofold platform. This job generates improved prompt candidates based on failure analysis and best practices, following the existing job patterns.

## Files Created

### 1. `/home/ygupta/workspace/iofold/src/jobs/prompt-improvement-job.ts`

Main job implementation with the following features:

**Flow:**
1. Fetch agent and active version from D1
2. Fetch contradictions (human rating != eval prediction)
3. **STEP 1:** Analyze failure patterns using Claude API
4. Fetch best practices from `prompt_best_practices` table
5. **STEP 2:** Generate improved prompt using Claude with meta-prompt
6. Create new `agent_version` with:
   - `status='candidate'`
   - `source='ai_improved'`
   - `parent_version_id` = active version
7. Return result for user review

**Key Classes:**
- `PromptImprovementJob` - Main job executor
- Uses `JobManager` for job lifecycle
- Uses `SSEStream` for progress updates
- Anthropic Claude Sonnet 4.5 for LLM calls

**Config Interface:**
```typescript
interface PromptImprovementJobConfig {
  jobId: string;
  agentId: string;
  workspaceId: string;
  maxContradictions?: number;  // default: 20
}
```

**Result Interface:**
```typescript
interface PromptImprovementJobResult {
  new_version_id: string;
  new_version_number: number;
  changes_summary: string;
  failure_patterns: string[];
  best_practices_applied: string[];
}
```

**Special Handling:**
- **No contradictions:** Early return with empty result, skips improvement
- **Variable preservation:** Ensures all variables from original prompt are preserved
- **SSE streaming:** Emits progress events throughout execution
- **Error handling:** Gracefully handles Claude API failures, invalid JSON responses

### 2. `/home/ygupta/workspace/iofold/src/jobs/prompt-improvement-job.test.ts`

Comprehensive test suite using vitest with 9 test cases:

**Test Coverage:**

1. ✅ **Happy path:** Contradictions → improved prompt generated
2. ✅ **No contradictions:** Early return, no improvement needed
3. ✅ **Best practices applied:** Fetches and includes best practices in meta-prompt
4. ✅ **LLM failure:** Handles Claude API errors gracefully
5. ✅ **Invalid JSON:** Handles non-JSON responses from Claude
6. ✅ **Missing fields:** Validates required fields in improved prompt response
7. ✅ **Variables preserved:** Ensures all variables are maintained in improved prompt
8. ✅ **No active version:** Throws error if agent has no active version
9. ✅ **SSE streaming:** Emits progress events throughout execution

**All tests passing:** 9/9 ✅

**Mock Strategy:**
- D1 Database fully mocked with prepared statements
- Anthropic SDK mocked with `vi.mock()`
- SSE stream mocked for progress tracking verification

## Meta-Prompt Structure

The job uses a two-step Claude API interaction:

### Step 1: Failure Analysis
```
You are an expert at analyzing AI system failures. Analyze these contradictions...

Output JSON:
{
  "failure_patterns": ["Pattern 1", "Pattern 2"],
  "summary": "Brief summary of main failure themes"
}
```

### Step 2: Prompt Improvement
```
You are a prompt engineering expert. Improve this system prompt based on:

## Current Prompt
{current_template}

## Failure Analysis
{failure_summary}
{failure_patterns}

## Best Practices to Apply
{best_practices}

## Requirements
- Preserve these variables: {variables}
- Maintain the core intent
- Address the identified failure patterns
- Apply relevant best practices

Output JSON:
{
  "improved_prompt": "...",
  "changes": ["Change 1", "Change 2"],
  "reasoning": "Explanation of changes"
}
```

## Database Integration

**Tables Used:**
- `agents` - Fetch agent and active version
- `agent_versions` - Read active version, create new candidate version
- `feedback` - Human ratings on traces
- `eval_executions` - Eval predictions on traces
- `traces` - Trace data for contradiction analysis
- `prompt_best_practices` - Best practices for meta-prompt
- `jobs` - Job lifecycle management

**Key Query:**
```sql
SELECT f.trace_id, f.rating, ee.predicted_result, ee.predicted_reason, t.trace_data
FROM feedback f
JOIN eval_executions ee ON f.trace_id = ee.trace_id
JOIN traces t ON f.trace_id = t.id
JOIN agent_versions av ON t.agent_version_id = av.id
WHERE av.agent_id = ?
  AND (
    (f.rating = 'positive' AND ee.predicted_result = 0)
    OR (f.rating = 'negative' AND ee.predicted_result = 1)
  )
ORDER BY f.created_at DESC
LIMIT ?
```

## Type Updates

Updated `/home/ygupta/workspace/iofold/src/types/agent.ts`:

```typescript
export interface PromptImprovementJobResult {
  new_version_id: string;
  new_version_number: number;  // Added
  changes_summary: string;
  failure_patterns: string[];   // Added
  best_practices_applied: string[];  // Added
}
```

This matches the design doc specification.

## Design Principles Followed

1. ✅ **Existing patterns:** Mirrors `trace-import-job.ts` and `eval-generation-job.ts`
2. ✅ **JobManager integration:** Uses standard job lifecycle
3. ✅ **SSE streaming:** Emits progress events at key steps
4. ✅ **Error handling:** Graceful failure with job status updates
5. ✅ **Type safety:** Full TypeScript type coverage
6. ✅ **Test coverage:** Comprehensive unit tests with mocks
7. ✅ **Database patterns:** Standard D1 prepared statement usage
8. ✅ **No hardcoding:** All parameters configurable

## Usage Example

```typescript
const job = new PromptImprovementJob(
  {
    jobId: 'job_123',
    agentId: 'agent_abc',
    workspaceId: 'ws_xyz',
    maxContradictions: 20
  },
  {
    db: env.DB,
    anthropicApiKey: env.ANTHROPIC_API_KEY
  }
);

const result = await job.execute(stream);
// result.new_version_id: 'agv_...'
// result.new_version_number: 3
// result.failure_patterns: ['Pattern 1', 'Pattern 2']
// result.best_practices_applied: ['Change 1', 'Change 2']
```

## Next Steps

To integrate this job into the platform:

1. **Add job type to API types:**
   ```typescript
   // src/types/api.ts
   type JobType = 'import' | 'generate' | 'execute' | 'prompt_improvement';
   ```

2. **Register job in job manager/queue:**
   ```typescript
   // src/queue/consumer.ts or src/jobs/job-manager.ts
   case 'prompt_improvement':
     return new PromptImprovementJob(config, deps);
   ```

3. **Add API endpoint to trigger job:**
   ```typescript
   // src/api/agents.ts
   POST /api/agents/:agentId/improve-prompt
   ```

4. **Seed best practices table:**
   ```sql
   INSERT INTO prompt_best_practices (source, category, title, content)
   VALUES ('anthropic', 'clarity', 'Be Specific', '...');
   ```

## Testing

Run tests:
```bash
npm test -- src/jobs/prompt-improvement-job.test.ts
```

**Result:** All 9 tests passing ✅

## References

- Design doc: `/home/ygupta/workspace/iofold/docs/plans/2025-11-28-agent-jobs-design.md`
- Reference job: `/home/ygupta/workspace/iofold/src/jobs/eval-generation-job.ts`
- Job manager: `/home/ygupta/workspace/iofold/src/jobs/job-manager.ts`
- Agent types: `/home/ygupta/workspace/iofold/src/types/agent.ts`
