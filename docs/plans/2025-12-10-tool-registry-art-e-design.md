# Tool Registry & ART-E Benchmark Integration

**Date:** 2025-12-10
**Status:** Implementation Ready

## Overview

Add a database-driven tool registry so agents can have different tool sets, then build an Email Search Agent that can run the OpenPipe ART-E benchmark (55K Enron email Q&A tasks).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     agents      │────▶│   agent_tools   │◀────│      tools      │
│  (existing)     │     │   (new pivot)   │     │  (new registry) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Two types of tools:**
1. **Built-in tools** - Code lives in our codebase, mapped via `handler_key`
2. **Future: User-defined tools** - Code in sandbox (not this iteration)

## Database Schema

```sql
-- Migration: 013_tool_registry.sql

CREATE TABLE tools (
  id TEXT PRIMARY KEY,                    -- 'email_search', 'execute_python'
  name TEXT NOT NULL,                     -- 'Search Emails'
  description TEXT NOT NULL,              -- LLM sees this for tool selection
  parameters_schema TEXT NOT NULL,        -- JSON Schema for Zod validation
  handler_key TEXT NOT NULL,              -- Maps to TypeScript function
  category TEXT DEFAULT 'general',        -- 'email', 'code', 'filesystem'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_tools (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  config TEXT,                            -- Tool-specific config JSON (optional)
  PRIMARY KEY (agent_id, tool_id)
);

CREATE INDEX idx_agent_tools_agent ON agent_tools(agent_id);
```

## Tool Handler Registry

```typescript
// src/playground/tools/registry.ts

type ToolHandler = (params: unknown, context: ToolContext) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  'execute_python': executePythonHandler,
  'read_file': readFileHandler,
  'write_file': writeFileHandler,
  'list_files': listFilesHandler,
  'email_search': emailSearchHandler,
  'email_get': emailGetHandler,
};
```

## Email Search Tools

Two tools for email operations:

1. **email_search** - Full-text search across inbox
   - Params: `{ query: string, inbox_id: string, limit?: number }`
   - Returns: List of matching emails with snippets

2. **email_get** - Fetch full email by message_id
   - Params: `{ message_id: string }`
   - Returns: Full email content

## Enron Database

Separate D1 database (`ENRON_DB`) with ~500K Enron emails:

```sql
CREATE TABLE emails (
  message_id TEXT PRIMARY KEY,
  inbox TEXT NOT NULL,          -- email address
  subject TEXT,
  sender TEXT,
  recipients TEXT,              -- JSON array
  date TEXT,
  body TEXT
);

CREATE INDEX idx_emails_inbox ON emails(inbox);
CREATE VIRTUAL TABLE emails_fts USING fts5(subject, body, content=emails);
```

## ART-E Benchmark

**Dataset:** [corbt/enron_emails_sample_questions](https://huggingface.co/datasets/corbt/enron_emails_sample_questions)
- 55,244 Q&A pairs (53.5K train, 1.7K test)
- Questions about Enron emails with ground truth answers

**Task format:**
```typescript
interface ArtETask {
  id: number;
  question: string;
  answer: string;           // Ground truth
  message_ids: string[];    // Source emails
  inbox_address: string;    // Which inbox
  query_date: string;       // Temporal cutoff
  how_realistic: number;    // 0.3-1.0
}
```

**Runner:** Executes tasks through playground agent, compares answers, stores traces with scores.

## Implementation Streams

### Stream 1: Schema & Migration
- Create `migrations/013_tool_registry.sql`
- Seed built-in tools (execute_python, file ops, email tools)
- Run migration

### Stream 2: Tool Registry Backend
- `src/playground/tools/registry.ts` - Handler lookup
- `src/api/tools.ts` - CRUD endpoints for tools
- Modify agent API to include tool associations

### Stream 3: Email Tools + Enron DB
- `src/playground/tools/email.ts` - Search and get handlers
- `scripts/import-enron.ts` - Download and import Enron dataset
- Configure `ENRON_DB` binding in wrangler.toml

### Stream 4: Playground Integration
- Modify `createPlaygroundDeepAgent` to load tools from DB
- Build LangChain tools dynamically from registry
- Backward compat: agents without agent_tools get defaults

### Stream 5: ART-E Benchmark Runner
- `src/benchmark/art-e-runner.ts` - Main runner
- HuggingFace dataset loader (parquet)
- Scoring: semantic similarity to ground truth
- Output traces for eval generation

## Success Criteria

1. Email Search Agent can answer Enron questions in playground
2. ART-E benchmark runs and produces accuracy metrics
3. Generated traces feed into eval generation pipeline
4. Tool registry is extensible for future tools
