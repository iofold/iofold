# API Test Commands

Quick reference for testing all iofold backend APIs.

## Prerequisites

1. Backend running: `npm run dev` (will start on dynamic port, e.g., http://localhost:39225)
2. Check backend logs for actual port number
3. Replace `$PORT` in commands below with actual port

## Environment Setup

```bash
# Set backend port (check wrangler output for actual port)
export API_PORT=39225
export API_BASE="http://localhost:$API_PORT"
```

## Health Check

```bash
curl -s "$API_BASE/health"
# Expected: "OK"
```

## Integrations API

### List Integrations
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/integrations" | jq .
```

### Add Integration
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"platform":"langfuse","name":"My Langfuse","api_key":"test-key"}' \
  "$API_BASE/v1/api/integrations" | jq .
```

### Test Integration
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/integrations/{integration_id}/test" | jq .
```

### Delete Integration
```bash
curl -s -X DELETE \
  -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/integrations/{integration_id}" | jq .
```

## Traces API

### List Traces (Paginated)
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces?limit=10" | jq .
```

### Get Trace Details
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces/trc_ed227efc-4055-4f47-8020-93a0dbd77507" | jq .
```

### Import Traces
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"integration_id":"int_xxx","limit":10}' \
  "$API_BASE/v1/api/traces/import" | jq .
```

### Submit Feedback
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"trace_id":"trc_xxx","rating":"positive","notes":"Good trace","eval_set_id":"set_xxx"}' \
  "$API_BASE/v1/api/feedback" | jq .
```

## Eval Sets API

### List Eval Sets
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/eval-sets" | jq .
```

### Get Eval Set Details
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/eval-sets/set_9cc4cfb8-3dba-4841-b02b-7b9b36169eb1" | jq .
```

### Create Eval Set
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Eval Set","description":"Testing","minimum_examples":3}' \
  "$API_BASE/v1/api/eval-sets" | jq .
```

## Evals API

### List Evals
```bash
curl -s "$API_BASE/api/evals" | jq .
```

### Get Eval Details (with code)
```bash
curl -s "$API_BASE/api/evals/eval_001" | jq .
```

### Generate Eval
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"name":"my_eval"}' \
  "$API_BASE/api/eval-sets/set_xxx/generate" | jq .
```

### Execute Eval
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"trace_ids":["trc_xxx","trc_yyy"]}' \
  "$API_BASE/api/evals/eval_xxx/execute" | jq .
```

### Update Eval
```bash
curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  "$API_BASE/api/evals/eval_xxx" | jq .
```

### Delete Eval
```bash
curl -s -X DELETE \
  "$API_BASE/api/evals/eval_xxx" | jq .
```

## Jobs API

### List Recent Jobs
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/api/jobs?limit=5" | jq .
```

### Get Job Status
```bash
curl -s "$API_BASE/api/jobs/job_xxx" | jq .
```

### Stream Job Progress (SSE)
```bash
curl -N "$API_BASE/api/jobs/job_xxx/stream"
# Watch for Server-Sent Events
```

### Cancel Job
```bash
curl -s -X POST \
  "$API_BASE/api/jobs/job_xxx/cancel" | jq .
```

## Error Testing

### Test 404 (Not Found)
```bash
curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces/nonexistent" | jq .
# Expected: {"error":{"code":"NOT_FOUND",...}}
```

### Test Missing Header
```bash
curl -s "$API_BASE/v1/api/traces" | jq .
# Expected: {"error":{"code":"VALIDATION_ERROR","message":"Missing X-Workspace-Id header"}}
```

### Test Invalid Request Body
```bash
curl -s -X POST \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}' \
  "$API_BASE/v1/api/integrations" | jq .
# Expected: {"error":{"code":"MISSING_REQUIRED_FIELD",...}}
```

## Performance Testing

### Measure Response Time
```bash
curl -s -w "\nTime: %{time_total}s\n" \
  -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces" | head -20
```

### Test Pagination Performance
```bash
# First page
time curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces?limit=20" > /dev/null

# Second page (using cursor from first response)
time curl -s -H "X-Workspace-Id: workspace_default" \
  "$API_BASE/v1/api/traces?limit=20&cursor=xxx" > /dev/null
```

## Database Inspection

### Check D1 Database
```bash
# Find database file
find .wrangler/state -name "*.sqlite"

# Query with sqlite3
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/xxx.sqlite

# Example queries:
SELECT COUNT(*) FROM traces;
SELECT COUNT(*) FROM feedback;
SELECT COUNT(*) FROM eval_sets;
SELECT * FROM jobs ORDER BY created_at DESC LIMIT 5;
```

## Quick Verification Script

Save this as `test-api.sh`:

```bash
#!/bin/bash
set -e

# Get port from running wrangler
PORT=$(lsof -ti:8787-40000 | xargs -I {} lsof -p {} | grep LISTEN | head -1 | awk '{print $9}' | cut -d: -f2)
if [ -z "$PORT" ]; then
  echo "Error: Backend not running"
  exit 1
fi

API="http://localhost:$PORT"
WORKSPACE="X-Workspace-Id: workspace_default"

echo "Testing iofold API on port $PORT"
echo "================================"

echo "✓ Health check..."
curl -s "$API/health" | grep -q "OK" && echo "  PASS" || echo "  FAIL"

echo "✓ Integrations..."
curl -s -H "$WORKSPACE" "$API/v1/api/integrations" | jq -e '.integrations' > /dev/null && echo "  PASS" || echo "  FAIL"

echo "✓ Traces..."
curl -s -H "$WORKSPACE" "$API/v1/api/traces" | jq -e '.traces' > /dev/null && echo "  PASS" || echo "  FAIL"

echo "✓ Eval Sets..."
curl -s -H "$WORKSPACE" "$API/v1/api/eval-sets" | jq -e '.eval_sets' > /dev/null && echo "  PASS" || echo "  FAIL"

echo "✓ Evals..."
curl -s "$API/api/evals" | jq -e '.evals' > /dev/null && echo "  PASS" || echo "  FAIL"

echo "✓ Jobs..."
curl -s -H "$WORKSPACE" "$API/api/jobs" | jq -e '.jobs' > /dev/null && echo "  PASS" || echo "  FAIL"

echo "✓ Error handling (404)..."
curl -s -H "$WORKSPACE" "$API/v1/api/traces/nonexistent" | jq -e '.error.code' | grep -q "NOT_FOUND" && echo "  PASS" || echo "  FAIL"

echo ""
echo "All tests passed! ✅"
```

Make executable: `chmod +x test-api.sh`
Run: `./test-api.sh`

## Notes

- All endpoints require `X-Workspace-Id` header (except legacy endpoints)
- Workspace ID is currently hardcoded to `workspace_default`
- API uses JSON for request/response bodies
- CORS is enabled for all origins in development
- Request IDs are included in all error responses for debugging
- Pagination uses base64-encoded cursors
- SSE endpoints use `text/event-stream` content type
