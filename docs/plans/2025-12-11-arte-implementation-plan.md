# Art-E Agent Implementation Plan

**Date:** 2025-12-11
**Status:** Ready for Implementation

## Executive Summary

This plan covers:
1. Creating the Art-E agent with email search/get tools attached
2. Adding tools display to the agent detail UI
3. Importing 100 Art-E benchmark tasks
4. Running the tasks through the playground

## Current State Analysis

### What EXISTS (Backend - Complete)
| Component | Status | Location |
|-----------|--------|----------|
| Tools table | ✅ Migrated | `migrations/014_tool_registry.sql` |
| agent_tools table | ✅ Migrated | `migrations/014_tool_registry.sql` |
| 6 built-in tools seeded | ✅ Done | execute_python, read/write/list_files, email_search, email_get |
| Tools API endpoints | ✅ Done | `src/api/tools.ts` |
| Email tool handlers | ✅ Done | `src/playground/tools/email.ts` |
| Tool handler registry | ✅ Done | `src/playground/tools/registry.ts` |
| Tool loader for agents | ✅ Done | `src/playground/tools/loader.ts` |
| BENCHMARKS_DB binding | ✅ Done | `wrangler.toml` |

### What's MISSING
| Component | Priority | Location |
|-----------|----------|----------|
| Art-E agent record | HIGH | Database (via API) |
| Enron emails in BENCHMARKS_DB | HIGH | Need to run import |
| Frontend Tool types | HIGH | `frontend/types/agent.ts` |
| Frontend API client methods | HIGH | `frontend/lib/api-client.ts` |
| Tools section on agent detail page | HIGH | `frontend/app/(main)/agents/[id]/page.tsx` |
| Art-E task runner script | MEDIUM | `scripts/run-arte-tasks.ts` |

---

## Implementation Streams (Parallel)

### Stream 1: Create Art-E Agent (Backend)
**Files to modify:** None (API calls only)

1. Create agent via API:
```bash
curl -X POST http://localhost:8787/api/agents \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: default" \
  -d '{
    "name": "Art-E Email Search Agent",
    "description": "AI agent for searching and answering questions about Enron emails. Used for the Art-E benchmark."
  }'
```

2. Create agent version with system prompt:
```bash
curl -X POST http://localhost:8787/api/agents/{AGENT_ID}/versions \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: default" \
  -d '{
    "prompt_template": "You are an expert email search assistant with access to the Enron email archive. Your task is to answer questions about emails by searching and reading the relevant emails.\n\nYou have access to two tools:\n1. email_search - Search for emails matching a query in a specific inbox\n2. email_get - Get the full content of an email by its message_id\n\nWhen answering questions:\n1. First search for relevant emails using email_search with appropriate keywords\n2. Read the full content of promising emails using email_get\n3. Synthesize the information to answer the question accurately\n4. If you cannot find the answer, say so clearly\n\nAlways cite the specific emails (by message_id) that support your answer.",
    "variables": []
  }'
```

3. Attach email tools:
```bash
# Attach email_search
curl -X POST http://localhost:8787/api/agents/{AGENT_ID}/tools \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: default" \
  -d '{"tool_id": "email_search"}'

# Attach email_get
curl -X POST http://localhost:8787/api/agents/{AGENT_ID}/tools \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: default" \
  -d '{"tool_id": "email_get"}'
```

4. Promote version to active

---

### Stream 2: Frontend Tool Types & API Client
**Files to create/modify:**

#### 2.1 Add Tool types (`frontend/types/agent.ts`)
```typescript
// Add after existing types

export interface Tool {
  id: string
  name: string
  description: string
  parameters_schema: string // JSON Schema as string
  handler_key: string
  category: 'general' | 'code' | 'filesystem' | 'email'
  created_at: string
  config?: Record<string, unknown> | null // Agent-specific config
}

// Update AgentWithDetails to include tools
export interface AgentWithDetails extends AgentWithVersion {
  versions: AgentVersion[]
  functions: {
    extractor: Function | null
    injector: Function | null
  }
  tools?: Tool[] // NEW FIELD
  metrics: {
    trace_count: number
    feedback_count: number
    positive_feedback_count: number
    negative_feedback_count: number
    eval_count: number
    accuracy: number | null
    contradiction_rate: number | null
  }
}
```

