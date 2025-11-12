# Matrix API Integration Guide

## Quick Start

Add these routes to your main worker in `src/index.ts`:

```typescript
import {
  getComparisonMatrix,
  getEvalExecutionDetail,
  getTraceExecutions,
  getEvalExecutions
} from './api/matrix';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /api/eval-sets/:id/matrix
    if (url.pathname.match(/^\/api\/eval-sets\/[^/]+\/matrix$/) && request.method === 'GET') {
      const evalSetId = url.pathname.split('/')[3];
      return getComparisonMatrix(env.DB, evalSetId, url.searchParams);
    }

    // GET /api/eval-executions/:trace_id/:eval_id
    if (url.pathname.match(/^\/api\/eval-executions\/[^/]+\/[^/]+$/) && request.method === 'GET') {
      const parts = url.pathname.split('/');
      const traceId = parts[3];
      const evalId = parts[4];
      return getEvalExecutionDetail(env.DB, traceId, evalId);
    }

    // GET /api/traces/:trace_id/executions
    if (url.pathname.match(/^\/api\/traces\/[^/]+\/executions$/) && request.method === 'GET') {
      const traceId = url.pathname.split('/')[3];
      return getTraceExecutions(env.DB, traceId);
    }

    // GET /api/evals/:eval_id/executions
    if (url.pathname.match(/^\/api\/evals\/[^/]+\/executions$/) && request.method === 'GET') {
      const evalId = url.pathname.split('/')[3];
      return getEvalExecutions(env.DB, evalId, url.searchParams);
    }

    // ... existing routes
    return new Response('Not Found', { status: 404 });
  }
}
```

## Testing Locally

### 1. Apply Database Schema

```bash
# Apply schema to local D1 database
wrangler d1 execute DB --local --file=schema.sql
```

### 2. Seed Test Data

Create a test data script `scripts/seed-test-data.sql`:

```sql
-- Insert test workspace
INSERT INTO workspaces (id, user_id, name) VALUES
  ('ws_test', 'user_1', 'Test Workspace');

-- Insert test eval set
INSERT INTO eval_sets (id, workspace_id, name, description) VALUES
  ('set_1', 'ws_test', 'Response Quality', 'Test eval set');

-- Insert test integration
INSERT INTO integrations (id, workspace_id, platform, api_key_encrypted, status) VALUES
  ('int_1', 'ws_test', 'langfuse', 'encrypted_key', 'active');

-- Insert test traces
INSERT INTO traces (id, workspace_id, integration_id, external_id, trace_data) VALUES
  ('trace_1', 'ws_test', 'int_1', 'ext_1', '[]'),
  ('trace_2', 'ws_test', 'int_1', 'ext_2', '[]'),
  ('trace_3', 'ws_test', 'int_1', 'ext_3', '[]');

-- Insert feedback
INSERT INTO feedback (id, eval_set_id, trace_id, rating, rating_detail) VALUES
  ('fb_1', 'set_1', 'trace_1', 'positive', 'Good response'),
  ('fb_2', 'set_1', 'trace_2', 'negative', 'Poor response'),
  ('fb_3', 'set_1', 'trace_3', 'positive', 'Excellent');

-- Insert test eval
INSERT INTO evals (id, eval_set_id, name, code, model_used, version) VALUES
  ('eval_1', 'set_1', 'test_eval', 'def test_eval(trace):\n    return (True, "pass")', 'claude-sonnet-4.5', 1);

-- Insert executions
INSERT INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms) VALUES
  ('exec_1', 'eval_1', 'trace_1', 1, 'Looks good', 10),
  ('exec_2', 'eval_1', 'trace_2', 1, 'Acceptable', 12),  -- Contradiction!
  ('exec_3', 'eval_1', 'trace_3', 1, 'Great', 8);
```

Apply seed data:
```bash
wrangler d1 execute DB --local --file=scripts/seed-test-data.sql
```

### 3. Start Dev Server

```bash
wrangler dev
```

### 4. Test Endpoints

```bash
# Test matrix endpoint
curl "http://localhost:8787/api/eval-sets/set_1/matrix?eval_ids=eval_1"

# Test with filters
curl "http://localhost:8787/api/eval-sets/set_1/matrix?eval_ids=eval_1&filter=contradictions_only"

# Test execution detail
curl "http://localhost:8787/api/eval-executions/trace_1/eval_1"

# Test trace executions
curl "http://localhost:8787/api/traces/trace_1/executions"

# Test eval executions
curl "http://localhost:8787/api/evals/eval_1/executions"
```

## Frontend Integration Example

### React Hook for Matrix Data

```typescript
import { useState, useEffect } from 'react';

interface MatrixData {
  rows: MatrixRow[];
  stats: MatrixStats;
  next_cursor: string | null;
  has_more: boolean;
}

export function useEvalMatrix(evalSetId: string, evalIds: string[], filters?: {
  filter?: 'all' | 'contradictions_only' | 'errors_only';
  rating?: 'positive' | 'negative' | 'neutral';
}) {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatrix() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          eval_ids: evalIds.join(','),
          ...filters
        });

        const response = await fetch(
          `/api/eval-sets/${evalSetId}/matrix?${params}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchMatrix();
  }, [evalSetId, evalIds, filters]);

  return { data, loading, error };
}

