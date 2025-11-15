# SSE Implementation - Quick Reference

## Files

### Created
- `frontend/lib/sse-client.ts` - SSE client wrapper
- `docs/sse-implementation.md` - Technical documentation
- `docs/sse-verification.md` - Testing guide
- `docs/sse-summary.md` - Implementation summary
- `docs/sse-quick-reference.md` - This file

### Modified
- `frontend/components/import-traces-modal.tsx` - SSE integration

### Existing (No Changes)
- `src/utils/sse.ts` - Backend SSE utilities
- `src/api/jobs.ts` - SSE endpoint (`GET /api/jobs/:id/stream`)
- `src/index.ts` - Route registration (lines 99-103)
- `frontend/lib/api-client.ts` - `streamJob()` method

## API Endpoint

**URL**: `GET /api/jobs/:id/stream`

**Response**: `text/event-stream`

**Events**:
```
event: progress
data: {"status":"running","progress":25}

event: completed
data: {"status":"completed","result":{...}}

event: failed
data: {"status":"failed","error":"...","details":"..."}

: heartbeat
```

## Frontend Usage

### Import
```typescript
import { SSEClient } from '@/lib/sse-client'
import { apiClient } from '@/lib/api-client'
```

### Create Connection
```typescript
const eventSource = apiClient.streamJob(jobId)
const client = new SSEClient(eventSource, {
  onProgress: (update) => {
    // Handle progress: { status, progress }
  },
  onCompleted: (result) => {
    // Handle completion
  },
  onFailed: (error, details) => {
    // Handle failure
  },
  onError: (error) => {
    // Handle connection error
  }
})
```

### Cleanup
```typescript
// Close connection
client.close()

// In useEffect
useEffect(() => {
  return () => {
    if (sseClientRef.current) {
      sseClientRef.current.close()
    }
  }
}, [])
```

## Testing

### Type Check
```bash
cd frontend && npm run type-check
```

### Run Dev Server
```bash
# Backend
npm run dev

# Frontend (in separate terminal)
cd frontend && npm run dev
```

### Manual Test
1. Open Import Traces modal
2. Submit import
3. Open DevTools → Network
4. Look for `/api/jobs/{id}/stream` with type `eventsource`
5. Check EventStream tab for events
6. Verify smooth progress updates

### Debug in Browser Console
```javascript
// Test SSE directly
const es = new EventSource('http://localhost:8787/api/jobs/YOUR_JOB_ID/stream')
es.addEventListener('progress', e => console.log('Progress:', JSON.parse(e.data)))
es.addEventListener('completed', e => console.log('Completed:', JSON.parse(e.data)))
es.addEventListener('failed', e => console.log('Failed:', JSON.parse(e.data)))
es.addEventListener('error', e => console.error('Error:', e))
```

## Key Implementation Points

### Backend (Already Existed)
- Endpoint polls job status every 1s
- Sends SSE events on changes
- Auto-closes on completion (100ms delay)
- 5-minute timeout (300 polls)
- Heartbeat every 30s

### Frontend (Newly Implemented)
- Removed React Query polling
- Added `SSEClient` wrapper
- Real-time state updates
- Proper cleanup in 3 places:
  1. On completion (SSE client auto-closes)
  2. On modal close (explicit close)
  3. On unmount (useEffect cleanup)

## Troubleshooting

### No SSE Connection
- Check backend is running
- Verify job_id is valid
- Check CORS headers
- Inspect Network tab for errors

### No Progress Updates
- Check backend logs
- Verify job is actually progressing
- Look for SSE events in EventStream tab
- Check for JavaScript errors in console

### Connection Closes Immediately
- Job may already be completed
- Check job status: `GET /api/jobs/{id}`
- Look for errors in backend logs

### Memory Leak
- Verify cleanup in useEffect
- Check EventSource.readyState is 2 (CLOSED)
- Use React DevTools to check component unmounts

## Performance

**Before (Polling)**:
- 30+ requests per minute
- 2-second update delay
- Visible progress "jumps"

**After (SSE)**:
- 1 connection + heartbeats
- ~1-second update delay
- Smooth progress updates

## Type Definitions

```typescript
// SSE Client Options
interface SSEClientOptions {
  onProgress?: (update: SSEJobUpdate) => void
  onCompleted?: (result: any) => void
  onFailed?: (error: string, details?: string) => void
  onError?: (error: Event) => void
  onOpen?: () => void
}

// Job Update
interface SSEJobUpdate {
  status: Job['status']
  progress?: number
  result?: any
  error?: string
  details?: string
}

// Job Status
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
```

## Next Steps (Not Implemented)

- [ ] Automatic reconnection with backoff
- [ ] Fallback to polling on SSE failure
- [ ] True event-driven backend (no polling)
- [ ] Connection pooling
- [ ] Authentication in SSE URL

## Documentation

- **Full Docs**: `docs/sse-implementation.md`
- **Testing**: `docs/sse-verification.md`
- **Summary**: `docs/sse-summary.md`
- **Quick Ref**: `docs/sse-quick-reference.md` (this file)

## Status

✅ **Implementation Complete**
✅ **Type-Safe**
✅ **Documented**
✅ **Ready for Testing**
