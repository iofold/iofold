# Server-Sent Events (SSE) Implementation

## Overview

This document describes the SSE implementation for real-time job progress updates in the iofold platform. The implementation replaces polling with Server-Sent Events for more efficient real-time updates.

## Architecture

### Backend (Cloudflare Workers)

#### SSE Stream Utility (`src/utils/sse.ts`)

The backend SSE infrastructure consists of:

1. **SSEStream Class**: Manages the Server-Sent Events stream lifecycle
   - Creates a ReadableStream for streaming events
   - Sends typed events (progress, completed, failed, heartbeat)
   - Manages keep-alive heartbeats (default: 30s)
   - Handles stream cleanup and closure

2. **Event Types**:
   - `progress`: Job status and progress updates
   - `completed`: Job completion with results
   - `failed`: Job failure with error details
   - `heartbeat`: Keep-alive to maintain connection

#### Jobs API Endpoint (`src/api/jobs.ts`)

**Endpoint**: `GET /api/jobs/:id/stream`

**Flow**:
1. Validates job exists
2. Creates SSE stream
3. Sends initial job status
4. If job is already complete/failed, sends final event and closes
5. Otherwise, polls for updates (1s interval) and streams changes
6. Automatically closes stream when job completes/fails

**Polling Internals**:
- Poll interval: 1 second
- Max polls: 300 (5 minutes timeout)
- Automatically stops polling when terminal state reached
- Sends progress updates on each poll

**Router Registration** (`src/index.ts` lines 99-103):
```typescript
if (url.pathname.match(/^\/api\/jobs\/[^\/]+\/stream$/) && request.method === 'GET') {
  const jobId = url.pathname.split('/')[3];
  return jobsAPI.streamJob(jobId);
}
```

### Frontend (Next.js)

#### SSE Client (`frontend/lib/sse-client.ts`)

A minimal wrapper around the browser's `EventSource` API:

**Features**:
- Typed event handlers for progress, completed, failed events
- Automatic connection error handling
- Connection state management
- Clean cleanup on close

**Usage**:
```typescript
const client = new SSEClient(eventSource, {
  onProgress: (update) => { /* handle progress */ },
  onCompleted: (result) => { /* handle completion */ },
  onFailed: (error) => { /* handle failure */ },
  onError: (error) => { /* handle connection error */ }
})

// Clean up when done
client.close()
```

#### API Client Integration (`frontend/lib/api-client.ts`)

The `APIClient` class provides a simple method to create SSE connections:

```typescript
streamJob(jobId: string): EventSource {
  const url = `${this.baseURL}/api/jobs/${jobId}/stream`
  return new EventSource(url)
}
```

**Note**: EventSource automatically handles:
- Authentication (if needed via URL params in future)
- Connection management
- Automatic reconnection on disconnect (browser default behavior)

#### Import Traces Modal Integration (`frontend/components/import-traces-modal.tsx`)

**Key Changes**:
1. Removed React Query polling (`useQuery` with `refetchInterval`)
2. Added SSE client state management with `useRef`
3. Connected to SSE stream on job creation
4. Real-time job state updates via SSE callbacks
5. Proper cleanup on modal close and component unmount

**State Management**:
```typescript
const [jobData, setJobData] = useState<Job | null>(null)
const [isStreaming, setIsStreaming] = useState(false)
const sseClientRef = useRef<SSEClient | null>(null)
```

**Connection Flow**:
1. User submits import request
2. API returns job_id
3. Initialize job state
4. Connect to SSE stream: `apiClient.streamJob(jobId)`
5. Wrap EventSource with SSEClient for typed events
6. Update local state on each event
7. Close connection on completion/failure
8. Cleanup on modal close or unmount

## Event Flow

```
User Action (Import)
       ↓
POST /api/traces/import
       ↓
Job Created (queued)
       ↓
SSE Connection: GET /api/jobs/:id/stream
       ↓
Initial Event: { status: 'queued', progress: 0 }
       ↓
Backend Polls Job (1s interval)
       ↓
Progress Events: { status: 'running', progress: 25 }
       ↓
Job Completion
       ↓
Final Event: { status: 'completed', result: {...} }
       ↓
SSE Stream Closed
```

## Error Handling

### Backend
- Job not found → 404 response before streaming starts
- Polling timeout (5 min) → Send failed event with timeout message
- Database errors → Send failed event with error details
- Stream cleanup on errors

### Frontend
- SSE connection errors → `onError` callback invoked
- Connection drops → EventSource auto-reconnects (browser default)
- Component unmount → Explicit cleanup via `useEffect`
- Modal close → Close SSE connection and reset state

## Performance Considerations