// Usage in component
function MatrixView({ evalSetId }: { evalSetId: string }) {
  const { data, loading, error } = useEvalMatrix(
    evalSetId,
    ['eval_1', 'eval_2', 'eval_3'],
    { filter: 'contradictions_only' }
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      <h2>Eval Matrix ({data.rows.length} traces)</h2>
      <table>
        <thead>
          <tr>
            <th>Trace</th>
            <th>Human Rating</th>
            {Object.keys(data.stats.per_eval).map(evalId => (
              <th key={evalId}>{data.stats.per_eval[evalId].eval_name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row => (
            <tr key={row.trace_id}>
              <td>{row.trace_id}</td>
              <td>{row.human_feedback?.rating || 'No feedback'}</td>
              {Object.entries(row.predictions).map(([evalId, pred]) => (
                <td key={evalId} className={pred?.is_contradiction ? 'contradiction' : ''}>
                  {pred ? (pred.result ? '✅' : '❌') : '-'}
                  {pred?.is_contradiction && ' ⚠️'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Infinite Scroll with Pagination

```typescript
function InfiniteMatrix({ evalSetId, evalIds }: {
  evalSetId: string;
  evalIds: string[];
}) {
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        eval_ids: evalIds.join(','),
        limit: '50',
        ...(cursor ? { cursor } : {})
      });

      const response = await fetch(
        `/api/eval-sets/${evalSetId}/matrix?${params}`
      );
      const data = await response.json();

      setRows(prev => [...prev, ...data.rows]);
      setCursor(data.next_cursor);
      setHasMore(data.has_more);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore();
  }, []);

  return (
    <div>
      {rows.map(row => (
        <MatrixRow key={row.trace_id} row={row} />
      ))}
      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

## Common Issues & Solutions

### Issue: "eval_ids is required"

**Cause:** Missing or empty `eval_ids` query parameter

**Solution:** Always pass at least one eval ID:
```typescript
const params = new URLSearchParams({
  eval_ids: 'eval_1,eval_2'  // Comma-separated
});
```

### Issue: Empty matrix rows

**Cause:** No feedback exists for eval set, or eval hasn't been executed

**Solution:**
1. Verify feedback exists: `SELECT * FROM feedback WHERE eval_set_id = ?`
2. Verify executions exist: `SELECT * FROM eval_executions WHERE eval_id = ?`
3. Check that eval_ids match eval_set_id

### Issue: Contradictions not showing

**Cause:** Neutral ratings excluded from contradictions

**Solution:** This is expected behavior. Only positive/negative disagreements count as contradictions.

### Issue: Source always shows 'langfuse'

**Cause:** Source field is currently hardcoded (requires JOIN to integrations table)

**Solution:** Future enhancement. Track issue or implement JOIN in query.

### Issue: Stats don't match expectations

**Cause:** Stats are computed for current page only, not entire eval set

**Solution:** This matches API spec. To get total stats, fetch all pages or add separate stats endpoint.

## Performance Tuning

### Recommended Indexes (already in schema)

```sql
-- Critical for matrix performance
CREATE INDEX idx_feedback_eval_set_created_trace
  ON feedback(eval_set_id, created_at, trace_id);

CREATE INDEX idx_eval_executions_executed_trace
  ON eval_executions(eval_id, executed_at, trace_id);
```

### Query Optimization Tips

1. **Limit eval count:** Matrix performance scales with number of evals. Keep to 3-5 for best UX.

2. **Use pagination:** Always use cursor-based pagination for large datasets.

3. **Filter at database:** Use rating and date filters to reduce dataset before fetching.

4. **Cache matrix data:** Client-side cache for 30-60 seconds to reduce requests.

### Rate Limiting

Recommended limits per workspace:
- Matrix endpoint: 100 req/min
- Other endpoints: 1000 req/min

Implement in API gateway or middleware:

```typescript
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(workspaceId: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateLimiter.get(workspaceId);

  if (!bucket || now > bucket.resetAt) {
    rateLimiter.set(workspaceId, {
      count: 1,
      resetAt: now + 60000 // 1 minute
    });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count++;
  return true;
}
```

## Monitoring & Logging

### Key Metrics to Track

```typescript
// Add to each endpoint
const startTime = Date.now();

// ... endpoint logic ...

const duration = Date.now() - startTime;
console.log(JSON.stringify({
  endpoint: 'matrix',
  evalSetId,
  evalCount: evalIds.length,
  rowCount: rows.length,
  duration,
  hasContradictions: rows.some(r =>
    Object.values(r.predictions).some(p => p?.is_contradiction)
  )
}));
```

### Error Tracking

```typescript
try {
  // ... endpoint logic ...
} catch (error) {
  // Log with context
  console.error(JSON.stringify({
    error: error.message,
    stack: error.stack,
    endpoint: 'matrix',
    evalSetId,
    evalIds
  }));

  // Return user-friendly error
  return new Response(JSON.stringify({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      request_id: crypto.randomUUID()
    }
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## Deployment

### Production Checklist

- [ ] Schema applied to production D1 database
- [ ] Indexes created and analyzed
- [ ] Rate limiting implemented
- [ ] Error logging configured
- [ ] Performance monitoring enabled
- [ ] API documentation updated
- [ ] Frontend integrated and tested
- [ ] Load testing completed
- [ ] Backup strategy verified

### Wrangler Configuration

Update `wrangler.toml`:

```toml
[env.production]
name = "iofold-prod"
account_id = "your_account_id"

[[env.production.d1_databases]]
binding = "DB"
database_name = "iofold-prod-db"
database_id = "your_database_id"

[env.production.observability]
enabled = true
```

### Deploy

```bash
wrangler deploy --env production
```

## Support

For issues or questions:
1. Check `/src/api/MATRIX_API.md` for detailed technical docs
2. Review `/src/api/IMPLEMENTATION_SUMMARY.md` for architecture overview
3. Check tests in `/src/api/matrix.test.ts` for usage examples
