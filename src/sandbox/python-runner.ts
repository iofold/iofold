import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
}

export interface BatchTraceResult {
  trace_id: string;
  success: boolean;
  passed?: boolean;
  reason?: string;
  error?: string;
  execution_time_ms: number;
}

export interface BatchExecutionResult {
  results: BatchTraceResult[];
  total_time_ms: number;
}

export interface PythonRunnerConfig {
  timeout?: number; // milliseconds
  sandboxBinding?: DurableObjectNamespace<Sandbox>; // Cloudflare Sandbox binding
  sandboxId?: string; // Unique identifier for this sandbox instance
  /** URL of dev Python executor service (default: http://localhost:9999) */
  devExecutorUrl?: string;
  /** Custom allowed imports (default: basic imports for evals) */
  allowedImports?: string[];
}

// Default allowed imports for general eval/playground use
// These are safe, standard library modules with no filesystem/network access
const DEFAULT_ALLOWED_IMPORTS = ['json', 're', 'typing', 'math', 'datetime', 'difflib'];

// Extended imports for GEPA optimization (requires network access via httpx)
export const GEPA_ALLOWED_IMPORTS = ['json', 're', 'typing', 'httpx', 'openai', 'time', 'dataclasses', 'traceback', 'asyncio'];
const BLOCKED_IMPORTS = [
  'os', 'sys', 'subprocess', 'socket', 'urllib',
  'requests', 'http', 'ftplib', 'smtplib',
  'pickle', 'shelve', 'dbm',
  '__import__', 'eval', 'exec', 'compile'
];

/** Default URL for the dev Python executor service */
// Note: Workers can't access localhost directly in local dev mode.
// Use the host machine's network IP or override via PYTHON_EXECUTOR_URL env var.
const DEV_EXECUTOR_URL = 'http://10.160.0.12:9999';

export class PythonRunner {
  private config: PythonRunnerConfig;
  private sandbox?: Sandbox;
  private sandboxUsed: boolean = false; // Track if sandbox was actually used successfully
  private allowedImports: string[];

  constructor(config: PythonRunnerConfig = {}) {
    // Wrangler can inject vars into the Worker environment (e.g. `--var PYTHON_EXECUTOR_URL:...`).
    // We mirror that into the Node-compatible `process.env` (set in `src/index.ts`) and fall back
    // to localhost for non-docker local dev.
    const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const processEnvExecutorUrl = processEnv?.PYTHON_EXECUTOR_URL;

    // If PYTHON_EXECUTOR_URL is set, force HTTP executor mode (skip sandbox entirely)
    // This prevents noisy "Containers not enabled" errors in local dev
    const forceHttpExecutor = !!processEnvExecutorUrl;

    this.config = {
      timeout: config.timeout || 5000,
      // Clear sandbox binding if forcing HTTP executor
      sandboxBinding: forceHttpExecutor ? undefined : config.sandboxBinding,
      sandboxId: config.sandboxId || `python-eval-${Date.now()}`,
      devExecutorUrl: config.devExecutorUrl || processEnvExecutorUrl || DEV_EXECUTOR_URL,
      allowedImports: config.allowedImports
    };
    this.allowedImports = config.allowedImports || DEFAULT_ALLOWED_IMPORTS;
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
      // If no sandbox binding, fall back to dev executor HTTP service
      if (!this.config.sandboxBinding) {
        // Debug level - not an error, expected in local dev
        return this.executeViaHttpService(code, startTime);
      }

      // Initialize sandbox with keepAlive: false for automatic cleanup
      // Cast to any to avoid type incompatibility between @cloudflare/workers-types and @cloudflare/sandbox
      // Wrap in try-catch as getSandbox() throws if containers not enabled
      try {
        this.sandbox = getSandbox(this.config.sandboxBinding as any, this.config.sandboxId!, {
          keepAlive: false
        });
      } catch (initError: any) {
        // Containers not enabled at init - fall back to HTTP service silently
        if (initError.message?.includes('Containers have not been enabled')) {
          this.sandbox = undefined;
          return this.executeViaHttpService(code, startTime);
        }
        throw initError;
      }

      // Write Python code to a temporary file
      const scriptPath = '/tmp/eval_script.py';

      // Try to write file - if containers are disabled, this will fail
      try {
        await this.sandbox.writeFile(scriptPath, code);
      } catch (sandboxError: any) {
        // Containers not enabled - fall back to HTTP service silently
        if (sandboxError.message?.includes('Containers have not been enabled')) {
          this.sandbox = undefined;
          return this.executeViaHttpService(code, startTime);
        }
        throw sandboxError;
      }
      // Mark sandbox as successfully used (we wrote a file successfully)
      this.sandboxUsed = true;

      // Execute the Python script with timeout
      const result = await this.sandbox.exec(`python3 ${scriptPath}`, {
        timeout: this.config.timeout
      });

      const executionTimeMs = Date.now() - startTime;

      // Check if execution was successful
      if (result.exitCode === 0) {
        return {
          success: true,
          output: result.stdout.trim(),
          executionTimeMs
        };
      } else {
        return {
          success: false,
          error: result.stderr.trim() || `Process exited with code ${result.exitCode}`,
          executionTimeMs
        };
      }
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;

      // Handle "Containers not enabled" - fall back to HTTP service silently
      if (error.message?.includes('Containers have not been enabled')) {
        this.sandbox = undefined;
        return this.executeViaHttpService(code, startTime);
      }

      // Handle timeout errors
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        return {
          success: false,
          error: `Execution timeout exceeded ${this.config.timeout}ms`,
          executionTimeMs
        };
      }

