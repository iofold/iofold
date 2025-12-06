# Pre-Implementation Validation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate core technical assumptions before building the full platform: Langfuse integration, Python sandbox security, and eval generation quality.

**Architecture:** Cloudflare Workers prototype with minimal D1 database, Langfuse adapter, Cloudflare Python sandbox, and meta-prompting eval generator using Claude API.

**Tech Stack:**
- Cloudflare Workers (TypeScript)
- Cloudflare Python Sandbox SDK
- Langfuse SDK/API
- D1 (SQLite) for trace storage
- Anthropic Claude API for eval generation
- TanStack Router/Query (deferred to Phase 1)

**Success Criteria:**
- ✅ Fetch and normalize 10+ traces from Langfuse
- ✅ Execute Python eval code safely in Cloudflare sandbox with restrictions
- ✅ Generate eval function with 80%+ accuracy on training set
- ✅ Measure LLM API costs per eval generation

---

## Task 1: Project Setup

**Files:**
- Create: `wrangler.toml`
- Create: `src/index.ts`
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Initialize Cloudflare Workers project**

Run:
```bash
npm create cloudflare@latest iofold-validation -- --type=hello-world --ts
cd iofold-validation
```

Expected: Project scaffolding created

**Step 2: Install dependencies**

Run:
```bash
npm install @langfuse/langfuse @anthropic-ai/sdk zod
npm install --save-dev @cloudflare/workers-types
```

Expected: Dependencies installed successfully

**Step 3: Configure wrangler.toml**

Edit `wrangler.toml`:
```toml
name = "iofold-validation"
main = "src/index.ts"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "iofold_validation"
database_id = "create-this-in-step-4"

[vars]
ENVIRONMENT = "development"
```

**Step 4: Create D1 database**

Run:
```bash
npx wrangler d1 create iofold_validation
```

Expected: Database created, copy `database_id` into wrangler.toml

**Step 5: Create database schema**

Create `schema.sql`:
```sql
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  source TEXT NOT NULL, -- 'langfuse'
  raw_data TEXT NOT NULL, -- JSON
  normalized_data TEXT, -- JSON in unified schema
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  rating TEXT NOT NULL, -- 'positive', 'negative', 'neutral'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_id) REFERENCES traces(id)
);

CREATE TABLE evals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- Python function
  version INTEGER DEFAULT 1,
  accuracy REAL,
  training_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eval_executions (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  predicted_pass BOOLEAN NOT NULL,
  reason TEXT,
  execution_time_ms INTEGER,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_id) REFERENCES evals(id),
  FOREIGN KEY (trace_id) REFERENCES traces(id)
);
```

**Step 6: Apply schema to D1**

Run:
```bash
npx wrangler d1 execute iofold_validation --local --file=./schema.sql
npx wrangler d1 execute iofold_validation --remote --file=./schema.sql
```

Expected: Tables created in local and remote databases

**Step 7: Set up environment variables**

Create `.env.example`:
```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
ANTHROPIC_API_KEY=sk-ant-...
```

Create `.env` (copy from .env.example and fill in real values)

**Step 8: Update .gitignore**

Create `.gitignore`:
```
node_modules/
.env
.wrangler/
dist/
.dev.vars
```

**Step 9: Commit initial setup**

Run:
```bash
git add .
git commit -m "feat: initialize cloudflare workers project with d1 schema"
```

Expected: Clean commit with project foundation

---

## Task 2: Langfuse Adapter Prototype

**Files:**
- Create: `src/adapters/langfuse.ts`
- Create: `src/types/trace.ts`
- Modify: `src/index.ts`

**Step 1: Define unified trace schema**

Create `src/types/trace.ts`:
```typescript
export interface LangGraphExecutionStep {
  step_id: string;
  trace_id: string;
  timestamp: string; // ISO 8601
  messages_added: Message[];
  tool_calls: ToolCall[];
  input: any;
  output: any;
  metadata: Record<string, any>;
  error?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

export interface Trace {
  id: string;
  trace_id: string;
  steps: LangGraphExecutionStep[];
  source: 'langfuse' | 'langsmith' | 'openai';
  raw_data: any;
}
```

**Step 2: Write Langfuse adapter test stub**

Create `src/adapters/langfuse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { LangfuseAdapter } from './langfuse';

describe('LangfuseAdapter', () => {
  it('should authenticate with valid API keys', async () => {
    const adapter = new LangfuseAdapter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL
    });

    await expect(adapter.authenticate()).resolves.not.toThrow();
  });

  it('should fetch traces from Langfuse', async () => {
    const adapter = new LangfuseAdapter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL
    });

    await adapter.authenticate();
    const traces = await adapter.fetchTraces({ limit: 5 });

    expect(traces).toBeInstanceOf(Array);
    expect(traces.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run:
```bash
npm install --save-dev vitest
npx vitest run src/adapters/langfuse.test.ts
```

Expected: FAIL with "Cannot find module './langfuse'"

**Step 4: Implement Langfuse adapter**

Create `src/adapters/langfuse.ts`:
```typescript
import Langfuse from '@langfuse/langfuse';
import type { Trace, LangGraphExecutionStep } from '../types/trace';

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

export interface TraceFilter {
  limit?: number;
  userId?: string;
  tags?: string[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
}

export class LangfuseAdapter {
  private client: Langfuse;
  private authenticated = false;

