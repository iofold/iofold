# ART-E Dataset Loader

This module loads the **ART-E (Agentic Retrieval Task - Enron)** dataset for importing into the platform. It uses the [corbt/enron_emails_sample_questions](https://huggingface.co/datasets/corbt/enron_emails_sample_questions) dataset from HuggingFace.

## Overview

The ART-E dataset contains Q&A pairs about Enron emails that can be used as evaluation tasks.

**Dataset**: 55,244 Q&A pairs (53.5K train, 1.7K test) with ground truth answers.

## Files

- **art-e-types.ts** - TypeScript interface for `ArtETask`
- **art-e-loader.ts** - Dataset loader (downloads and caches from HuggingFace)
- **README.md** - This file

## Usage

### Import Tasks to Platform

Use the script to add ART-E tasks to an agent's taskset:

```bash
bun scripts/add-arte-tasks-to-agent.ts --agent <agent_id> [options]

Options:
  --agent, -a <id>     Agent ID (required)
  --count, -c <num>    Number of tasks to add (default: 50)
  --split <split>      Dataset split: train or test (default: test)
  --workspace <id>     Workspace ID
  --api-url <url>      API base URL
  --use-json           Use JSON API (limited to 100 rows, no parquetjs needed)
```

### Examples

```bash
# Add 50 test tasks to agent
bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant

# Add 100 train tasks
bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 100 --split train

# Use JSON API for quick testing
bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 20 --use-json
```

## Dataset Format

Each task in the dataset contains:

```typescript
interface ArtETask {
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

## Dependencies

The dataset loader uses **parquetjs** to parse parquet files:

```bash
pnpm add -D parquetjs
```

**Alternative**: Use the `--use-json` flag to use the HuggingFace JSON API instead (no dependencies needed, but limited to 100 rows).

## Caching

Downloaded datasets are cached in `.tmp/art-e-cache/`:
- `train.parquet` - Training set (53.5K tasks)
- `test.parquet` - Test set (1.7K tasks)
- `train.json` / `test.json` - JSON API cache (100 rows each)

Delete the cache directory to force a re-download.

## Workflow

After importing tasks:

1. **Run taskset** via platform's taskset job system
2. **Evaluate results** using platform's eval infrastructure
3. **Review feedback** in the UI
