import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
}

export interface PythonRunnerConfig {
  timeout?: number; // milliseconds
  sandboxBinding?: DurableObjectNamespace<Sandbox>; // Cloudflare Sandbox binding
  sandboxId?: string; // Unique identifier for this sandbox instance
  /** URL of dev Python executor service (default: http://localhost:9999) */
  devExecutorUrl?: string;
}

const ALLOWED_IMPORTS = ['json', 're', 'typing'];
const BLOCKED_IMPORTS = [
  'os', 'sys', 'subprocess', 'socket', 'urllib',
  'requests', 'http', 'ftplib', 'smtplib',
  'pickle', 'shelve', 'dbm',
  '__import__', 'eval', 'exec', 'compile'
];

/** Default URL for the dev Python executor service */
const DEV_EXECUTOR_URL = 'http://localhost:9999';

export class PythonRunner {
  private config: PythonRunnerConfig;
  private sandbox?: Sandbox;

  constructor(config: PythonRunnerConfig = {}) {
    this.config = {
      timeout: config.timeout || 5000,
      sandboxBinding: config.sandboxBinding,
      sandboxId: config.sandboxId || `python-eval-${Date.now()}`,
      devExecutorUrl: config.devExecutorUrl || DEV_EXECUTOR_URL
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
      // If no sandbox binding, fall back to dev executor HTTP service
      if (!this.config.sandboxBinding) {
        console.log('[PythonRunner] No sandbox binding - using dev executor service');
        return this.executeViaHttpService(code, startTime);
      }

      // Initialize sandbox with keepAlive: false for automatic cleanup
      this.sandbox = getSandbox(this.config.sandboxBinding, this.config.sandboxId, {
        keepAlive: false
      });

      // Write Python code to a temporary file
      const scriptPath = '/tmp/eval_script.py';
      await this.sandbox.writeFile(scriptPath, code);

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

      // Handle timeout errors
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        return {
          success: false,
          error: `Execution timeout exceeded ${this.config.timeout}ms`,
          executionTimeMs
        };
      }

      return {
        success: false,
        error: error.message || 'Unknown execution error',
        executionTimeMs
      };
    } finally {
      // Cleanup: destroy the sandbox to free resources
      // Only call destroy if we created the sandbox and keepAlive is false
      if (this.sandbox) {
        try {
          await this.sandbox.destroy();
        } catch (cleanupError) {
          // Log cleanup errors but don't fail the execution
          console.error('Failed to destroy sandbox:', cleanupError);
        }
      }
    }
  }

  public validateCode(code: string): string | null {
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
    // Match both "import X" and "from X import Y"
    const simpleImports = code.matchAll(/^import\s+(\w+)/gm);
    const fromImports = code.matchAll(/^from\s+(\w+)\s+import/gm);

    for (const match of simpleImports) {
      const moduleName = match[1];
      if (moduleName && !ALLOWED_IMPORTS.includes(moduleName)) {
        return `Import not whitelisted: ${moduleName}. Allowed: ${ALLOWED_IMPORTS.join(', ')}`;
      }
    }

    for (const match of fromImports) {
      const moduleName = match[1];
      if (moduleName && !ALLOWED_IMPORTS.includes(moduleName)) {
        return `Import not whitelisted: ${moduleName}. Allowed: ${ALLOWED_IMPORTS.join(', ')}`;
      }
    }

    return null;
  }

  /**
   * Execute Python code via HTTP service (dev mode only)
   * Calls the python-executor-service running on localhost:9999
   */
  private async executeViaHttpService(code: string, startTime: number): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${this.config.devExecutorUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeout: this.config.timeout })
      });

      const result = await response.json() as ExecutionResult;
      return result;
    } catch (error: any) {
      // Connection refused = service not running
      if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
        return {
          success: false,
          error: `Dev Python executor not running. Start it with: bun scripts/python-executor-service.ts`,
          executionTimeMs: Date.now() - startTime
        };
      }
      return {
        success: false,
        error: error.message || 'HTTP service error',
        executionTimeMs: Date.now() - startTime
      };
    }
  }
}