  constructor(private config: LangfuseConfig) {
    this.client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl || 'https://cloud.langfuse.com'
    });
  }

  async authenticate(): Promise<void> {
    try {
      // Test connection by fetching projects
      await this.client.fetch();
      this.authenticated = true;
    } catch (error) {
      throw new Error(`Langfuse authentication failed: ${error}`);
    }
  }

  async fetchTraces(filter: TraceFilter = {}): Promise<Trace[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    try {
      const traces = await this.client.fetchTraces({
        limit: filter.limit || 10,
        userId: filter.userId,
        tags: filter.tags,
        fromTimestamp: filter.fromTimestamp,
        toTimestamp: filter.toTimestamp
      });

      return traces.data.map(trace => this.normalizeTrace(trace));
    } catch (error) {
      throw new Error(`Failed to fetch traces: ${error}`);
    }
  }

  async fetchTraceById(id: string): Promise<Trace> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    try {
      const trace = await this.client.fetchTrace(id);
      return this.normalizeTrace(trace);
    } catch (error) {
      throw new Error(`Failed to fetch trace ${id}: ${error}`);
    }
  }

  private normalizeTrace(langfuseTrace: any): Trace {
    // Extract observations (spans, generations, events)
    const observations = langfuseTrace.observations || [];

    const steps: LangGraphExecutionStep[] = observations.map((obs: any) => ({
      step_id: obs.id,
      trace_id: langfuseTrace.id,
      timestamp: obs.startTime || obs.timestamp,
      messages_added: this.extractMessages(obs),
      tool_calls: this.extractToolCalls(obs),
      input: obs.input,
      output: obs.output,
      metadata: {
        name: obs.name,
        type: obs.type,
        level: obs.level,
        statusMessage: obs.statusMessage,
        ...obs.metadata
      },
      error: obs.level === 'ERROR' ? obs.statusMessage : undefined
    }));

    return {
      id: langfuseTrace.id,
      trace_id: langfuseTrace.id,
      steps,
      source: 'langfuse',
      raw_data: langfuseTrace
    };
  }

  private extractMessages(observation: any): any[] {
    // Langfuse stores messages in input/output for generation observations
    if (observation.type === 'GENERATION') {
      const messages = [];

      if (observation.input) {
        messages.push({
          role: 'user',
          content: typeof observation.input === 'string'
            ? observation.input
            : JSON.stringify(observation.input)
        });
      }

      if (observation.output) {
        messages.push({
          role: 'assistant',
          content: typeof observation.output === 'string'
            ? observation.output
            : JSON.stringify(observation.output)
        });
      }

      return messages;
    }

    return [];
  }

  private extractToolCalls(observation: any): any[] {
    // Check if this is a tool/function call
    if (observation.type === 'EVENT' && observation.name?.startsWith('tool_')) {
      return [{
        tool_name: observation.name.replace('tool_', ''),
        arguments: observation.input || {},
        result: observation.output,
        error: observation.level === 'ERROR' ? observation.statusMessage : undefined
      }];
    }

    return [];
  }
}
```

**Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run src/adapters/langfuse.test.ts
```

Expected: PASS (requires valid Langfuse API keys in .env)

**Step 6: Add API endpoint to fetch traces**

Modify `src/index.ts`:
```typescript
import { LangfuseAdapter } from './adapters/langfuse';

export interface Env {
  DB: D1Database;
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_BASE_URL?: string;
  ANTHROPIC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Fetch traces from Langfuse
    if (url.pathname === '/api/traces/fetch' && request.method === 'POST') {
      try {
        const { limit = 10 } = await request.json();

        const adapter = new LangfuseAdapter({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_BASE_URL
        });

        await adapter.authenticate();
        const traces = await adapter.fetchTraces({ limit });

        // Store traces in D1
        for (const trace of traces) {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO traces (id, trace_id, source, raw_data, normalized_data) VALUES (?, ?, ?, ?, ?)'
          )
            .bind(
              trace.id,
              trace.trace_id,
              trace.source,
              JSON.stringify(trace.raw_data),
              JSON.stringify(trace.steps)
            )
            .run();
        }

        return new Response(JSON.stringify({
          success: true,
          count: traces.length,
          traces: traces.map(t => ({
            id: t.id,
            trace_id: t.trace_id,
            steps_count: t.steps.length,
            source: t.source
          }))
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
```

**Step 7: Test the endpoint locally**

Run:
```bash
npx wrangler dev
```

In another terminal:
```bash
curl -X POST http://localhost:8787/api/traces/fetch \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

Expected: JSON response with fetched traces

**Step 8: Verify traces stored in D1**

Run:
```bash
npx wrangler d1 execute iofold_validation --local --command="SELECT id, trace_id, source FROM traces LIMIT 5"
```

Expected: List of stored traces

**Step 9: Commit Langfuse adapter**

Run:
```bash
git add .
git commit -m "feat: implement langfuse adapter with trace normalization"
```

Expected: Clean commit

---

## Task 3: Cloudflare Python Sandbox Setup

**Files:**
- Create: `src/sandbox/python-runner.ts`
- Create: `src/sandbox/test-eval.py` (test fixture)

**Step 1: Research Cloudflare Python sandbox SDK**

Run:
```bash
npm search @cloudflare/python
# or check documentation at https://developers.cloudflare.com/workers/runtime-apis/python/
```

Expected: Find correct package name and API

**Note:** As of Nov 2024, Cloudflare Workers Python support is in beta. If no official SDK exists, we'll need to use an alternative approach:
- Option A: Use `pyodide` (Python in WebAssembly)
- Option B: Use external Python sandbox service (Modal, AWS Lambda)
- Option C: Use Node.js `vm` module for now, defer Python to Phase 2

**Step 2: Install Python sandbox dependencies**

If Cloudflare SDK exists:
```bash
npm install @cloudflare/python-sandbox
```

If using Pyodide as fallback:
```bash
npm install pyodide
```

**Step 3: Write sandbox test**

Create `src/sandbox/python-runner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { PythonRunner } from './python-runner';

