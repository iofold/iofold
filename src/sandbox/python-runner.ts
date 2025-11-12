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

      const outputLines: string[] = [];
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

    let jsCode = pythonCode;

    // Handle json module FIRST before other replacements
    jsCode = jsCode.replace(/json\.dumps\s*\(/g, 'JSON.stringify(');
    jsCode = jsCode.replace(/json\.loads\s*\(/g, 'JSON.parse(');

    // Handle import statements
    jsCode = jsCode.replace(/import\s+json/g, '// import json (using native JSON)');
    jsCode = jsCode.replace(/import\s+\w+/g, '');
    jsCode = jsCode.replace(/from\s+\w+\s+import\s+\w+/g, '');

    // Replace print() with console.log() - uses greedy matching to capture full expression
    jsCode = jsCode.replace(/print\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g, 'console.log($1)');

    // Replace True/False with true/false
    jsCode = jsCode.replace(/\bTrue\b/g, 'true');
    jsCode = jsCode.replace(/\bFalse\b/g, 'false');

    // Replace None with null
    jsCode = jsCode.replace(/\bNone\b/g, 'null');

    // Handle str() function
    jsCode = jsCode.replace(/str\s*\((.*?)\)/g, 'String($1)');

    // Handle .get() method (Python dict)
    jsCode = jsCode.replace(/(\w+)\.get\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\)/g, '($1["$2"] !== undefined ? $1["$2"] : "$3")');
    jsCode = jsCode.replace(/(\w+)\.get\s*\(\s*"([^"]+)"\s*\)/g, '($1["$2"] !== undefined ? $1["$2"] : null)');

    // Replace 'in' operator for string contains
    jsCode = jsCode.replace(/"([^"]+)"\s+in\s+(\w+)/g, '$2.includes("$1")');

    // Remove Python comments
    jsCode = jsCode.replace(/#.*$/gm, '');

    // Handle pass statement
    jsCode = jsCode.replace(/\bpass\b/g, '{}');

    // Simple function def to JS function
    jsCode = jsCode.replace(/def\s+(\w+)\s*\((.*?)\)\s*:/g, 'function $1($2) {');

    // Handle if statements
    jsCode = jsCode.replace(/if\s+(.+?)\s*:/g, 'if ($1) {');

    // Handle while loops
    jsCode = jsCode.replace(/while\s+True\s*:/g, 'while (true) {');
    jsCode = jsCode.replace(/while\s+(.+?)\s*:/g, 'while ($1) {');

    // Handle return statements with tuples
    jsCode = jsCode.replace(/return\s+\((.*?),\s*(.*?)\)/g, 'return [$1, $2]');

    // Add closing braces for functions, loops, and if statements (very naive - just for basic tests)
    const defCount = (pythonCode.match(/def\s+/g) || []).length;
    const whileCount = (pythonCode.match(/while\s+/g) || []).length;
    const ifCount = (pythonCode.match(/\bif\s+/g) || []).length;
    jsCode += '\n' + '}'.repeat(defCount + whileCount + ifCount);

    return jsCode;
  }
}
