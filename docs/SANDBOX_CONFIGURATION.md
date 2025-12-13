# Sandbox Configuration Guide

This document explains how to configure the Cloudflare Sandbox for secure Python eval execution.

## Overview

iofold uses the [Cloudflare Sandbox SDK](https://github.com/cloudflare/sandbox-sdk) to execute eval functions in isolated containers. This provides:

- **Security**: Isolated execution environment
- **Python 3.11**: Pre-installed with numpy, pandas, matplotlib
- **Timeout enforcement**: 5-second limit per execution
- **Resource limits**: Memory and CPU constraints

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                        │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────────┐ │
│  │ EvalsAPI    │────▶│ PythonRunner│────▶│ Sandbox (DO)  │ │
│  └─────────────┘     └─────────────┘     └───────┬───────┘ │
│                                                   │         │
└───────────────────────────────────────────────────┼─────────┘
                                                    │
                                          ┌─────────▼─────────┐
                                          │  Container Image  │
                                          │  - Python 3.11    │
                                          │  - Node.js 20     │
                                          │  - Bun runtime    │
                                          └───────────────────┘
```

## Configuration

### 1. Add Sandbox Binding to wrangler.toml

```toml
# Staging environment
[env.staging]
name = "iofold-staging"

# ... existing config ...

# Sandbox Durable Object binding
[[env.staging.durable_objects.bindings]]
name = "SANDBOX"
class_name = "Sandbox"

# Local development
[[durable_objects.bindings]]
name = "SANDBOX"
class_name = "Sandbox"
```

### 2. Export Sandbox Class from Worker

In `src/index.ts`, add the Sandbox export:

```typescript
// Re-export Sandbox Durable Object from SDK
export { Sandbox } from '@cloudflare/sandbox';
```

### 3. Define Durable Object Migration

Add to wrangler.toml:

```toml
[[migrations]]
tag = "v1"
new_classes = ["Sandbox"]
```

### 4. Create Dockerfile (Optional Custom Image)

If you need a custom container image with additional Python packages:

```dockerfile
FROM ghcr.io/cloudflare/sandbox:latest

# Install additional Python packages
RUN pip3 install --no-cache-dir \
    scikit-learn \
    nltk \
    textblob

# Your eval-specific packages here
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SANDBOX` | Durable Object namespace binding (production) | Required in production |
| `PYTHON_EXECUTOR_URL` | URL for dev Python executor service (local dev only) | `http://localhost:9999` |
| `PYTHON_POOL_MIN_SIZE` | Minimum Python process pool | 3 |
| `PYTHON_POOL_MAX_SIZE` | Maximum Python process pool | 15 |

**Note**: In local development, the `PYTHON_EXECUTOR_URL` is set to `http://python-sandbox:9999` when using Docker Compose (internal container network) or `http://localhost:9999` when running the executor service directly.

## Usage in Code

### PythonRunner Configuration

```typescript
import { PythonRunner } from './sandbox/python-runner';

const runner = new PythonRunner({
  sandboxBinding: env.SANDBOX,  // Durable Object namespace
  timeout: 5000,                // 5 second timeout
  sandboxId: 'eval-sandbox'     // Unique sandbox ID
});

const result = await runner.execute(pythonCode);
```

### Direct Sandbox Access

```typescript
import { getSandbox } from '@cloudflare/sandbox';

const sandbox = getSandbox(env.SANDBOX, 'my-sandbox', {
  keepAlive: false,  // Auto-cleanup after execution
  sleepAfter: '30m'  // Sleep after 30 min of inactivity
});

// Execute Python code
const result = await sandbox.exec('python3 -c "print(2+2)"');
console.log(result.stdout);  // "4"
```

## Security Model

### 4-Layer Security

1. **Static Analysis** (before execution)
   - Import whitelist validation
   - Blocked function detection
   - Syntax checking

2. **Container Isolation** (runtime)
   - Process isolation
   - Filesystem isolation
   - Network disabled

3. **Timeout Enforcement**
   - 5-second hard limit
   - Automatic process termination

4. **Resource Limits**
   - 50MB memory limit
   - CPU throttling

### Allowed vs Blocked

| Category | Allowed | Blocked |
|----------|---------|---------|
| Imports | `json`, `re`, `typing` | `os`, `sys`, `subprocess`, `socket` |
| Operations | String manipulation, regex, JSON | File I/O, network, process spawn |
| Functions | Standard Python builtins | `eval()`, `exec()`, `compile()` |

## Troubleshooting

### "Sandbox not available" Error

**Cause**: The `SANDBOX` binding is not configured in wrangler.toml

**Solution**:
1. Add the Durable Object binding to wrangler.toml
2. Export the `Sandbox` class from your worker
3. Deploy the worker

### "Sandbox execution not yet implemented"

**Cause**: The playground run endpoint has a TODO for sandbox integration

**Solution**: Check `src/api/evals.ts` line ~535 - the sandbox execution logic needs implementation

### Timeout Errors

**Cause**: Eval code took longer than 5 seconds

**Solution**:
- Optimize eval code for performance
- Reduce data processing
- Check for infinite loops

### Container Startup Timeout

**Cause**: Container takes too long to provision (cold start)

**Solution**:
- Increase `containerTimeouts.instanceGetTimeoutMS` (default: 30000)
- Increase `containerTimeouts.portReadyTimeoutMS` (default: 90000)
- Use `keepAlive: true` for frequently-used sandboxes

## Local Development

For local development without Cloudflare Sandbox:

### Option 1: Docker Compose (Recommended)

Run the full development stack including containerized Python executor:

```bash
docker compose -f docker-compose.dev.yml up
```

This starts:
- **python-sandbox** service on port 9999 (containerized Python executor)
- **backend** service on port 8787 (Cloudflare Worker)
- **frontend** service on port 3000 (Next.js)

**Docker Python Sandbox Features:**
- **Base Image**: `python:3.11-slim` with Bun runtime installed
- **Resource Limits**: 256MB RAM, 0.5 CPU cores
- **Security**:
  - `no-new-privileges:true` - prevents privilege escalation
  - Read-only mounted scripts
  - Isolated container network
- **Health Check**: Automatic health monitoring at `/health` endpoint
- **Auto-restart**: `unless-stopped` policy for resilience
- **Backend Connection**: Backend automatically connects via `PYTHON_EXECUTOR_URL=http://python-sandbox:9999`

The containerized setup provides production-like isolation while maintaining fast development iteration.

### Option 2: Local Python Executor Service

Run a standalone Python executor without Docker:

```bash
bun scripts/python-executor-service.ts
```

The PythonRunner will automatically fall back to `http://localhost:9999` when no sandbox binding is available.

### Option 3: Mock Sandbox

Use the mock sandbox for testing:

```typescript
import { MockSandbox } from './sandbox/__mocks__/sandbox-mock';

const runner = new PythonRunner({
  // No sandboxBinding - uses mock
  timeout: 5000
});
```

## Deployment Checklist

- [ ] Add `SANDBOX` Durable Object binding to wrangler.toml
- [ ] Add `export { Sandbox }` to src/index.ts
- [ ] Add migrations for new Durable Object class
- [ ] Deploy worker: `npx wrangler deploy --env staging`
- [ ] Test eval execution via playground

## Cost Considerations

Cloudflare Sandbox containers are billed based on:
- **Container time**: Per-second billing while container is running
- **Cold starts**: Initial container provisioning

Recommendations:
- Use `keepAlive: false` for short-lived eval executions
- Set appropriate `sleepAfter` for idle cleanup
- Monitor container usage in Cloudflare dashboard

## See Also

- [Eval Function Specification](./EVAL_FUNCTION_SPECIFICATION.md) - How to write eval functions
- [Cloudflare Sandbox SDK Docs](https://github.com/cloudflare/sandbox-sdk) - Official documentation
- [API Specification](./API_SPECIFICATION.md) - Eval execution endpoints
