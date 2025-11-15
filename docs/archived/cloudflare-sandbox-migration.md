# Cloudflare Sandbox SDK Migration

## Overview

Successfully migrated Python code execution from a Node.js VM-based JavaScript shim (prototype) to Cloudflare's official Sandbox SDK, enabling secure, isolated Python execution in production.

## Changes Made

### 1. **Installed Cloudflare Sandbox SDK**
```bash
npm install @cloudflare/sandbox
```

### 2. **Rewrote PythonRunner (`src/sandbox/python-runner.ts`)**

**Before:** Used Node.js `vm` module with a Python-to-JavaScript transpiler (lines 148-209)
- Limited Python syntax support
- Not a real Python interpreter
- Only worked for simple cases

**After:** Uses Cloudflare Sandbox SDK with real Python execution
- Writes Python code to `/tmp/eval_script.py` in isolated container
- Executes with `python3` in sandboxed Linux environment
- Proper timeout handling and resource cleanup
- Returns stdout/stderr and exit codes

**Key improvements:**
- Real Python 3 interpreter instead of JS shim
- Isolated container environment (security)
- Automatic cleanup with `destroy()`
- Proper error handling for timeouts

### 3. **Updated Configuration (`wrangler.toml`)**

Added Sandbox service binding:

```toml
# Cloudflare Sandbox for Python code execution
[[env.production.services]]
binding = "Sandbox"
service = "cloudflare/sandbox"

[[env.development.services]]
binding = "Sandbox"
service = "cloudflare/sandbox"
```

### 4. **Updated EvalTester (`src/eval-generator/tester.ts`)**

Added configuration to pass sandbox binding:

```typescript
export interface EvalTesterConfig {
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  timeout?: number;
}

export class EvalTester {
  constructor(config: EvalTesterConfig = {}) {
    this.runner = new PythonRunner({
      sandboxBinding: config.sandboxBinding,
      timeout: config.timeout
    });
  }
}
```

### 5. **Created Mock Sandbox for Tests (`src/sandbox/__mocks__/sandbox-mock.ts`)**

For local development and testing:
- Uses Node.js `child_process.spawn` to execute real Python code
- Implements the same interface as Cloudflare Sandbox SDK
- Writes files to temporary directory
- Handles timeouts and cleanup

### 6. **Updated Test Files**

**`src/sandbox/python-runner.test.ts`:**
- Mocks `@cloudflare/sandbox` module
- Provides `mockSandboxBinding` to tests
- All 5 tests passing ✓

**`src/eval-generator/tester.test.ts`:**
- Updated to use mock sandbox binding
- Tests passing ✓

## Usage in Production

### Worker Setup

```typescript
import { EvalTester } from './eval-generator/tester';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Pass Sandbox binding from environment
    const tester = new EvalTester({
      sandboxBinding: env.Sandbox,
      timeout: 5000
    });

    const result = await tester.test(evalCode, testCases);

    return Response.json(result);
  }
};
```

### Environment Types

Add to your `worker-configuration.d.ts`:

```typescript
interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  // ... other bindings
}
```

## Security Features

The implementation maintains all original security validations:

1. **Static Code Analysis** (before execution):
   - Blocks dangerous imports: `os`, `sys`, `subprocess`, `socket`, etc.
   - Blocks `eval()`, `exec()`, `compile()`
   - Whitelists only: `json`, `re`, `typing`

2. **Sandbox Isolation**:
   - Runs in isolated Linux container
   - No network access
   - Limited filesystem access
   - Memory limits enforced by Cloudflare

3. **Timeout Protection**:
   - Configurable timeout (default 5s)
   - Automatic termination of long-running code

4. **Resource Cleanup**:
   - Calls `destroy()` in `finally` block
   - Prevents container leaks

## Testing

Run tests locally:

```bash
# All tests
npm test

# Python runner tests only
npm test src/sandbox/python-runner.test.ts
```

**Test Results:**
- ✅ Simple Python execution
- ✅ Timeout enforcement (infinite loop detection)
- ✅ Blocked imports (security validation)
- ✅ Whitelisted imports (json, re, typing)
- ✅ Eval function execution

## Local Development

The mock sandbox uses local Python 3:

```bash
# Verify Python 3 is installed
python3 --version
```

For actual Cloudflare Sandbox testing, you need:
- Cloudflare Workers Paid plan
- Docker Desktop (for local dev with Wrangler)

## Migration Path

### Phase 1: Testing (Current) ✅
- Mock sandbox for unit tests
- All tests passing

### Phase 2: Staging
- Deploy to Cloudflare with Sandbox binding
- Test with real sandbox containers
- Verify timeout and cleanup behavior

### Phase 3: Production
- Enable Sandbox SDK in production
- Monitor execution times and errors
- Track container usage/costs

## Cost Considerations

- Cloudflare Sandbox requires Workers Paid plan
- Container usage billed per execution time
- Automatic cleanup prevents idle charges
- 10-minute automatic timeout if `keepAlive: false` (default)

## Known Limitations

1. **Python Version**: Uses Python 3.x in Cloudflare containers (version may vary)
2. **Available Packages**: Only standard library by default (no pip packages)
3. **Execution Time**: Workers CPU time limits apply (50ms standard, 30s Unbound)
4. **Memory**: 128MB per isolate limit

## References

- [Cloudflare Sandbox SDK Documentation](https://developers.cloudflare.com/sandbox/)
- [Sandbox API Reference](https://developers.cloudflare.com/sandbox/api/)
- [Workers Platform Limits](https://developers.cloudflare.com/workers/platform/limits/)

## Next Steps

1. **Test with real Cloudflare Sandbox**:
   - Deploy to staging environment
   - Run integration tests
   - Verify behavior matches mock

2. **Monitor Performance**:
   - Track execution times
   - Monitor container creation/destruction
   - Alert on failures

3. **Optimize if Needed**:
   - Consider persistent containers for high-volume scenarios
   - Implement caching for repeated eval execution
   - Add retry logic for transient failures