#### 2.2 Add API client methods (`frontend/lib/api-client.ts`)
```typescript
// Add these methods to the apiClient object

// List all available tools
async listTools(category?: string): Promise<{ tools: Tool[] }> {
  const params = category ? `?category=${category}` : ''
  const response = await this.fetch(`/api/tools${params}`)
  return response
}

// Get tools for a specific agent
async getAgentTools(agentId: string): Promise<{ tools: Tool[] }> {
  const response = await this.fetch(`/api/agents/${agentId}/tools`)
  return response
}

// Attach tool to agent
async attachToolToAgent(
  agentId: string,
  toolId: string,
  config?: Record<string, unknown>
): Promise<Tool> {
  const response = await this.fetch(`/api/agents/${agentId}/tools`, {
    method: 'POST',
    body: JSON.stringify({ tool_id: toolId, config }),
  })
  return response
}

// Detach tool from agent
async detachToolFromAgent(agentId: string, toolId: string): Promise<void> {
  await this.fetch(`/api/agents/${agentId}/tools/${toolId}`, {
    method: 'DELETE',
  })
}
```

---

### Stream 3: Agent Detail Page - Tools Section
**Files to modify:** `frontend/app/(main)/agents/[id]/page.tsx`

#### 3.1 Add tools query
```typescript
// After the agent query
const { data: toolsData } = useQuery({
  queryKey: ['agent-tools', agentId],
  queryFn: () => apiClient.getAgentTools(agentId),
  enabled: !!agentId,
})
```

#### 3.2 Add Tools Section UI (after Metrics Cards, before Versions)
```tsx
{/* Tools Section */}
<div className="mb-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold">Tools</h2>
    <Button variant="outline" size="sm" onClick={() => setAttachToolModalOpen(true)}>
      <Plus className="w-4 h-4 mr-2" />
      Attach Tool
    </Button>
  </div>

  {toolsData?.tools && toolsData.tools.length > 0 ? (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {toolsData.tools.map((tool) => (
        <Card key={tool.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                  tool.category === 'email' ? 'bg-blue-100 text-blue-800' :
                  tool.category === 'code' ? 'bg-purple-100 text-purple-800' :
                  tool.category === 'filesystem' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {tool.category}
                </span>
              </div>
              <h3 className="font-semibold text-sm">{tool.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {tool.description}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => handleDetachTool(tool.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  ) : (
    <Card className="p-6">
      <div className="text-center text-muted-foreground">
        <p className="mb-2">No tools attached</p>
        <p className="text-sm">Attach tools to give this agent capabilities like email search or code execution.</p>
      </div>
    </Card>
  )}
</div>
```

