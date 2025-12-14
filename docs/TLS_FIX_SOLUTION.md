# TLS Certificate Fix - Solutions

## Problem

When running iofold backend in Docker, LLM API calls through Cloudflare AI Gateway failed with:

```
TLS peer's certificate is not trusted; reason = unable to get local issuer certificate
```

**Root Cause:** The workerd runtime (used by `wrangler dev`) has TLS certificate validation issues when running inside Docker containers. The default Node.js slim images don't have CA certificates configured in a way that workerd can use them.

## Solution: Full Docker Setup with Custom Dockerfile

**Status:** ✅ Working as of 2025-12-14

A custom Dockerfile with proper CA certificate configuration allows running the backend fully in Docker.

**How it works:**
- Custom `docker/Dockerfile.backend` with `ca-certificates` package
- SSL environment variables pointing to system certificates
- `docker-compose.yml` uses this custom build

**Benefits:**
- Single `docker compose up` command starts everything
- Consistent containerized environment
- No need for multiple terminals
- Matches production environment more closely

## Implementation

### 1. Custom Dockerfile

**Created `/docker/Dockerfile.backend`:**
```dockerfile
FROM node:22-slim

# Install CA certificates and required build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set up pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set environment variables
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/usr/local/bin:/usr/bin:/bin
ENV NODE_ENV=development
# Make Node.js/workerd use system certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_DIR=/etc/ssl/certs

WORKDIR /app
EXPOSE 8787
```

### 2. Docker Compose Configuration

**Updated `/docker-compose.yml`:**
```yaml
backend:
  build:
    context: .
    dockerfile: docker/Dockerfile.backend
  environment:
    - NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
    - SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
    - SSL_CERT_DIR=/etc/ssl/certs
```

### 3. Usage

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f backend
```

### Services

- Backend: `http://localhost:8787`
- Frontend: `http://localhost:3000`
- Python Sandbox: `http://localhost:9999`

## Verification

### Test 1: Health Check
```bash
curl http://localhost:8787/v1/api/health
```

**Expected:** `{"status": "healthy", ...}`

### Test 2: LLM Call through AI Gateway
```bash
curl -X POST http://localhost:8787/v1/api/agents/agent_test_art_e/playground/chat \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is 2+2?"}]}'
```

**Expected:** Streaming SSE response from Claude through AI Gateway

**Result:** ✅ Successfully tested on 2025-12-14

```
data: {"type":"message-start","messageId":"msg_1765680856551"}
data: {"type":"text-delta","text":"Two"}
data: {"type":"text-delta","text":" plus two equals four."}
data: {"type":"finish","messageId":"msg_1765680856551"}
data: [DONE]
```

## Why This Works

1. **Proper CA certificates in container:** The custom Dockerfile installs `ca-certificates` and runs `update-ca-certificates` to populate the system certificate store

2. **SSL environment variables:** Setting `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, and `SSL_CERT_DIR` ensures both Node.js and workerd can find the certificates

3. **Consistent environment:** All services run in Docker, matching production deployment patterns

4. **Simple usage:** Single `docker compose up` command starts everything

## Alternatives Considered

### ❌ Use Workers AI instead
- **Issue:** Limited model selection (only Cloudflare models)
- **Verdict:** Does not meet product requirements for Claude/GPT access

### ❌ Use remote staging for LLM calls
- **Issue:** Slow development cycle, depends on staging availability
- **Verdict:** Not practical for local development

### ❌ Direct API bypass
- **Issue:** Circumvents AI Gateway, requires API keys for all providers
- **Security:** Adds bypass code paths that could be exploited
- **Verdict:** Not acceptable

## Files Modified

- `/docker/Dockerfile.backend` - Custom Dockerfile with CA certificates
- `/docker-compose.yml` - Updated to use custom build with SSL environment variables

## Production Impact

**None.** All changes are development-only:
- Backend still uses Cloudflare AI Gateway in all environments
- No bypass code exists in the codebase
- Staging and production are unaffected

## References

- [🐛 BUG: TLS certificate not trusted when running wrangler dev in Docker](https://github.com/cloudflare/workers-sdk/issues/8158) - GitHub Issue documenting the original problem
- [Step-by-Step Guide to Fixing Node.js SSL Certificate Errors](https://dev.to/hardy_mervana/step-by-step-guide-to-fixing-nodejs-ssl-certificate-errors-2il2) - General Node.js TLS troubleshooting

### Solution Summary

The key insight is that workerd needs **both** the CA certificates installed **and** the SSL environment variables set. Simply installing `ca-certificates` is not enough - you must also set `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt` and related environment variables.