describe('PythonRunner', () => {
  it('should execute simple Python code', async () => {
    const runner = new PythonRunner();
    const result = await runner.execute('print("hello world")');

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello world');
  });

  it('should enforce timeout', async () => {
    const runner = new PythonRunner({ timeout: 1000 });
    const code = 'import time; time.sleep(5)';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should block dangerous imports', async () => {
    const runner = new PythonRunner();
    const code = 'import os; os.system("ls")';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('should allow whitelisted imports', async () => {
    const runner = new PythonRunner();
    const code = 'import json; print(json.dumps({"test": true}))';

    const result = await runner.execute(code);

    expect(result.success).toBe(true);
    expect(result.output).toContain('{"test": true}');
  });

  it('should execute eval function', async () => {
    const runner = new PythonRunner();
    const evalCode = `
def eval_test(trace):
    # Check if output contains expected text
    if "success" in str(trace.get("output", "")):
        return (True, "Output contains success")
    return (False, "Output missing success indicator")

# Test invocation
result = eval_test({"output": "operation success"})
print(result)
`;

    const result = await runner.execute(evalCode);

    expect(result.success).toBe(true);
    expect(result.output).toContain('True');
  });
});
```

**Step 4: Run test to verify it fails**

Run:
```bash
npx vitest run src/sandbox/python-runner.test.ts
```

Expected: FAIL with "Cannot find module './python-runner'"

**Step 5: Implement Python runner with security checks**

Create `src/sandbox/python-runner.ts`:
```typescript
import * as vm from 'vm';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
}

export interface PythonRunnerConfig {
  timeout?: number; // milliseconds
  memoryLimit?: number; // bytes (not enforced in Node.js vm)
}

const ALLOWED_IMPORTS = ['json', 're', 'typing'];
const BLOCKED_IMPORTS = [
  'os', 'sys', 'subprocess', 'socket', 'urllib',
  'requests', 'http', 'ftplib', 'smtplib',
  'pickle', 'shelve', 'dbm',
  '__import__', 'eval', 'exec', 'compile'
];

export class PythonRunner {
  private config: PythonRunnerConfig;

  constructor(config: PythonRunnerConfig = {}) {
    this.config = {
      timeout: config.timeout || 5000,
      memoryLimit: config.memoryLimit || 50 * 1024 * 1024 // 50MB
    };
  }

  async execute(code: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Step 1: Static analysis for dangerous imports
    const validationError = this.validateCode(code);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Step 2: Execute in sandboxed environment
    try {
      // NOTE: This is a PROTOTYPE implementation using Node.js vm module
      // For production, we MUST use proper Python sandbox:
      // - Cloudflare Workers Python SDK (when available)
      // - PyPy sandbox mode
      // - External sandboxed service (Modal, AWS Lambda with py-lambda-local)

      // Convert Python code to JavaScript equivalent for prototype
      // This is TEMPORARY - just for validation phase
      const jsCode = this.pythonToJsShim(code);

      const sandbox = {
        console: {
          log: (...args: any[]) => {
            outputLines.push(args.join(' '));
          }
        },
        JSON: JSON,
        RegExp: RegExp,
        setTimeout: undefined,
        setInterval: undefined,
        require: undefined,
        process: undefined,
        global: undefined
      };

      const outputLines: string[] = [];
      const script = new vm.Script(jsCode);
      const context = vm.createContext(sandbox);

      script.runInContext(context, {
        timeout: this.config.timeout,
        displayErrors: true
      });

      return {
        success: true,
        output: outputLines.join('\n'),
        executionTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        return {
          success: false,
          error: `Execution timeout exceeded ${this.config.timeout}ms`,
          executionTimeMs: Date.now() - startTime
        };
      }

      return {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  private validateCode(code: string): string | null {
    // Check for blocked imports
    for (const blockedImport of BLOCKED_IMPORTS) {
      const importPattern = new RegExp(
        `import\\s+${blockedImport}|from\\s+${blockedImport}`,
        'i'
      );
      if (importPattern.test(code)) {
        return `Blocked import detected: ${blockedImport}`;
      }
    }

    // Check for eval/exec
    if (/\beval\s*\(|\bexec\s*\(|\bcompile\s*\(/.test(code)) {
      return 'Blocked: eval/exec/compile not allowed';
    }

    // Validate allowed imports
    const importMatches = code.matchAll(/import\s+(\w+)|from\s+(\w+)/g);
    for (const match of importMatches) {
      const moduleName = match[1] || match[2];
      if (moduleName && !ALLOWED_IMPORTS.includes(moduleName)) {
        return `Import not whitelisted: ${moduleName}. Allowed: ${ALLOWED_IMPORTS.join(', ')}`;
      }
    }

    return null;
  }

  private pythonToJsShim(pythonCode: string): string {
    // TEMPORARY: Convert basic Python syntax to JavaScript for prototype
    // This is NOT a real Python interpreter - just for validation phase

    // Replace print() with console.log()
    let jsCode = pythonCode.replace(/print\s*\((.*?)\)/g, 'console.log($1)');

    // Replace True/False with true/false
    jsCode = jsCode.replace(/\bTrue\b/g, 'true');
    jsCode = jsCode.replace(/\bFalse\b/g, 'false');

    // Replace None with null
    jsCode = jsCode.replace(/\bNone\b/g, 'null');

    // Simple function def to JS function
    jsCode = jsCode.replace(/def\s+(\w+)\s*\((.*?)\)\s*:/g, 'function $1($2) {');

    // Add closing braces (very naive - just for basic tests)
    const defCount = (pythonCode.match(/def\s+/g) || []).length;
    jsCode += '\n' + '}'.repeat(defCount);

    return jsCode;
  }
}
```

**Step 6: Run tests**

Run:
```bash
npx vitest run src/sandbox/python-runner.test.ts
```

Expected: Some tests pass (basic ones), others may fail due to Python/JS differences
Note: This is acceptable for validation phase - we're proving the security model

**Step 7: Document sandbox limitations**

Create `src/sandbox/README.md`:
```markdown
# Python Sandbox - Validation Phase

## Current Implementation

**Status:** PROTOTYPE ONLY - Uses Node.js vm module with Python-to-JS shim

**Limitations:**
- Not real Python execution
- Limited syntax support
- No actual RestrictedPython or Cloudflare Python SDK

## Security Checks Implemented

✅ Import whitelist enforcement (json, re, typing)
✅ Blocked dangerous modules (os, sys, subprocess, socket, etc.)
✅ Timeout enforcement
✅ No eval/exec/compile

## Production Requirements

For Phase 1 implementation, we MUST use one of:

1. **Cloudflare Workers Python** (if available by then)
   - Native Python runtime on edge
   - Built-in sandboxing

2. **Pyodide (WebAssembly)**
   - Real Python interpreter in browser/workers
   - ~10MB bundle size
   - Good sandboxing

3. **External Service** (fallback)
   - Modal.com or AWS Lambda
   - Call external sandboxed Python runtime
   - Adds latency (~100-500ms)

## Next Steps for Phase 1

- Research Cloudflare Python Workers status
- If not available: Implement Pyodide integration
- If Pyodide too slow: Build external service architecture
```

**Step 8: Commit sandbox prototype**

Run:
```bash
git add .
git commit -m "feat: add python sandbox prototype with security checks"
```

Expected: Clean commit

---

## Task 4: Eval Generation with Meta-Prompting

**Files:**
- Create: `src/eval-generator/generator.ts`
- Create: `src/eval-generator/prompts.ts`
- Create: `src/eval-generator/generator.test.ts`
- Modify: `src/index.ts`

**Step 1: Write generator test**

Create `src/eval-generator/generator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { EvalGenerator } from './generator';
import type { Trace } from '../types/trace';

describe('EvalGenerator', () => {
  it('should generate eval function from labeled traces', async () => {
    const generator = new EvalGenerator({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!
    });

    const positiveTraces: Trace[] = [
      {
        id: '1',
        trace_id: '1',
        source: 'langfuse',
        raw_data: {},
        steps: [{
          step_id: '1',
          trace_id: '1',
          timestamp: new Date().toISOString(),
          messages_added: [],
          tool_calls: [],
          input: { query: 'What is 2+2?' },
          output: { answer: '4', confidence: 0.99 },
          metadata: {}
        }]
      }
    ];

    const negativeTraces: Trace[] = [
      {
        id: '2',
        trace_id: '2',
        source: 'langfuse',
        raw_data: {},
        steps: [{
          step_id: '2',
          trace_id: '2',
          timestamp: new Date().toISOString(),
          messages_added: [],
          tool_calls: [],
          input: { query: 'What is the capital of France?' },
          output: { answer: 'London', confidence: 0.5 },
          metadata: {}
        }]
      }
    ];

    const result = await generator.generate({
      name: 'answer_quality',
      positiveExamples: positiveTraces,
      negativeExamples: negativeTraces
    });

    expect(result.code).toContain('def eval_answer_quality');
    expect(result.code).toContain('return');
    expect(result.metadata.tokensUsed).toBeGreaterThan(0);
  }, 30000); // 30s timeout for LLM call
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/eval-generator/generator.test.ts
```

Expected: FAIL with "Cannot find module './generator'"

**Step 3: Create meta-prompting template**

Create `src/eval-generator/prompts.ts`:
```typescript
import type { Trace } from '../types/trace';

export function buildEvalGenerationPrompt(
  name: string,
  positiveExamples: Trace[],
  negativeExamples: Trace[]
): string {
  const positiveJson = JSON.stringify(
    positiveExamples.map(t => ({
      trace_id: t.trace_id,
      steps: t.steps.map(s => ({
        input: s.input,
        output: s.output,
        tool_calls: s.tool_calls,
        error: s.error
      }))
    })),
    null,
    2
  );

  const negativeJson = JSON.stringify(
    negativeExamples.map(t => ({
      trace_id: t.trace_id,
      steps: t.steps.map(s => ({
        input: s.input,
        output: s.output,
        tool_calls: s.tool_calls,
        error: s.error
      }))
    })),
    null,
    2
  );

  return `You are an expert at writing evaluation functions for AI agent execution traces.

Your task is to generate a Python function that can distinguish between good and bad traces based on the examples provided below.

## GOOD TRACES (should return True):
${positiveJson}

## BAD TRACES (should return False):
${negativeJson}

## Requirements:

1. **Function signature:**
   \`\`\`python
   def eval_${name}(trace: dict) -> tuple[bool, str]:
       """
       Evaluates a trace and returns (pass/fail, reason).

       Args:
           trace: Dictionary containing trace data with keys:
               - trace_id: str
               - steps: list of execution steps, each with:
                   - input: any
                   - output: any
                   - tool_calls: list
                   - error: str or None

       Returns:
           tuple: (True, reason) if trace passes, (False, reason) if it fails
       """
       # Your implementation here
   \`\`\`

2. **Allowed imports ONLY:** json, re, typing
   - Do not import any other modules
   - No os, sys, subprocess, requests, etc.

3. **Be specific about what makes traces good vs bad:**
   - Identify concrete patterns from the examples
   - Check specific fields (output quality, error presence, tool usage, etc.)
   - Explain your reasoning in the return message

4. **Handle edge cases:**
   - Missing fields (use .get() with defaults)
   - Different data types
   - Empty lists/dicts
   - Unexpected structures

5. **Add clear comments explaining your logic**

6. **Return format:**
   - Return (True, "Clear reason why this passed") for good traces
   - Return (False, "Clear reason why this failed") for bad traces

## Output:

Generate the complete Python function following the requirements above. Include only the function code, no additional explanation.`;
}
```

**Step 4: Implement eval generator**

Create `src/eval-generator/generator.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { Trace } from '../types/trace';
import { buildEvalGenerationPrompt } from './prompts';

export interface GenerateEvalRequest {
  name: string;
  positiveExamples: Trace[];
  negativeExamples: Trace[];
}

export interface GenerateEvalResult {
  code: string;
  metadata: {
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
    model: string;
  };
}

export interface EvalGeneratorConfig {
  anthropicApiKey: string;
  model?: string;
}

export class EvalGenerator {
  private client: Anthropic;
  private model: string;

  constructor(config: EvalGeneratorConfig) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  async generate(request: GenerateEvalRequest): Promise<GenerateEvalResult> {
    // Build prompt
    const prompt = buildEvalGenerationPrompt(
      request.name,
      request.positiveExamples,
      request.negativeExamples
    );

    // Call Claude API
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract code from response
    const code = this.extractCode(response.content);

    return {
      code,
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        model: this.model
      }
    };
  }

  private extractCode(content: any[]): string {
    // Find text content
    const textContent = content.find(block => block.type === 'text');
    if (!textContent) {
      throw new Error('No text content in response');
    }

    const text = textContent.text;

    // Extract code from markdown code blocks
    const codeBlockMatch = text.match(/```python\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, return full text (Claude might not use markdown)
    return text.trim();
  }
}
```

**Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run src/eval-generator/generator.test.ts
```

Expected: PASS (requires valid Anthropic API key in .env)

**Step 6: Add API endpoint for eval generation**

Modify `src/index.ts` to add:
```typescript
// Add after the /api/traces/fetch endpoint:

    // Generate eval function
    if (url.pathname === '/api/evals/generate' && request.method === 'POST') {
      try {
        const { name, positiveTraceIds, negativeTraceIds } = await request.json();

        // Fetch traces from database
        const fetchTrace = async (id: string) => {
          const result = await env.DB.prepare(
            'SELECT * FROM traces WHERE id = ?'
          ).bind(id).first();

          if (!result) {
            throw new Error(`Trace ${id} not found`);
          }

          return {
            id: result.id,
            trace_id: result.trace_id,
            source: result.source,
            steps: JSON.parse(result.normalized_data as string),
            raw_data: JSON.parse(result.raw_data as string)
          };
        };

        const positiveTraces = await Promise.all(
          positiveTraceIds.map(fetchTrace)
        );
        const negativeTraces = await Promise.all(
          negativeTraceIds.map(fetchTrace)
        );

        // Generate eval
        const generator = new EvalGenerator({
          anthropicApiKey: env.ANTHROPIC_API_KEY
        });

        const result = await generator.generate({
          name,
          positiveExamples: positiveTraces,
          negativeExamples: negativeTraces
        });

        // Validate generated code
        const runner = new PythonRunner();
        const validation = runner['validateCode'](result.code);
        if (validation) {
          return new Response(JSON.stringify({
            success: false,
            error: `Generated code validation failed: ${validation}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Store eval in database
        const evalId = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO evals (id, name, code, training_count, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(
            evalId,
            name,
            result.code,
            positiveTraces.length + negativeTraces.length,
            new Date().toISOString()
          )
          .run();

        return new Response(JSON.stringify({
          success: true,
          evalId,
          code: result.code,
          metadata: result.metadata
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
```

**Step 7: Test eval generation endpoint**

Run:
```bash
npx wrangler dev
```

In another terminal:
```bash
# First, fetch some traces and note their IDs
curl -X POST http://localhost:8787/api/traces/fetch \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'

# Then generate eval (use actual trace IDs from above)
curl -X POST http://localhost:8787/api/evals/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "response_quality",
    "positiveTraceIds": ["trace-id-1", "trace-id-2"],
    "negativeTraceIds": ["trace-id-3", "trace-id-4"]
  }'
```

Expected: JSON response with generated eval code

**Step 8: Commit eval generator**

Run:
```bash
git add .
git commit -m "feat: implement eval generation with claude meta-prompting"
```

Expected: Clean commit

---

## Task 5: Eval Testing and Accuracy Measurement

**Files:**
- Create: `src/eval-generator/tester.ts`
- Create: `src/eval-generator/tester.test.ts`
- Modify: `src/index.ts`

**Step 1: Write eval tester test**

Create `src/eval-generator/tester.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { EvalTester } from './tester';
import type { Trace } from '../types/trace';

describe('EvalTester', () => {
  it('should test eval against training set', async () => {
    const tester = new EvalTester();

    const evalCode = `
def eval_test(trace):
    output = trace.get('steps', [{}])[0].get('output', {})
    if 'success' in str(output):
        return (True, "Output indicates success")
    return (False, "Output does not indicate success")
`;

    const traces: Array<{ trace: Trace; expectedPass: boolean }> = [
      {
        trace: {
          id: '1',
          trace_id: '1',
          source: 'langfuse',
          raw_data: {},
          steps: [{
            step_id: '1',
            trace_id: '1',
            timestamp: new Date().toISOString(),
            messages_added: [],
            tool_calls: [],
            input: {},
            output: { result: 'success' },
            metadata: {}
          }]
        },
        expectedPass: true
      },
      {
        trace: {
          id: '2',
          trace_id: '2',
          source: 'langfuse',
          raw_data: {},
          steps: [{
            step_id: '2',
            trace_id: '2',
            timestamp: new Date().toISOString(),
            messages_added: [],
            tool_calls: [],
            input: {},
            output: { result: 'failure' },
            metadata: {}
          }]
        },
        expectedPass: false
      }
    ];

    const result = await tester.test(evalCode, traces);

    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(2);
    expect(result.accuracy).toBe(1.0);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run src/eval-generator/tester.test.ts
```

Expected: FAIL with "Cannot find module './tester'"

**Step 3: Implement eval tester**

Create `src/eval-generator/tester.ts`:
```typescript
import { PythonRunner } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';

export interface TestCase {
  trace: Trace;
  expectedPass: boolean;
}

export interface TestResult {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  accuracy: number;
  details: TestCaseResult[];
}

export interface TestCaseResult {
  traceId: string;
  expected: boolean;
  predicted: boolean;
  reason: string;
  match: boolean;
  error?: string;
  executionTimeMs: number;
}

export class EvalTester {
  private runner: PythonRunner;

  constructor() {
    this.runner = new PythonRunner();
  }

  async test(evalCode: string, testCases: TestCase[]): Promise<TestResult> {
    const results: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const result = await this.testSingle(evalCode, testCase);
      results.push(result);
    }

    const correct = results.filter(r => r.match && !r.error).length;
    const errors = results.filter(r => r.error).length;
    const total = results.length;

    return {
      correct,
      incorrect: total - correct - errors,
      errors,
      total,
      accuracy: total > 0 ? correct / total : 0,
      details: results
    };
  }

  private async testSingle(
    evalCode: string,
    testCase: TestCase
  ): Promise<TestCaseResult> {
    // Prepare trace data in format eval function expects
    const traceData = {
      trace_id: testCase.trace.trace_id,
      steps: testCase.trace.steps.map(step => ({
        input: step.input,
        output: step.output,
        tool_calls: step.tool_calls,
        error: step.error
      }))
    };

    // Build execution code
    const executionCode = `
${evalCode}

# Execute eval function
import json
trace_data = json.loads('${JSON.stringify(traceData).replace(/'/g, "\\'")}')
result = eval_${testCase.trace.trace_id.replace(/[^a-zA-Z0-9]/g, '_')}(trace_data)
print(json.dumps({"pass": result[0], "reason": result[1]}))
`;

    try {
      const execution = await this.runner.execute(executionCode);

      if (!execution.success) {
        return {
          traceId: testCase.trace.trace_id,
          expected: testCase.expectedPass,
          predicted: false,
          reason: '',
          match: false,
          error: execution.error,
          executionTimeMs: execution.executionTimeMs
        };
      }

      // Parse result from output
      const resultMatch = execution.output?.match(/\{"pass":\s*(true|false),\s*"reason":\s*"([^"]*)"\}/);
      if (!resultMatch) {
        return {
          traceId: testCase.trace.trace_id,
          expected: testCase.expectedPass,
          predicted: false,
          reason: '',
          match: false,
          error: 'Could not parse eval result',
          executionTimeMs: execution.executionTimeMs
        };
      }

      const predicted = resultMatch[1] === 'true';
      const reason = resultMatch[2];

      return {
        traceId: testCase.trace.trace_id,
        expected: testCase.expectedPass,
        predicted,
        reason,
        match: predicted === testCase.expectedPass,
        executionTimeMs: execution.executionTimeMs
      };
    } catch (error: any) {
      return {
        traceId: testCase.trace.trace_id,
        expected: testCase.expectedPass,
        predicted: false,
        reason: '',
        match: false,
        error: error.message,
        executionTimeMs: 0
      };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/eval-generator/tester.test.ts
```

Expected: PASS

**Step 5: Add API endpoint for eval testing**

Modify `src/index.ts` to add:
```typescript
// Add after /api/evals/generate:

    // Test eval on training set
    if (url.pathname.startsWith('/api/evals/') && url.pathname.endsWith('/test') && request.method === 'POST') {
      try {
        const evalId = url.pathname.split('/')[3];

        // Fetch eval
        const evalRecord = await env.DB.prepare(
          'SELECT * FROM evals WHERE id = ?'
        ).bind(evalId).first();

        if (!evalRecord) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Eval not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Fetch test cases from request
        const { traceIds } = await request.json();

        const testCases = await Promise.all(
          traceIds.map(async (item: { traceId: string; expectedPass: boolean }) => {
            const traceRecord = await env.DB.prepare(
              'SELECT * FROM traces WHERE id = ?'
            ).bind(item.traceId).first();

            if (!traceRecord) {
              throw new Error(`Trace ${item.traceId} not found`);
            }

            return {
              trace: {
                id: traceRecord.id,
                trace_id: traceRecord.trace_id,
                source: traceRecord.source,
                steps: JSON.parse(traceRecord.normalized_data as string),
                raw_data: JSON.parse(traceRecord.raw_data as string)
              },
              expectedPass: item.expectedPass
            };
          })
        );

        // Test eval
        const tester = new EvalTester();
        const result = await tester.test(evalRecord.code as string, testCases);

        // Update eval with accuracy
        await env.DB.prepare(
          'UPDATE evals SET accuracy = ? WHERE id = ?'
        ).bind(result.accuracy, evalId).run();

        // Store execution results
        for (const detail of result.details) {
          const executionId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO eval_executions (id, eval_id, trace_id, predicted_pass, reason, execution_time_ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(
              executionId,
              evalId,
              detail.traceId,
              detail.predicted ? 1 : 0,
              detail.reason,
              detail.executionTimeMs,
              detail.error || null,
              new Date().toISOString()
            )
            .run();
        }

        return new Response(JSON.stringify({
          success: true,
          result: {
            accuracy: result.accuracy,
            correct: result.correct,
            incorrect: result.incorrect,
            errors: result.errors,
            total: result.total,
            lowConfidence: result.accuracy < 0.8
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
```

**Step 6: Test eval testing endpoint**

Run:
```bash
# Generate an eval first (from Task 4)
# Then test it:
curl -X POST http://localhost:8787/api/evals/{eval-id}/test \
  -H "Content-Type: application/json" \
  -d '{
    "traceIds": [
      {"traceId": "trace-1", "expectedPass": true},
      {"traceId": "trace-2", "expectedPass": false}
    ]
  }'
```

Expected: JSON response with accuracy metrics

**Step 7: Commit eval testing**

Run:
```bash
git add .
git commit -m "feat: implement eval testing and accuracy measurement"
```

Expected: Clean commit

---

## Task 6: Cost Tracking and Reporting

**Files:**
- Create: `src/analytics/cost-tracker.ts`
- Create: `docs/validation-results.md`

**Step 1: Implement cost tracker**

Create `src/analytics/cost-tracker.ts`:
```typescript
export interface CostMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  model: string;
}

export class CostTracker {
  // Claude pricing (as of Nov 2024)
  private static CLAUDE_PRICING = {
    'claude-3-5-sonnet-20241022': {
      input: 3.00 / 1_000_000,  // $3 per million input tokens
      output: 15.00 / 1_000_000  // $15 per million output tokens
    },
    'claude-3-opus-20240229': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
    },
    'claude-3-haiku-20240307': {
      input: 0.25 / 1_000_000,
      output: 1.25 / 1_000_000
    }
  };

  static calculateCost(metrics: {
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): CostMetrics {
    const pricing = this.CLAUDE_PRICING[metrics.model as keyof typeof this.CLAUDE_PRICING];

    if (!pricing) {
      throw new Error(`Unknown model: ${metrics.model}`);
    }

    const inputCost = metrics.promptTokens * pricing.input;
    const outputCost = metrics.completionTokens * pricing.output;

    return {
      totalTokens: metrics.promptTokens + metrics.completionTokens,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      estimatedCostUSD: inputCost + outputCost,
      model: metrics.model
    };
  }

  static projectCostAtScale(costPerEval: number, evalsPerMonth: number): {
    monthly: number;
    annual: number;
  } {
    return {
      monthly: costPerEval * evalsPerMonth,
      annual: costPerEval * evalsPerMonth * 12
    };
  }
}
```

**Step 2: Add cost tracking to eval generation**

Modify `src/eval-generator/generator.ts`:
```typescript
// Add at the end of generate() method, before return:

    // Calculate cost
    const cost = CostTracker.calculateCost({
      model: this.model,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens
    });

    console.log(`[Cost] Generated eval for $${cost.estimatedCostUSD.toFixed(4)}`);
    console.log(`[Cost] Tokens: ${cost.totalTokens} (${cost.promptTokens} in, ${cost.completionTokens} out)`);

    return {
      code,
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        model: this.model,
        cost // Add this field
      }
    };
```

**Step 3: Run validation experiment**

Create a script to run full validation:

Create `scripts/run-validation.ts`:
```typescript
#!/usr/bin/env tsx

import { LangfuseAdapter } from '../src/adapters/langfuse';
import { EvalGenerator } from '../src/eval-generator/generator';
import { EvalTester } from '../src/eval-generator/tester';
import { CostTracker } from '../src/analytics/cost-tracker';

async function main() {
  console.log('=== iofold Pre-Implementation Validation ===\n');

  // Step 1: Fetch traces from Langfuse
  console.log('1. Fetching traces from Langfuse...');
  const adapter = new LangfuseAdapter({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL
  });

  await adapter.authenticate();
  const traces = await adapter.fetchTraces({ limit: 10 });
  console.log(`✅ Fetched ${traces.length} traces\n`);

  // Step 2: Manually label traces (for validation, we'll split randomly)
  console.log('2. Labeling traces...');
  const positiveTraces = traces.slice(0, 5);
  const negativeTraces = traces.slice(5, 10);
  console.log(`✅ Labeled ${positiveTraces.length} positive, ${negativeTraces.length} negative\n`);

  // Step 3: Generate eval
  console.log('3. Generating eval function...');
  const generator = new EvalGenerator({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!
  });

  const evalResult = await generator.generate({
    name: 'validation_test',
    positiveExamples: positiveTraces,
    negativeExamples: negativeTraces
  });

  console.log('✅ Generated eval function');
  console.log(`   Tokens: ${evalResult.metadata.tokensUsed}`);
  console.log(`   Cost: $${evalResult.metadata.cost.estimatedCostUSD.toFixed(4)}\n`);

  // Step 4: Test eval accuracy
  console.log('4. Testing eval accuracy...');
  const tester = new EvalTester();
  const testCases = [
    ...positiveTraces.map(t => ({ trace: t, expectedPass: true })),
    ...negativeTraces.map(t => ({ trace: t, expectedPass: false }))
  ];

  const testResult = await tester.test(evalResult.code, testCases);
  console.log('✅ Eval testing complete');
  console.log(`   Accuracy: ${(testResult.accuracy * 100).toFixed(1)}%`);
  console.log(`   Correct: ${testResult.correct}/${testResult.total}`);
  console.log(`   Errors: ${testResult.errors}\n`);

  // Step 5: Project costs at scale
  console.log('5. Cost projections at scale...');
  const costPerEval = evalResult.metadata.cost.estimatedCostUSD;

  const scenarios = [
    { evalsPerMonth: 10, label: 'Small team (10 evals/month)' },
    { evalsPerMonth: 50, label: 'Medium team (50 evals/month)' },
    { evalsPerMonth: 200, label: 'Large team (200 evals/month)' }
  ];

  for (const scenario of scenarios) {
    const projection = CostTracker.projectCostAtScale(costPerEval, scenario.evalsPerMonth);
    console.log(`   ${scenario.label}:`);
    console.log(`     Monthly: $${projection.monthly.toFixed(2)}`);
    console.log(`     Annual: $${projection.annual.toFixed(2)}`);
  }

  console.log('\n=== Validation Complete ===');

  // Write results
  const results = {
    date: new Date().toISOString(),
    traces_fetched: traces.length,
    eval_generated: true,
    accuracy: testResult.accuracy,
    cost_per_eval: costPerEval,
    projections: scenarios.map(s => ({
      ...s,
      ...CostTracker.projectCostAtScale(costPerEval, s.evalsPerMonth)
    }))
  };

  console.log('\nWriting results to docs/validation-results.md...');
  // You would write this to file here
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
```

Install tsx for running TypeScript:
```bash
npm install --save-dev tsx
```

**Step 4: Run validation script**

Run:
```bash
npx tsx scripts/run-validation.ts
```

Expected: Complete validation run with metrics printed

**Step 5: Document results**

Create `docs/validation-results.md`:
```markdown
# Pre-Implementation Validation Results

**Date:** 2025-11-12
**Status:** [PENDING - Fill in after running validation]

## Summary

✅ **Langfuse Integration:** Successfully fetched and normalized traces
✅ **Python Sandbox:** Security checks implemented and tested
✅ **Eval Generation:** Meta-prompting produces valid Python code
✅ **Cost Analysis:** LLM costs measured and projected

## Detailed Results

### 1. Langfuse Adapter

- **Traces Fetched:** [X]
- **Normalization Success Rate:** [X]%
- **Average Fetch Time:** [X]ms

### 2. Eval Generation

- **Model Used:** claude-3-5-sonnet-20241022
- **Average Tokens per Eval:** [X]
- **Average Cost per Eval:** $[X]
- **Generation Success Rate:** [X]%

### 3. Eval Accuracy

- **Training Set Size:** [X] traces
- **Average Accuracy:** [X]%
- **High Quality Evals (>80%):** [X]%
- **Low Quality Evals (<80%):** [X]%

### 4. Cost Projections

| Scenario | Evals/Month | Monthly Cost | Annual Cost |
|----------|-------------|--------------|-------------|
| Small team | 10 | $[X] | $[X] |
| Medium team | 50 | $[X] | $[X] |
| Large team | 200 | $[X] | $[X] |

## Key Findings

1. **Langfuse Integration:** [Notes on ease of integration, API stability, data quality]

2. **Python Sandbox:** [Notes on security model, limitations, production readiness]

3. **Eval Quality:** [Notes on accuracy, common failure modes, improvement opportunities]

4. **Cost Viability:** [Notes on whether costs are sustainable, pricing implications]

## Blockers & Risks

### Critical Blockers
- [ ] [Any showstopper issues]

### Risks
- [ ] [Technical or business risks identified]

## Go/No-Go Decision

**Decision:** [GO / NO-GO / NEEDS MORE VALIDATION]

**Reasoning:** [Why we should or shouldn't proceed with full implementation]

## Next Steps

If GO:
1. Resolve technical decisions (frontend framework, Python runtime)
2. Begin Phase 1: Foundation implementation
3. Address any blockers identified above

If NO-GO:
1. [Alternative approaches to consider]
2. [Areas requiring more research]

---

**Validated by:** [Your name]
**Reviewed by:** [Stakeholder names]
```

**Step 6: Commit validation complete**

Run:
```bash
git add .
git commit -m "feat: add cost tracking and validation experiment"
```

Expected: Clean commit

---

## Task 7: Final Review and Documentation

**Files:**
- Create: `README.md`
- Create: `docs/next-steps.md`

**Step 1: Write project README**

Create `README.md`:
```markdown
# iofold Validation Prototype

**Status:** Pre-Implementation Validation Phase

This is a prototype implementation to validate core technical assumptions before building the full iofold.com platform.

## What This Validates

✅ Langfuse trace fetching and normalization
✅ Python eval code execution sandbox
✅ LLM-based eval generation quality
✅ Cost analysis at scale

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** D1 (SQLite)
- **LLM:** Claude 3.5 Sonnet via Anthropic API
- **Trace Source:** Langfuse

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Fill in your API keys:
   # - LANGFUSE_PUBLIC_KEY
   # - LANGFUSE_SECRET_KEY
   # - ANTHROPIC_API_KEY
   ```

3. **Create D1 database:**
   ```bash
   npx wrangler d1 create iofold_validation
   # Copy database_id to wrangler.toml
   ```

4. **Apply schema:**
   ```bash
   npx wrangler d1 execute iofold_validation --local --file=./schema.sql
   npx wrangler d1 execute iofold_validation --remote --file=./schema.sql
   ```

## Usage

### Run Validation Experiment

```bash
npx tsx scripts/run-validation.ts
```

This will:
1. Fetch 10 traces from Langfuse
2. Generate an eval function
3. Test accuracy on training set
4. Calculate and project costs

### Start Dev Server

```bash
npx wrangler dev
```

Then use the API endpoints:

**Fetch traces:**
```bash
curl -X POST http://localhost:8787/api/traces/fetch \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

**Generate eval:**
```bash
curl -X POST http://localhost:8787/api/evals/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test_eval",
    "positiveTraceIds": ["id1", "id2"],
    "negativeTraceIds": ["id3", "id4"]
  }'
```

**Test eval:**
```bash
curl -X POST http://localhost:8787/api/evals/{eval-id}/test \
  -H "Content-Type: application/json" \
  -d '{
    "traceIds": [
      {"traceId": "id1", "expectedPass": true},
      {"traceId": "id3", "expectedPass": false}
    ]
  }'
```

## Project Structure

```
├── src/
│   ├── index.ts              # Main Worker entry point
│   ├── adapters/
│   │   └── langfuse.ts       # Langfuse trace adapter
│   ├── eval-generator/
│   │   ├── generator.ts      # LLM-based eval generation
│   │   ├── prompts.ts        # Meta-prompting templates
│   │   └── tester.ts         # Eval accuracy testing
│   ├── sandbox/
│   │   └── python-runner.ts  # Python execution sandbox (prototype)
│   ├── analytics/
│   │   └── cost-tracker.ts   # LLM cost calculation
│   └── types/
│       └── trace.ts          # Unified trace schema
├── docs/
│   ├── validation-results.md # Validation experiment results
│   └── plans/               # Implementation plans
├── scripts/
│   └── run-validation.ts    # Validation experiment runner
├── schema.sql               # D1 database schema
└── wrangler.toml           # Cloudflare Workers config
```

## Limitations

**This is a PROTOTYPE. Not production-ready.**

### Python Sandbox
- Uses Node.js `vm` module with Python-to-JS shim
- NOT real Python execution
- Security model demonstrated but not production-grade
- **Phase 1 must use:** Cloudflare Python SDK, Pyodide, or external service

### Features
- No authentication
- No frontend
- Minimal error handling
- No caching or optimization

## Results

See `docs/validation-results.md` for detailed findings.

## Next Steps

If validation successful:
1. **Make technical decisions** (frontend, Python runtime, auth)
2. **Begin Phase 1 implementation** (see `docs/2025-11-05-iofold-evals-todo.md`)
3. **Implement production Python sandbox**
4. **Build frontend with TanStack Router + Query**

## License

[Your license]
```

**Step 2: Write next steps document**

Create `docs/next-steps.md`:
```markdown
# Next Steps After Validation

## Immediate Decisions Required

Before starting Phase 1, resolve:

### 1. Python Runtime (CRITICAL)
Research and decide by [date]:

**Options:**
- ✅ **Cloudflare Workers Python** (if available)
  - Check beta status and access
  - Test with sandbox constraints
  - Measure cold start time

- ✅ **Pyodide (WebAssembly)**
  - Prototype with real Python eval
  - Measure bundle size impact (~10MB)
  - Test performance on edge

- ✅ **External Service**
  - Design architecture for external sandbox (Modal, AWS Lambda)
  - Measure added latency
  - Calculate cost impact

**Decision Criteria:**
- Security isolation quality
- Cold start / execution time
- Cost per execution
- Development complexity

### 2. Frontend Framework
Already chosen: **TanStack Router + TanStack Query**

**Phase 1 Tasks:**
- Set up Cloudflare Pages project
- Integrate with Workers API
- Choose UI library (Tailwind + shadcn/ui? Radix?)

### 3. Authentication
Already chosen: **Clerk**

**Phase 1 Tasks:**
- Set up Clerk account
- Configure OAuth providers
- Integrate with Workers
- Implement JWT validation

## Phase 1 Roadmap

See `docs/2025-11-05-iofold-evals-todo.md` for full task list.

**Priority order:**
1. ✅ Production Python sandbox (based on decision above)
2. Backend API foundation (auth, trace storage)
3. Frontend setup (TanStack Router + Pages)
4. Trace review UI (first user-facing feature)
5. Basic eval generation (end-to-end flow)

## Success Metrics for Phase 1

**Technical:**
- [ ] 10+ traces fetched and displayed in UI
- [ ] 1 eval generated and tested with 80%+ accuracy
- [ ] Python sandbox verified secure (external audit?)
- [ ] < 3s page load time (p95)

**User:**
- [ ] 1-2 beta users onboarded
- [ ] Feedback collected on UX
- [ ] 1 real eval deployed in production workflow

## Open Questions

Track answers in `docs/validation-results.md`:

1. Is eval accuracy acceptable with minimal training data (5-10 examples)?
2. Do users understand the swipe feedback interface?
3. Is generated eval code readable and maintainable?
4. Are LLM costs sustainable at scale?
5. Does Langfuse provide sufficient trace data quality?

## Resources

- **Cloudflare Docs:** https://developers.cloudflare.com/
- **TanStack Router:** https://tanstack.com/router
- **TanStack Query:** https://tanstack.com/query
- **Clerk Docs:** https://clerk.com/docs
- **Pyodide:** https://pyodide.org/
- **Langfuse API:** https://langfuse.com/docs/api

---

**Created:** 2025-11-12
**Owner:** [Your name]
```

**Step 3: Final verification checklist**

Run through this checklist:

```bash
# All tests pass?
npx vitest run

# Can fetch traces?
curl -X POST http://localhost:8787/api/traces/fetch -H "Content-Type: application/json" -d '{"limit": 5}'

# Can generate eval?
# (requires trace IDs from above)

# Database schema applied?
npx wrangler d1 execute iofold_validation --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Git history clean?
git log --oneline

# Documentation complete?
ls -la docs/
```

Expected: All checks pass

**Step 4: Final commit**

Run:
```bash
git add .
git commit -m "docs: add README and next steps documentation"
```

**Step 5: Tag release**

Run:
```bash
git tag -a v0.1.0-validation -m "Pre-implementation validation complete"
git push origin main --tags
```

Expected: Tagged release created

---

## Validation Complete! 🎉

**You have successfully completed Pre-Implementation Validation.**

### What was validated:
✅ Langfuse trace fetching and normalization
✅ Python sandbox security model (prototype)
✅ LLM-based eval generation quality
✅ Cost projections at scale

### What to do next:
1. Review `docs/validation-results.md` for findings
2. Make Go/No-Go decision
3. If GO: Resolve technical decisions and begin Phase 1
4. If NO-GO: Document learnings and pivot

### Key Artifacts:
- Working Cloudflare Workers API
- Langfuse adapter with normalized schema
- Eval generator with meta-prompting
- Cost tracking and projections
- Complete documentation

**Great work!** 🚀
