# SSE Implementation Verification Guide

## Quick Verification Checklist

Use this checklist to verify the SSE implementation is working correctly.

### 1. Code Structure Verification

#### Backend Files
- [x] `/home/ygupta/workspace/iofold/src/utils/sse.ts` - SSE utilities exist
- [x] `/home/ygupta/workspace/iofold/src/api/jobs.ts` - `streamJob()` method implemented
- [x] `/home/ygupta/workspace/iofold/src/index.ts` - Route registered at line 99-103

#### Frontend Files
- [x] `/home/ygupta/workspace/iofold/frontend/lib/sse-client.ts` - SSE client wrapper created
- [x] `/home/ygupta/workspace/iofold/frontend/lib/api-client.ts` - `streamJob()` method exists
- [x] `/home/ygupta/workspace/iofold/frontend/components/import-traces-modal.tsx` - SSE integration complete

### 2. TypeScript Compilation

```bash
cd /home/ygupta/workspace/iofold/frontend
npm run type-check
```

**Expected Result**: No errors
**Status**: ✅ PASSED

### 3. Code Review Points

#### SSE Client (`frontend/lib/sse-client.ts`)
- [x] Wraps EventSource API
- [x] Typed event handlers (onProgress, onCompleted, onFailed, onError)
- [x] Proper cleanup in `close()` method
- [x] Connection state checking methods

#### Import Modal (`frontend/components/import-traces-modal.tsx`)
Key changes:
- [x] Removed polling `useQuery` with `refetchInterval`
- [x] Added `sseClientRef` for SSE connection management
- [x] `connectToJobStream()` function creates SSE connection
- [x] Real-time state updates via SSE callbacks
- [x] `useEffect` cleanup hooks close connections
- [x] Modal close handler closes SSE connection

### 4. Runtime Verification (Manual Testing)

#### Test 1: Basic SSE Connection

1. Start backend:
   ```bash
   cd /home/ygupta/workspace/iofold
   npm run dev
   ```

2. Start frontend:
   ```bash
   cd /home/ygupta/workspace/iofold/frontend
   npm run dev
   ```

3. Open browser to `http://localhost:3000`

4. Open DevTools → Network tab

5. Trigger import:
   - Open Import Traces modal
   - Select integration
   - Submit import

6. Check Network tab:
   - Look for request to `/api/jobs/{job_id}/stream`
   - Type should be `eventsource`
   - Status should be `200` or `(pending)` while streaming

7. Check EventStream tab:
   - Should see events like `progress`, `completed`, `failed`
   - Data should be valid JSON

**Expected Behavior**:
- SSE connection established immediately after job creation
- Progress events stream in real-time
- Modal updates without polling delay
- Connection closes on completion

#### Test 2: Progress Updates

1. Watch the progress bar in the modal
2. Should update smoothly (not in 2-second jumps like polling)
3. Status should change from `queued` → `running` → `completed`

**Expected Behavior**:
- Progress updates every ~1 second (backend poll interval)
- No visible "jump" in progress percentage
- Smooth status transitions

#### Test 3: Connection Cleanup

1. Start an import
2. While job is running, close the modal
3. Check Network tab - SSE connection should close
4. Reopen modal
5. No old connections should be present

**Expected Behavior**:
- Connection closes when modal closes
- No memory leaks
- No zombie connections

#### Test 4: Error Handling

1. Start backend with intentional error (e.g., invalid integration)
2. Trigger import
3. Should receive `failed` event via SSE
4. Error message should display in modal

**Expected Behavior**:
- Failed event received via SSE
- Error displayed to user
- Connection closes after failure

### 5. Browser DevTools Verification

#### Console Logs to Look For

**On SSE Connection**:
```
SSE connection established for job: job_xxxxx
```

**On SSE Error**:
```
SSE connection error: Event {type: "error", ...}
```

**On Stream Event**:
```
progress event: { status: 'running', progress: 50 }
```

#### Network Tab Inspection

**Request Details**:
- URL: `/v1/api/jobs/{job_id}/stream` or `/api/jobs/{job_id}/stream`
- Method: GET
- Type: eventsource
- Status: 200 (or pending)

**Headers**:
- Content-Type: text/event-stream
- Cache-Control: no-cache
- Connection: keep-alive

**EventStream Tab**:
Should show events in format:
```
event: progress
data: {"status":"running","progress":25}

event: completed
data: {"status":"completed","result":{...}}
```

### 6. Comparison: Before vs After

#### Before (Polling)
- React Query `refetchInterval: 2000`
- Job status updated every 2 seconds
- Visible "jumps" in progress bar
- Unnecessary requests when no changes

