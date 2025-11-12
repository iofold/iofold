# Python Sandbox - Validation Phase

## Current Implementation

**Status:** PROTOTYPE ONLY - Uses Node.js vm module with Python-to-JS shim

**Purpose:** This is a validation phase implementation to prove the security model and architectural approach before building production Python sandbox integration.

## Limitations

### Not Real Python Execution
- Uses JavaScript vm module, not actual Python runtime
- Basic Python-to-JS syntax conversion only
- Limited support for Python language features
- No support for Python standard library functions (except whitelisted modules in name only)

### Supported Python Features (Limited)
- Simple print() statements
- Basic if statements
- Function definitions (simple cases)
- Boolean literals (True/False)
- None type
- String contains checks ("x" in str)
- Comments (removed during transformation)

### Unsupported Python Features
- Classes and OOP
- List comprehensions
- Lambda functions
- Exception handling (try/except)
- Decorators
- Context managers (with statements)
- Generators and iterators
- Most standard library functions

## Security Checks Implemented

✅ **Import whitelist enforcement** - Only allows: `json`, `re`, `typing`

✅ **Blocked dangerous modules** - Prevents imports of: `os`, `sys`, `subprocess`, `socket`, `urllib`, `requests`, `http`, `ftplib`, `smtplib`, `pickle`, `shelve`, `dbm`

✅ **Timeout enforcement** - Configurable timeout (default 5000ms)

✅ **No eval/exec/compile** - Static analysis blocks these functions

✅ **Sandboxed execution** - No access to: `require`, `process`, `global`, `setTimeout`, `setInterval`

## Test Results

As of validation phase:
- **3/5 tests passing** (all security-critical tests)
- ✅ Simple Python code execution
- ✅ Timeout enforcement
- ✅ Dangerous import blocking
- ⚠️ Complex Python features (expected limitation)

## Production Requirements

For Phase 1 implementation, we MUST replace this prototype with one of:

### Option 1: Cloudflare Workers Python (Recommended)
- **Status:** Available in beta (uses Pyodide under the hood)
- **Pros:** Native Python runtime on edge, built-in sandboxing, full Python support
- **Cons:** Still in beta, may have package limitations
- **How:** Use pywrangler CLI and Cloudflare's Python Workers API
- **Documentation:** https://developers.cloudflare.com/workers/languages/python/

### Option 2: Pyodide (WebAssembly)
- **Status:** Mature and stable
- **Pros:** Real Python interpreter, good sandboxing, runs in Workers
- **Cons:** ~10MB bundle size, slower cold starts
- **How:** `npm install pyodide`, load in Worker, execute Python
- **Package:** https://www.npmjs.com/package/pyodide

### Option 3: External Service (Fallback)
- **Status:** Always available
- **Pros:** Full Python control, battle-tested sandboxes
- **Cons:** Adds latency (~100-500ms), additional infrastructure
- **Options:**
  - Modal.com (serverless Python)
  - AWS Lambda with py-lambda-local
  - Google Cloud Functions

## Research Findings

Based on investigation conducted 2025-11-12:

### Cloudflare Workers Python Support
- Python support is available via Pyodide (Python compiled to WebAssembly)
- Requires `pywrangler` CLI tool for development
- Supports popular packages: FastAPI, Langchain, httpx, Pydantic
- Foreign Function Interface (FFI) allows calling JavaScript from Python
- Full access to Cloudflare Runtime APIs (D1, KV, R2, etc.)
- Recent 2025 updates improved Terraform and SDK support for Python Workers

### Recommendation for Phase 1
1. **First choice:** Use Cloudflare Workers Python directly (investigate pywrangler integration)
2. **Fallback:** If pywrangler doesn't work in our setup, use Pyodide npm package
3. **Last resort:** External service for eval execution

## Next Steps for Phase 1

1. **Research:** Test pywrangler with our Cloudflare Workers setup
2. **Prototype:** Try Pyodide integration if pywrangler doesn't fit
3. **Implement:** Build production PythonRunner with chosen approach
4. **Test:** Ensure all security checks work with real Python
5. **Benchmark:** Measure cold start and execution performance
6. **Document:** Update this README with production implementation details

## Architecture Notes

The sandbox is designed to be a drop-in replacement. The `PythonRunner` interface will remain the same:

```typescript
interface PythonRunner {
  execute(code: string): Promise<ExecutionResult>;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
}
```

This allows us to swap the implementation without changing consuming code.

## Security Requirements (Must Be Maintained)

When implementing production sandbox:

1. **Import whitelist MUST be enforced** - No arbitrary imports
2. **Timeout MUST be enforced** - Max 5 seconds per execution
3. **Memory limit MUST be enforced** - Max 50MB per execution
4. **No network access** - Eval functions cannot make HTTP requests
5. **No file I/O** - Eval functions cannot read/write files
6. **No subprocess execution** - Eval functions cannot spawn processes
7. **Static analysis pre-execution** - Reject dangerous code before running

## Contact

For questions about production implementation approach, consult:
- Cloudflare Workers Python docs: https://developers.cloudflare.com/workers/languages/python/
- Pyodide documentation: https://pyodide.org/
- Design doc: `/docs/2025-11-05-iofold-auto-evals-design.md`