      // Only log unexpected errors
      console.error('[PythonRunner] Execution error:', error.message);

      return {
        success: false,
        error: error.message || 'Unknown execution error',
        executionTimeMs
      };
    } finally {
      // Cleanup: destroy the sandbox to free resources
      // Only call destroy if we actually used the sandbox successfully
      if (this.sandbox && this.sandboxUsed) {
        try {
          await this.sandbox.destroy();
        } catch (cleanupError: any) {
          // Silently ignore "Containers not enabled" errors - expected in local dev
          // Only log other unexpected cleanup errors
          if (!cleanupError.message?.includes('Containers have not been enabled')) {
            console.warn('[PythonRunner] Cleanup warning:', cleanupError.message);
          }
        }
      }
      // Reset state for next execution
      this.sandbox = undefined;
      this.sandboxUsed = false;
    }
  }

  public validateCode(code: string): string | null {
    // Check for blocked imports
    for (const blockedImport of BLOCKED_IMPORTS) {
      const importPattern = new RegExp(
        `import\\s+${blockedImport}\\b|from\\s+${blockedImport}\\b`,
        'i'
      );
      if (importPattern.test(code)) {
        return `Blocked import detected: ${blockedImport}`;
      }
    }

    // Check for eval/exec/compile (but allow re.compile)
    // Use negative lookbehind to not match method calls like re.compile()
    if (/(?<!\.)(\beval\s*\(|\bexec\s*\(|\bcompile\s*\()/.test(code)) {
      return 'Blocked: eval/exec/compile not allowed';
    }

    // Validate allowed imports
    // Match both "import X" and "from X import Y"
    const simpleImports = code.matchAll(/^import\s+(\w+)/gm);
    const fromImports = code.matchAll(/^from\s+(\w+)\s+import/gm);

    for (const match of simpleImports) {
      const moduleName = match[1];
      if (moduleName && !this.allowedImports.includes(moduleName)) {
        return `Import not whitelisted: ${moduleName}. Allowed: ${this.allowedImports.join(', ')}`;
      }
    }

    for (const match of fromImports) {
      const moduleName = match[1];
      if (moduleName && !this.allowedImports.includes(moduleName)) {
        return `Import not whitelisted: ${moduleName}. Allowed: ${this.allowedImports.join(', ')}`;
      }
    }

    return null;
  }

  /**
   * Build a Python script that executes the eval function on all traces in a single sandbox.
   * This avoids the overhead of creating and destroying multiple sandboxes.
   *
   * @param evalCode - The user's eval function code
   * @param functionName - Name of the eval function to call (e.g., "eval_test")
   * @param traces - Array of traces to evaluate, each with trace_id and data
   * @returns Complete Python script that loops over traces and outputs JSON results
   */
  private buildBatchScript(
    evalCode: string,
    functionName: string,
    traces: Array<{ trace_id: string; data: any }>
  ): string {
    // Properly escape the traces JSON for embedding in Python string
    // Use JSON.stringify twice: once for the data, then escape for Python triple quotes
    const tracesJson = JSON.stringify(traces)
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/'''/g, "\\'\\'\\'");  // Escape triple quotes

    return `import json
import time

# User's eval function
${evalCode}

# All traces
traces_json = '''${tracesJson}'''
traces = json.loads(traces_json)

results = []
for trace_data in traces:
    trace_id = trace_data.get('trace_id', '')
    start_time = time.time()
    try:
        passed, reason = ${functionName}(trace_data.get('data', {}))
        execution_time_ms = int((time.time() - start_time) * 1000)
        results.append({
            'trace_id': trace_id,
            'success': True,
            'passed': bool(passed),
            'reason': str(reason),
            'execution_time_ms': execution_time_ms
        })
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        results.append({
            'trace_id': trace_id,
            'success': False,
            'error': str(e),
            'execution_time_ms': execution_time_ms
        })

print(json.dumps({'results': results}))`;
  }

  /**
   * Execute Python code via HTTP service (dev mode only)
   * Calls the python-executor-service running on the configured URL.
   *
   * Note: Workers can't access localhost directly in local dev mode.
   * The URL should be the host machine's network IP or an environment variable.
   */
  private async executeViaHttpService(code: string, startTime: number): Promise<ExecutionResult> {
    const url = `${this.config.devExecutorUrl}/execute`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeout: this.config.timeout })
      });

      const text = await response.text();

      try {
        const result = JSON.parse(text) as ExecutionResult;
        return result;
      } catch (parseError: any) {
        console.error(`[PythonRunner] JSON parse error: ${parseError.message}`);
        return {
          success: false,
          error: `Invalid JSON response: ${text.substring(0, 200)}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    } catch (error: any) {
      // Connection refused = service not running
      if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
        return {
          success: false,
          error: `Dev Python executor not running. Start it with: bun scripts/python-executor-service.ts`,
          executionTimeMs: Date.now() - startTime
        };
      }
      // Network error (e.g., Workers can't reach localhost)
      if (error.message?.includes('Network connection lost')) {
        return {
          success: false,
          error: `Network error: Workers can't access localhost. Set PYTHON_EXECUTOR_URL to host IP (e.g., http://10.x.x.x:9999)`,
          executionTimeMs: Date.now() - startTime
        };
      }
      return {
        success: false,
        error: `HTTP error: ${error.name}: ${error.message}`,
        executionTimeMs: Date.now() - startTime
      };
    }
  }
}
