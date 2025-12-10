# ART-E Benchmark Module

This module implements the **ART-E (Agentic Retrieval Task - Enron)** benchmark for testing email search agents. It uses the [corbt/enron_emails_sample_questions](https://huggingface.co/datasets/corbt/enron_emails_sample_questions) dataset from HuggingFace.

## Overview

The ART-E benchmark tests an agent's ability to:
1. Search through email archives using available tools
2. Find relevant information across multiple emails
3. Answer questions accurately based on email content

**Dataset**: 55,244 Q&A pairs (53.5K train, 1.7K test) about Enron emails with ground truth answers.

## Files

- **art-e-types.ts** - TypeScript interfaces for tasks, results, and configuration
- **art-e-loader.ts** - Dataset loader (downloads and caches from HuggingFace)
- **art-e-runner.ts** - Benchmark runner (executes tasks via playground API)
- **README.md** - This file

## Usage

### Quick Start

Run 10 test tasks against an agent:

```bash
bun scripts/run-art-e-benchmark.ts --agent agent_test_1
```

### Options

```bash
bun scripts/run-art-e-benchmark.ts [options]

Options:
  --agent, -a <id>       Agent ID to test (required)
  --split, -s <split>    Dataset split: train or test (default: test)
  --limit, -l <num>      Max tasks to run (default: 10, 0 = all)
  --workspace, -w <id>   Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>        API base URL (default: from API_URL env)
  --model-provider <p>   Model provider (default: anthropic)
  --model-id <id>        Model ID (default: anthropic/claude-sonnet-4-5)
  --output, -o <file>    Save results to JSON file
  --use-json             Use JSON API (no parquetjs needed, limited to 100 rows)
  --stats                Show dataset statistics and exit
  --help, -h             Show this help
```

### Examples

**Run 100 tasks from the training set:**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 -s train -l 100
```

**Run all test tasks and save results:**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 -l 0 -o results.json
```

**Test with different model:**
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 \
  --model-provider openai \
  --model-id openai/gpt-5.1
```

**Show dataset statistics:**
```bash
bun scripts/run-art-e-benchmark.ts --stats -s test
```

## Dependencies

The dataset loader uses **parquetjs** to parse the parquet files. Install it:

```bash
pnpm add -D parquetjs
```

**Alternative**: Use the `--use-json` flag to use the HuggingFace JSON API instead (no dependencies needed, but limited to 100 rows).

## Dataset Format

Each task in the dataset contains:

```typescript
{
  id: number;                // Unique task ID
  question: string;          // Question about emails
  answer: string;            // Ground truth answer
  message_ids: string[];     // Relevant email IDs
  inbox_address: string;     // Email inbox address
  query_date: string;        // Temporal cutoff date
  how_realistic: number;     // Realism score (0.3-1.0)
  split: string;             // "train" or "test"
}
```

## Results Format

The benchmark returns:

```typescript
{
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  exactMatchAccuracy: number;      // % of exact matches
  avgSemanticScore: number;        // Average similarity (0-1)
  avgExecutionTimeMs: number;
  totalTimeMs: number;
  taskResults: TaskResult[];       // Individual task results
  startedAt: string;
  completedAt: string;
}
```

Each task result includes:

```typescript
{
  taskId: number;
  question: string;
  groundTruth: string;
  agentAnswer: string;
  exactMatch: boolean;
  semanticScore: number;           // Jaccard similarity
  executionTimeMs: number;
  traceId?: string;                // For trace analysis
  error?: string;
}
```

## Scoring

The benchmark uses two scoring methods:

1. **Exact Match** - Normalized string comparison (case-insensitive, whitespace-normalized)
2. **Semantic Similarity** - Jaccard similarity based on word overlap (0-1)

For production use, consider upgrading to embedding-based similarity (e.g., cosine similarity with sentence embeddings).

## Caching

Downloaded datasets are cached in `.tmp/art-e-cache/`:
- `train.parquet` - Training set (53.5K tasks)
- `test.parquet` - Test set (1.7K tasks)

Delete the cache directory to force a re-download.

## Integration with iofold

The benchmark integrates with iofold's platform:

1. **Playground API** - Executes tasks via `/api/agents/:id/playground/chat`
2. **Tracing** - Each task generates a trace for analysis
3. **Eval Generation** - Traces can be used to generate evals
4. **Tool Registry** - Agents need email search tools to succeed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ART-E Benchmark Runner                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Load Dataset (HuggingFace)                                │
│     ├─ Download parquet files                                │
│     ├─ Parse with parquetjs                                  │
│     └─ Cache locally                                         │
│                                                               │
│  2. For Each Task:                                            │
│     ├─ Create playground session                             │
│     ├─ Send question to agent                                │
│     ├─ Stream agent's response                               │
│     └─ Score answer (exact + semantic)                       │
│                                                               │
│  3. Aggregate Results                                         │
│     ├─ Calculate accuracy metrics                            │
│     ├─ Collect trace IDs                                     │
│     └─ Save results (JSON)                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Success Criteria

A good email search agent should achieve:
- **Exact match accuracy**: >50% (questions often have multiple valid answers)
- **Semantic similarity**: >0.7 (agent understands the question)
- **Completion rate**: >95% (few failures)
- **Avg execution time**: <30s per task

## Future Improvements

1. **Parallel execution** - Run multiple tasks concurrently with rate limiting
2. **Better scoring** - Use embeddings for semantic similarity
3. **Difficulty filtering** - Test on high-realism tasks (how_realistic > 0.8)
4. **Tool analysis** - Track which tools the agent uses
5. **Error categorization** - Classify failure modes (timeout, wrong tool, etc.)

## Related Documentation

- [Tool Registry Design](../../docs/plans/2025-12-10-tool-registry-art-e-design.md)
- [Playground API](../api/playground.ts)
- [Agent Types](../types/agent.ts)