#### 3.3 Add Attach Tool Modal
Create `frontend/components/modals/attach-tool-modal.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import type { Tool } from '@/types/agent'

interface AttachToolModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  attachedToolIds: string[]
}

export function AttachToolModal({
  open,
  onOpenChange,
  agentId,
  attachedToolIds,
}: AttachToolModalProps) {
  const queryClient = useQueryClient()
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)

  const { data: allTools, isLoading } = useQuery({
    queryKey: ['all-tools'],
    queryFn: () => apiClient.listTools(),
    enabled: open,
  })

  const attachMutation = useMutation({
    mutationFn: (toolId: string) => apiClient.attachToolToAgent(agentId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] })
      toast.success('Tool attached successfully')
      onOpenChange(false)
      setSelectedToolId(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to attach tool')
    },
  })

  const availableTools = allTools?.tools.filter(
    (tool) => !attachedToolIds.includes(tool.id)
  ) || []

  const handleAttach = () => {
    if (selectedToolId) {
      attachMutation.mutate(selectedToolId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attach Tool to Agent</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : availableTools.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            All available tools are already attached to this agent.
          </div>
        ) : (
          <div className="space-y-3">
            {availableTools.map((tool) => (
              <Card
                key={tool.id}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedToolId === tool.id
                    ? 'ring-2 ring-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedToolId(tool.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                        tool.category === 'email' ? 'bg-blue-100 text-blue-800' :
                        tool.category === 'code' ? 'bg-purple-100 text-purple-800' :
                        tool.category === 'filesystem' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {tool.category}
                      </span>
                    </div>
                    <h3 className="font-semibold">{tool.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tool.description}
                    </p>
                  </div>
                  {selectedToolId === tool.id && (
                    <Check className="w-5 h-5 text-primary flex-shrink-0 ml-2" />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAttach}
            disabled={!selectedToolId || attachMutation.isPending}
          >
            {attachMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Attach Tool
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

### Stream 4: Import Enron Emails to BENCHMARKS_DB
**Files to create:** `scripts/import-enron-emails.ts`

This script downloads Enron emails from HuggingFace and imports them to the BENCHMARKS_DB.

```typescript
/**
 * Import Enron Emails to BENCHMARKS_DB
 *
 * Downloads the Enron email dataset from HuggingFace and imports
 * into the D1 BENCHMARKS_DB for the Art-E benchmark.
 *
 * Usage: bun scripts/import-enron-emails.ts --limit 1000
 */

import { parseArgs } from 'util'

const HUGGINGFACE_DATASET = 'corbt/enron_emails_sample_questions'
const API_BASE = process.env.API_BASE || 'http://localhost:8787'

interface EnronEmail {
  message_id: string
  inbox: string
  subject: string
  sender: string
  recipients: string[]
  date: string
  body: string
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      limit: { type: 'string', default: '1000' },
      env: { type: 'string', default: 'local' },
    },
  })

  const limit = parseInt(values.limit || '1000', 10)
  console.log(`Importing up to ${limit} Enron emails...`)

  // TODO: Implement download from HuggingFace
  // TODO: Parse parquet/JSON format
  // TODO: Batch insert into BENCHMARKS_DB via wrangler d1 execute
}

main().catch(console.error)
```

---

### Stream 5: Art-E Task Runner
**Files to create:** `scripts/run-arte-tasks.ts`

```typescript
/**
 * Art-E Task Runner
 *
 * Runs Art-E benchmark tasks through the playground agent
 * and records results for evaluation.
 *
 * Usage: bun scripts/run-arte-tasks.ts --agent-id {ID} --count 100
 */

import { parseArgs } from 'util'

interface ArtETask {
  id: number
  question: string
  answer: string
  message_ids: string[]
  inbox_address: string
  query_date: string
  how_realistic: number
}

interface TaskResult {
  task_id: number
  question: string
  expected_answer: string
  actual_answer: string
  correct: boolean
  latency_ms: number
  trace_id: string
}

const API_BASE = process.env.API_BASE || 'http://localhost:8787'
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'default'