#### After (SSE)
- EventSource connection
- Real-time updates (1s granularity from backend polling)
- Smooth progress updates
- Only sends data when changes occur
- Connection persists until job completes

### 7. Performance Verification

#### Network Activity
**Before**: Polling request every 2 seconds
**After**: Single long-lived SSE connection + heartbeats every 30s

**Measurement**:
1. Open DevTools → Network
2. Filter by "jobs"
3. Count requests during a 60-second import job

**Expected**:
- Polling: ~30 requests
- SSE: 1 connection + ~2 heartbeats = minimal network overhead

#### Client CPU Usage
- SSE should have lower CPU usage (no repeated XHR setup/teardown)
- Can verify in DevTools → Performance tab

### 8. Edge Cases

#### Test Case: Job Already Completed
1. Create a job that completes instantly
2. Connect to SSE stream
3. Should receive `completed` event immediately
4. Stream should close within 100ms

#### Test Case: Job Not Found
1. Connect to SSE stream with invalid job_id
2. Should receive 404 response (not SSE stream)
3. Frontend should handle gracefully

#### Test Case: Long-Running Job
1. Create a job that takes 2+ minutes
2. Verify heartbeats keep connection alive
3. No timeout or disconnection

#### Test Case: Modal Remount
1. Open modal, start import
2. Close modal
3. Reopen modal (component remounts)
4. Old SSE connection should be cleaned up
5. No duplicate connections

## Troubleshooting

### Issue: No SSE Connection in Network Tab

**Check**:
1. Backend is running
2. Job ID is valid
3. CORS headers configured correctly
4. Browser supports EventSource (all modern browsers)

**Debug**:
```javascript
// In browser console
const es = new EventSource('http://localhost:8787/api/jobs/YOUR_JOB_ID/stream')
es.addEventListener('message', e => console.log(e))
es.addEventListener('error', e => console.error(e))
```

### Issue: Connection Closes Immediately

**Check**:
1. Job status - may already be completed
2. Backend logs for errors
3. Job ID is correct

**Debug**:
```bash
# Check job status directly
curl http://localhost:8787/api/jobs/YOUR_JOB_ID
```

### Issue: No Progress Updates

**Check**:
1. Backend is actually polling the job
2. Job status is changing in database
3. SSE events are being sent (check backend logs)

**Debug**:
Add logging to `pollJobUpdates()` in `src/api/jobs.ts`:
```typescript
console.log('[SSE] Sending progress:', job.status, job.progress)
```

### Issue: Memory Leak

**Check**:
1. `useEffect` cleanup functions run
2. `sseClientRef.current.close()` called
3. EventSource.readyState is CLOSED (2)

**Debug**:
```javascript
// In browser console
window.sseClientRef = sseClientRef.current
console.log(window.sseClientRef.getReadyState()) // Should be 2 (CLOSED)
```

## Verification Script

Run this script in the browser console to test SSE directly:

```javascript
// Test SSE connection directly
async function testSSE() {
  // 1. Create a test job (you'll need valid integration_id)
  const response = await fetch('http://localhost:8787/v1/api/traces/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': 'workspace_default'
    },
    body: JSON.stringify({
      integration_id: 'YOUR_INTEGRATION_ID',
      filters: { limit: 10 }
    })
  })

  const data = await response.json()
  const jobId = data.job_id
  console.log('Created job:', jobId)

  // 2. Connect to SSE stream
  const es = new EventSource(`http://localhost:8787/api/jobs/${jobId}/stream`)

  es.addEventListener('progress', (e) => {
    console.log('Progress:', JSON.parse(e.data))
  })

  es.addEventListener('completed', (e) => {
    console.log('Completed:', JSON.parse(e.data))
    es.close()
  })

  es.addEventListener('failed', (e) => {
    console.log('Failed:', JSON.parse(e.data))
    es.close()
  })

  es.addEventListener('error', (e) => {
    console.error('Error:', e)
  })

  // 3. Return connection for inspection
  return es
}

// Run the test
testSSE().then(es => {
  console.log('EventSource ready state:', es.readyState)
  // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
})
```

## Success Criteria

✅ All checks passed when:

1. TypeScript compilation succeeds
2. SSE connection established in Network tab
3. Real-time progress updates visible
4. Connections properly cleaned up
5. Error handling works correctly
6. No console errors
7. No memory leaks
8. Smoother UX than polling

## Sign-Off

- [ ] TypeScript types validate
- [ ] SSE connection established
- [ ] Real-time updates working
- [ ] Cleanup on modal close verified
- [ ] Error handling tested
- [ ] No console errors
- [ ] No memory leaks detected
- [ ] Performance improvement confirmed

**Verified by**: _______________
**Date**: _______________
