# ART-E Benchmark Implementation

**Date:** 2025-12-10
**Status:** Complete
**Stream:** Tool Registry Design - Stream 5

## Overview

Implemented the ART-E (Agentic Retrieval Task - Enron) benchmark runner for testing email search agents against the HuggingFace Enron Q&A dataset (55,244 tasks).

## Files Created

### 1. `/src/benchmark/art-e-types.ts` (2.9 KB)

TypeScript interfaces for the benchmark module:

- **ArtETask** - Dataset task format (id, question, answer, message_ids, inbox_address, query_date, how_realistic, split)
- **TaskResult** - Individual task execution result (includes scoring, timing, traceId, errors)
- **BenchmarkResult** - Aggregate benchmark results (accuracy metrics, timing, all task results)
- **BenchmarkConfig** - Configuration options (agent, split, limits, API settings, model config)

### 2. `/src/benchmark/art-e-loader.ts` (6.4 KB)

Dataset loader with caching:

**Key Functions:**
- `loadArtEDataset(split, limit?, useJson?)` - Main loader function
- `getDatasetStats(split)` - Returns dataset statistics
- `downloadIfNeeded(split)` - Downloads parquet files from HuggingFace
- `parseParquet(filePath)` - Parses parquet using parquetjs library
- `downloadJsonDataset(split)` - Alternative JSON loader (limited to 100 rows)

**Features:**
- Downloads from HuggingFace: `corbt/enron_emails_sample_questions`
- Caches in `.tmp/art-e-cache/` directory
- Supports both parquet (full dataset) and JSON (limited, no deps)
- Graceful error handling for missing dependencies

### 3. `/src/benchmark/art-e-runner.ts` (9.9 KB)

Benchmark execution engine:

**Key Functions:**
- `runArtEBenchmark(tasks, config)` - Main runner with console output
- `runArtEBenchmarkWithProgress(tasks, config, onProgress)` - Runner with progress callbacks
- `runTask(task, config)` - Execute single task via playground API
- `scoreAnswer(groundTruth, agentAnswer)` - Scoring logic (exact + semantic)
- `calculateSemanticSimilarity(str1, str2)` - Jaccard similarity implementation

**Features:**
- Integrates with playground API via SSE streaming
- Parses agent responses from text-delta events
- Extracts trace IDs for later analysis
- Calculates exact match + semantic similarity scores
- Progress reporting and error handling
- Rate limiting (1s delay between tasks)

### 4. `/scripts/run-art-e-benchmark.ts` (9.2 KB)

CLI script for running benchmarks:

**Usage:**
```bash
bun scripts/run-art-e-benchmark.ts --agent <id> [options]
```

**Options:**
- `--agent, -a` - Agent ID (required)
- `--split, -s` - train/test (default: test)
- `--limit, -l` - Max tasks (default: 10, 0 = all)
- `--workspace, -w` - Workspace ID (from env)
- `--api-url` - API base URL (from env)
- `--model-provider` - anthropic/openai/google
- `--model-id` - Model identifier
- `--output, -o` - Save results to JSON
- `--use-json` - Use JSON API (no parquetjs)
- `--stats` - Show dataset stats and exit

**Features:**
- Environment variable support (API_URL, WORKSPACE_ID)
- Progress bars with colored output
- JSON result export
- Dataset statistics display
- Error handling with exit codes

### 5. `/src/benchmark/README.md` (7.3 KB)

Comprehensive documentation including:
- Quick start guide
- Usage examples
- Dataset format documentation
- Results format specification
- Scoring methodology
- Integration architecture diagram
- Success criteria (50% exact match, 0.7 semantic, 95% completion)
- Future improvements

### 6. `/src/benchmark/index.ts` (209 bytes)

Module exports for clean imports:
```typescript
export * from './art-e-types';
export * from './art-e-loader';
export * from './art-e-runner';
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ART-E Benchmark Flow                       │
└──────────────────────────────────────────────────────────────┘

1. Dataset Loading
   ├─ HuggingFace API/CDN (parquet or JSON)
   ├─ Local cache (.tmp/art-e-cache/)
   └─ Parse → ArtETask[]

2. Benchmark Execution
   ├─ For each task:
   │  ├─ Create playground session
   │  ├─ Send question via POST /api/agents/:id/playground/chat
   │  ├─ Stream SSE response (text-delta events)
   │  └─ Score answer (exact + Jaccard similarity)
   └─ Aggregate results

3. Results Output
   ├─ Console progress bars
   ├─ Summary statistics
   └─ Optional JSON export
```

## Scoring Methodology

### Exact Match
- Normalize: lowercase, trim, collapse whitespace
- Binary: true if strings match exactly

### Semantic Similarity
- Jaccard similarity: |intersection| / |union|
- Word-based overlap metric
- Range: 0.0 (no overlap) to 1.0 (identical)

**Future**: Upgrade to embedding-based similarity (sentence-transformers, cosine distance)

## Integration with iofold Platform

1. **Playground API** - Uses existing `/api/agents/:id/playground/chat` endpoint
2. **Tracing** - Each task generates a trace (captured via session-info event)
3. **Workspace Auth** - Requires X-Workspace-Id header
4. **Model Flexibility** - Supports all playground model providers
5. **Tool Registry** - Agents need email search tools (from Streams 1-4)

## Dependencies

**Required:**
- `parquetjs` (for full dataset) - Install via `pnpm add -D parquetjs`

**Alternative:**
- Use `--use-json` flag (no deps, limited to 100 rows)

## Usage Examples

**Quick test (10 tasks):**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1
```

**Full test set:**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 -l 0 -o results.json
```

**Training set with custom model:**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 \
  -s train -l 100 \
  --model-provider openai \
  --model-id openai/gpt-5.1
```

**Dataset stats:**
```bash
bun scripts/run-art-e-benchmark.ts --stats -s test
```

## Success Criteria

A good email search agent should achieve:
- ✅ **Exact match accuracy**: >50%
- ✅ **Semantic similarity**: >0.7
- ✅ **Completion rate**: >95%
- ✅ **Avg execution time**: <30s per task

## Next Steps

1. **Install dependency**: `pnpm add -D parquetjs`
2. **Test with agent**: Run benchmark against email search agent (once Streams 1-4 complete)
3. **Integrate traces**: Use generated traces for eval generation
4. **Optimize scoring**: Consider upgrading to embedding-based similarity
5. **Add parallelization**: Run multiple tasks concurrently with rate limiting

## Related Documentation

- [Tool Registry Design](../plans/2025-12-10-tool-registry-art-e-design.md)
- [Playground API](../../src/api/playground.ts)
- [Benchmark README](../../src/benchmark/README.md)