async function runTask(agentId: string, task: ArtETask): Promise<TaskResult> {
  const startTime = Date.now()

  // Call playground chat API
  const response = await fetch(`${API_BASE}/api/agents/${agentId}/playground/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': WORKSPACE_ID,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: task.question }],
      variables: { inbox_id: task.inbox_address },
    }),
  })

  // Parse SSE response to get final answer
  const reader = response.body?.getReader()
  let answer = ''
  let traceId = ''

  // ... SSE parsing logic ...

  const latencyMs = Date.now() - startTime

  // Simple string matching for correctness (can be improved with semantic similarity)
  const correct = answer.toLowerCase().includes(task.answer.toLowerCase())

  return {
    task_id: task.id,
    question: task.question,
    expected_answer: task.answer,
    actual_answer: answer,
    correct,
    latency_ms: latencyMs,
    trace_id: traceId,
  }
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'agent-id': { type: 'string' },
      count: { type: 'string', default: '100' },
      parallel: { type: 'string', default: '5' },
    },
  })

  if (!values['agent-id']) {
    console.error('Usage: bun scripts/run-arte-tasks.ts --agent-id {ID} --count 100')
    process.exit(1)
  }

  const agentId = values['agent-id']
  const count = parseInt(values.count || '100', 10)
  const parallel = parseInt(values.parallel || '5', 10)

  console.log(`Running ${count} Art-E tasks for agent ${agentId}...`)
  console.log(`Parallelism: ${parallel}`)

  // TODO: Load tasks from HuggingFace dataset
  // TODO: Run tasks in parallel batches
  // TODO: Collect and report results
}

main().catch(console.error)
```

---

## Implementation Order (Parallel Agents)

### Phase 1: Backend Setup (1 agent)
1. Create Art-E agent via API
2. Create agent version with prompt
3. Attach email_search and email_get tools
4. Promote version to active
5. Verify via GET /api/agents/{id}/tools

### Phase 2: Frontend UI (3 parallel agents)
**Agent 2.1:** Types & API client
- Add Tool interface to `frontend/types/agent.ts`
- Add 4 API client methods to `frontend/lib/api-client.ts`

**Agent 2.2:** Tools section on agent detail page
- Modify `frontend/app/(main)/agents/[id]/page.tsx`
- Add tools query, state, and render section

**Agent 2.3:** Attach tool modal
- Create `frontend/components/modals/attach-tool-modal.tsx`
- Wire up to agent detail page

### Phase 3: Data & Tasks (2 parallel agents)
**Agent 3.1:** Import Enron emails
- Create `scripts/import-enron-emails.ts`
- Run import for at least 1000 emails

**Agent 3.2:** Art-E task runner
- Create `scripts/run-arte-tasks.ts`
- Load tasks from HuggingFace
- Run 100 tasks through playground

### Phase 4: Testing (3 parallel agents)
**Agent 4.1:** Backend API tests
- Test /api/tools endpoints
- Test /api/agents/{id}/tools endpoints
- Test agent creation and tool attachment

**Agent 4.2:** Frontend Playwright tests
- Test tools display on agent detail page
- Test attach/detach tool functionality
- Test tool category badges

**Agent 4.3:** Integration tests
- Test Art-E agent in playground
- Verify email search/get tools work
- Run sample Art-E tasks

---

## Success Criteria

1. **Art-E agent created** with email_search and email_get tools attached
2. **Tools display** visible on agent detail page with category badges
3. **Attach/detach** functionality working
4. **100 Art-E tasks** run through playground
5. **Results recorded** as traces for future eval generation
6. **All tests passing** (backend + frontend + Playwright)

---

## Files Summary

### New Files to Create
| File | Purpose |
|------|---------|
| `frontend/components/modals/attach-tool-modal.tsx` | Modal for attaching tools |
| `scripts/import-enron-emails.ts` | Import Enron dataset |
| `scripts/run-arte-tasks.ts` | Run Art-E benchmark tasks |

### Files to Modify
| File | Changes |
|------|---------|
| `frontend/types/agent.ts` | Add Tool interface |
| `frontend/lib/api-client.ts` | Add 4 tool methods |
| `frontend/app/(main)/agents/[id]/page.tsx` | Add tools section |

### Existing Files (No Changes)
| File | Status |
|------|--------|
| `src/api/tools.ts` | Complete |
| `src/playground/tools/email.ts` | Complete |
| `src/playground/tools/registry.ts` | Complete |
| `src/playground/tools/loader.ts` | Complete |
| `migrations/014_tool_registry.sql` | Migrated |