1. **Keep-Alive**: 30-second heartbeats prevent connection timeouts
2. **Poll Interval**: 1-second backend polling balances responsiveness and load
3. **Timeout**: 5-minute max prevents infinite streams
4. **Single Connection**: One SSE connection per job (not per component)
5. **Automatic Cleanup**: Streams close on terminal states (completed/failed)

## Fallback Strategy

The current implementation does NOT include automatic fallback to polling if SSE fails. This is intentional for the minimal implementation.

**Future Enhancement**: Add polling fallback in `onError` handler:
```typescript
onError: (error) => {
  console.error('SSE failed, falling back to polling')
  // Start React Query polling as backup
}
```

## Testing Verification

### Manual Testing Steps

1. **Start Backend**:
   ```bash
   npm run dev
   ```

2. **Start Frontend**:
   ```bash
   cd frontend && npm run dev
   ```

3. **Test SSE Connection**:
   - Open Import Traces modal
   - Select integration and submit import
   - Open browser DevTools → Network tab
   - Look for `stream` request with type `eventsource`
   - Should see real-time events in the EventStream tab
   - Progress bar should update smoothly without polling

4. **Verify Cleanup**:
   - Close modal while job is running
   - Check Network tab - connection should close
   - Reopen modal - old connection should not persist

### Type Safety Verification

```bash
cd frontend && npm run type-check
```

Should pass with no errors related to SSE implementation.

## Files Modified

### New Files
- `/home/ygupta/workspace/iofold/frontend/lib/sse-client.ts` - SSE client wrapper

### Modified Files
- `/home/ygupta/workspace/iofold/frontend/components/import-traces-modal.tsx` - SSE integration
- `/home/ygupta/workspace/iofold/frontend/lib/api-client.ts` - Already had `streamJob()` method

### Existing Infrastructure (No Changes Needed)
- `/home/ygupta/workspace/iofold/src/utils/sse.ts` - SSE backend utilities
- `/home/ygupta/workspace/iofold/src/api/jobs.ts` - SSE endpoint implementation
- `/home/ygupta/workspace/iofold/src/index.ts` - SSE route registration
- `/home/ygupta/workspace/iofold/src/types/api.ts` - SSE event types

## API Specification

### SSE Event Format

All events follow the Server-Sent Events specification:

```
event: <event_type>
data: <json_payload>

```

### Event Types

#### Progress Event
```typescript
event: progress
data: {
  "status": "running",
  "progress": 45
}
```

#### Completed Event
```typescript
event: completed
data: {
  "status": "completed",
  "result": {
    "imported_count": 100,
    "skipped_count": 5
  }
}
```

#### Failed Event
```typescript
event: failed
data: {
  "status": "failed",
  "error": "Connection timeout",
  "details": "Failed to connect to Langfuse API"
}
```

#### Heartbeat Event
```
: heartbeat

```

## Security Considerations

1. **CORS**: SSE endpoint respects CORS headers from main worker
2. **Authentication**: Currently uses workspace_id header (to be enhanced with proper auth)
3. **Rate Limiting**: No specific rate limiting on SSE endpoints (consider adding)
4. **Connection Limits**: Browser default is 6 connections per domain (adequate for typical usage)

## Future Enhancements

1. **Authentication**: Add bearer token support to EventSource URL
2. **Reconnection Strategy**: Custom exponential backoff on disconnect
3. **Fallback Polling**: Automatic fallback if SSE not supported
4. **Connection Pooling**: Reuse connections for multiple jobs
5. **Server Push**: Move from polling to true event-driven updates (requires DB triggers or job queue events)
6. **Compression**: Enable SSE compression for large payloads
7. **Metrics**: Track SSE connection health and duration

## Known Limitations

1. **Browser Support**: EventSource not supported in IE11 (not a concern for modern apps)
2. **Backend Polling**: Still polls internally (not true event-driven)
3. **No Backpressure**: Client cannot slow down server events
4. **Single Direction**: Server → Client only (no client → server over SSE)
5. **Text-Only**: SSE is text-based (JSON), not binary

## Troubleshooting

### SSE Connection Not Established
- Check Network tab for failed `stream` request
- Verify backend is running and job exists
- Check for CORS errors in console

### Progress Not Updating
- Verify SSE events in Network → EventStream tab
- Check browser console for JavaScript errors
- Ensure job is actually progressing (check backend logs)

### Connection Closes Immediately
- Job may already be completed
- Check for errors in backend logs
- Verify job_id is valid

### Memory Leaks
- Ensure `sseClientRef.current?.close()` is called
- Check `useEffect` cleanup functions run
- Verify EventSource is garbage collected after close
