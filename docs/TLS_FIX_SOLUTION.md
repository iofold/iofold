# TLS Certificate Fix - Solution Implemented

## Problem

When running iofold backend in Docker, LLM API calls through Cloudflare AI Gateway failed with:

```
TLS peer's certificate is not trusted; reason = unable to get local issuer certificate
```

**Root Cause:** The workerd runtime (used by `wrangler dev`) has TLS certificate validation issues when running inside Docker containers. Even with ca-certificates installed in the container, workerd cannot validate certificates for outbound HTTPS requests to external APIs like the Cloudflare AI Gateway.

## Solution: Run Backend on Host

**Option Selected: #3 - Run wrangler dev on host instead of Docker**

This is the proper solution that:
- ✅ Maintains AI Gateway architecture (no bypass)
- ✅ Provides proper TLS certificate validation (host OS has valid CA certs)
- ✅ Requires no code changes or workarounds
- ✅ Works immediately without additional configuration
- ✅ Safe for all environments (dev, staging, production)

## Implementation

### 1. Reverted Direct API Bypass

**Removed from `/src/ai/gateway.ts`:**
- `ANTHROPIC_API_KEY` from `GatewayEnv` interface
- `ENVIRONMENT` check and bypass logic in `createGatewayClient()`
- Direct Anthropic API baseURL override

**Removed from `/src/playground/llm/streaming.ts`:**
- `ANTHROPIC_API_KEY` and `ENVIRONMENT` from `Env` interface
- Development bypass logic in `getChatModel()`
- Direct `ChatAnthropic` instantiation

**Removed from `.dev.vars.example`:**
- `ANTHROPIC_API_KEY` requirement

### 2. Updated Docker Compose

**Modified `/docker-compose.dev.yml`:**
- Removed `backend` service completely
- Kept `python-sandbox` and `frontend` services in Docker
- Removed backend-related volumes
- Added note about backend running on host

### 3. Updated Documentation

**Modified `/README.md`:**
- Replaced "Docker Development" section with "Hybrid Development Setup"
- Added clear instructions for running backend on host
- Documented why this setup is necessary
- Listed required environment variables

## Usage

### Start Development Environment

**Terminal 1: Start Docker services (Frontend + Python Sandbox)**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Terminal 2: Start Backend on Host**
```bash
export PYTHON_EXECUTOR_URL=http://localhost:9999
pnpm run dev
```

### Services

- Backend (host): `http://localhost:8787`
- Frontend (Docker): `http://localhost:3000`
- Python Sandbox (Docker): `http://localhost:9999`

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

1. **Host OS has proper CA certificates:** The host machine (Linux, macOS, Windows) has a properly configured certificate store that all applications trust by default

2. **No Docker networking issues:** Running on the host eliminates any Docker network bridge issues that might affect TLS handshakes

3. **workerd uses Node.js TLS on host:** When running on the host, workerd can leverage the Node.js TLS implementation which respects system certificates

4. **Simple and reliable:** No custom certificate installation, no environment variable hacks, no bypass code

## Alternatives Considered

### ❌ Option 1: Fix TLS certificates in Docker container
- **Tried:** Installing ca-certificates in Dockerfile
- **Result:** workerd does not use system CA store
- **Verdict:** Not feasible without workerd changes

### ❌ Option 2: Use Workers AI instead
- **Issue:** Limited model selection (only Cloudflare models)
- **Verdict:** Does not meet product requirements for Claude/GPT access

### ✅ Option 3: Run wrangler dev on host (SELECTED)
- **Pros:** Simple, reliable, no code changes, proper TLS
- **Cons:** Requires two terminals (minimal inconvenience)
- **Verdict:** Best solution

### ❌ Option 4: Use remote staging for LLM calls
- **Issue:** Slow development cycle, depends on staging availability
- **Verdict:** Not practical for local development

### ❌ Option 5: Direct API bypass (REJECTED)
- **Issue:** Circumvents AI Gateway, requires API keys for all providers
- **Security:** Adds bypass code paths that could be exploited
- **Verdict:** Not acceptable

## Files Modified

- `/src/ai/gateway.ts` - Reverted bypass code
- `/src/playground/llm/streaming.ts` - Reverted bypass code
- `/docker-compose.dev.yml` - Removed backend service
- `/README.md` - Added hybrid setup instructions
- `/.dev.vars.example` - Removed ANTHROPIC_API_KEY

## Production Impact

**None.** All changes are development-only:
- Backend still uses Cloudflare AI Gateway in all environments
- No bypass code exists in the codebase
- Staging and production are unaffected

## Future Considerations

If workerd adds proper CA certificate support for Docker, we can move the backend back into Docker. Track:
- https://github.com/cloudflare/workers-sdk/issues (TLS-related issues)
- https://github.com/cloudflare/workerd (runtime updates)

## References

### Research Sources

- [🐛 BUG: TLS certificate not trusted when running wrangler dev in Docker](https://github.com/cloudflare/workers-sdk/issues/8158) - GitHub Issue documenting the problem
- [wrangler dev TLS certificate configuration](https://www.answeroverflow.com/m/1145120390121791528) - Community discussions on NODE_EXTRA_CA_CERTS
- [Step-by-Step Guide to Fixing Node.js SSL Certificate Errors](https://dev.to/hardy_mervana/step-by-step-guide-to-fixing-nodejs-ssl-certificate-errors-2il2) - General Node.js TLS troubleshooting

### Key Findings

The Cloudflare workers-sdk issue #8158 was closed without a resolution after maintainers couldn't reproduce it in basic Docker setups. The community has confirmed that `NODE_EXTRA_CA_CERTS` should work with Node.js but doesn't affect workerd's TLS validation. Running wrangler on the host is the recommended workaround until workerd adds proper Docker certificate support.
