# ART-E Benchmark

## Overview

The **ART-E (Agent Retrieval Task - Enron)** benchmark tests AI agents' ability to search and answer questions about email data. It uses the Enron email dataset combined with realistic question-answer pairs to evaluate agent performance on information retrieval and comprehension tasks.

**Dataset:** [`corbt/enron_emails_sample_questions`](https://huggingface.co/datasets/corbt/enron_emails_sample_questions)

The benchmark is designed to:
- Test agents' email search capabilities
- Evaluate temporal reasoning (questions reference specific dates)
- Measure answer accuracy through exact match and semantic similarity
- Generate traces that feed into iofold's eval generation pipeline

## Dataset Schema

The ART-E dataset contains **~55,000 question-answer pairs** derived from the Enron email corpus.

### Task Schema

Each benchmark task contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique task identifier |
| `question` | `string` | Question about the emails |
| `answer` | `string` | Ground truth answer |
| `message_ids` | `string[]` | Array of relevant email message IDs |
| `inbox_address` | `string` | Target inbox email address |
| `query_date` | `string` | Temporal cutoff date (ISO 8601) |
| `how_realistic` | `number` | Realism score (0.3-1.0) |
| `split` | `string` | Dataset split (`train` or `test`) |

### Example Task

```json
{
  "id": 12345,
  "question": "Who did John send the Q3 budget report to?",
  "answer": "sarah.smith@enron.com, mike.jones@enron.com",
  "message_ids": ["<abc123@enron.com>", "<def456@enron.com>"],
  "inbox_address": "john.arnold@enron.com",
  "query_date": "2001-09-15T00:00:00Z",
  "how_realistic": 0.85,
  "split": "test"
}
```

## CLI Usage

Run the benchmark using the CLI script located at `/scripts/run-art-e-benchmark.ts`.

### Basic Usage

```bash
# Run 10 test tasks against an agent
bun scripts/run-art-e-benchmark.ts --agent agent_test_1

# Run with custom limit
bun scripts/run-art-e-benchmark.ts --agent agent_test_1 --limit 100

# Run all tasks from train split
bun scripts/run-art-e-benchmark.ts --agent agent_test_1 --split train --limit 0
```

### All CLI Flags

| Flag | Shorthand | Description | Default |
|------|-----------|-------------|---------|
| `--agent` | `-a` | Agent ID to test (required) | - |
| `--split` | `-s` | Dataset split: `train` or `test` | `test` |
| `--limit` | `-l` | Max tasks to run (0 = all) | `10` |
| `--workspace` | `-w` | Workspace ID | `$WORKSPACE_ID` env |
| `--api-url` | - | API base URL | `$API_URL` or `http://localhost:8787` |
| `--model-provider` | - | Model provider: `anthropic`, `openai`, `google` | `anthropic` |
| `--model-id` | - | Model ID | `anthropic/claude-sonnet-4-5` |
| `--output` | `-o` | Save results to JSON file | - |
| `--use-json` | - | Use JSON API (limited to 100 rows, no parquetjs dependency) | `false` |
| `--stats` | - | Show dataset statistics and exit | `false` |
| `--help` | `-h` | Show help | - |

### Examples

#### Run 10 test tasks (default behavior)
```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1
```

#### Run 100 train tasks with custom model
```bash
bun scripts/run-art-e-benchmark.ts \
  -a agent_test_1 \
  -s train \
  -l 100 \
  --model-provider openai \
  --model-id openai/gpt-5.1
```

#### Run all test tasks and save results
```bash
bun scripts/run-art-e-benchmark.ts \
  -a agent_test_1 \
  -l 0 \
  -o results.json
```

#### Show dataset statistics
```bash
bun scripts/run-art-e-benchmark.ts --stats -s test
```

**Output:**
```
════════════════════════════════════════════════════════════
ART-E Dataset Statistics (test split)
════════════════════════════════════════════════════════════
Total tasks:              27,500
Unique inboxes:           150
Avg realistic score:      0.782
Avg message IDs per task: 2.4
════════════════════════════════════════════════════════════
```

#### Use JSON API (no parquetjs dependency)
```bash
# Limited to 100 rows from HuggingFace API
bun scripts/run-art-e-benchmark.ts -a agent_test_1 --use-json
```

### Environment Variables

The CLI respects these environment variables:

```bash
# Required for remote API access
export API_URL="https://api.iofold.com"
export WORKSPACE_ID="ws_prod_123"

# Then run benchmark
bun scripts/run-art-e-benchmark.ts -a agent_prod_1
```

## Scoring Methodology

The benchmark uses a dual-scoring system to evaluate agent responses:

### 1. Exact Match

**Definition:** The agent's answer exactly matches the ground truth (after normalization).

**Normalization:**
- Convert to lowercase
- Trim whitespace
- Collapse multiple spaces into single space

**Example:**
```typescript
groundTruth: "John Smith"
agentAnswer: "john smith"
exactMatch: true  // Case-insensitive match
```

### 2. Semantic Similarity (Jaccard)

**Definition:** Word overlap between agent answer and ground truth using Jaccard similarity.

**Formula:**
```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

Where:
- `A` = set of normalized words in ground truth
- `B` = set of normalized words in agent answer
- `∩` = intersection (common words)
- `∪` = union (all unique words)

**Normalization:**
- Convert to lowercase
- Remove punctuation
- Split into words
- Filter empty strings

**Example:**
```typescript
groundTruth: "The meeting is at 3 PM on Monday"
agentAnswer: "Meeting scheduled for Monday at 3 PM"

Words in ground truth: {the, meeting, is, at, 3, pm, on, monday}
Words in agent answer: {meeting, scheduled, for, monday, at, 3, pm}

Intersection: {meeting, at, 3, pm, monday} = 5 words
Union: {the, meeting, is, at, 3, pm, on, monday, scheduled, for} = 10 words

Semantic Score: 5/10 = 0.5
```

### Scoring Implementation

Located in `/src/benchmark/art-e-runner.ts`:

```typescript
function calculateSemanticSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));

  let intersectionCount = 0;
  words1.forEach(w => {
    if (words2.has(w)) intersectionCount++;
  });

  const unionCount = words1.size + words2.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}
```

### Result Metrics

The benchmark produces these aggregate metrics:

| Metric | Description |
|--------|-------------|
| `exactMatchAccuracy` | Percentage of tasks with exact matches (0-1) |
| `avgSemanticScore` | Average Jaccard similarity across all tasks (0-1) |
| `avgExecutionTimeMs` | Average task execution time in milliseconds |
| `completedTasks` | Number of successfully completed tasks |
| `failedTasks` | Number of tasks that errored |
| `totalTimeMs` | Total benchmark duration in milliseconds |

## Enron Database Setup

The benchmark requires the Enron email database to be set up in Cloudflare D1.

### Prerequisites

- Cloudflare account with D1 access
- Wrangler CLI installed: `pnpm add -g wrangler`

### Step 1: Create Database

```bash
# Create D1 database for benchmarks
npx wrangler d1 create iofold-benchmarks

# Note the database ID from the output
# Add to wrangler.toml:
[[d1_databases]]
binding = "BENCHMARKS_DB"
database_name = "iofold-benchmarks"
database_id = "<your-database-id>"
```

### Step 2: Run Database Schema

```bash
# For local development
npx wrangler d1 execute iofold-benchmarks \
  --local \
  --file=scripts/setup-enron-db.sql

# For production
npx wrangler d1 execute iofold-benchmarks \
  --file=scripts/setup-enron-db.sql
```

This creates:
- **`emails` table**: Stores ~500K Enron emails
- **`emails_fts` table**: FTS5 full-text search index (subject + body)
- **`art_e_tasks` table**: Optional storage for benchmark tasks
- **Indexes**: Optimized for inbox, date, sender queries
- **Triggers**: Keep FTS5 in sync with emails table

### Step 3: Import Enron Emails

```bash
# Import first 1000 emails to local database (for testing)
npx tsx scripts/import-enron.ts --local --limit 1000

# Import full dataset to remote database
npx tsx scripts/import-enron.ts -d <database-id> --batch-size 500

# Import from local CSV file
npx tsx scripts/import-enron.ts --local --csv-path ./enron-emails.csv
```

**Import Script Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--database-id`, `-d` | D1 Database ID (required for remote) | - |
| `--limit`, `-l` | Limit number of emails to import | unlimited |
| `--batch-size`, `-b` | Batch size for inserts | `100` |
| `--local` | Use local D1 database | `false` |
| `--csv-path`, `-c` | Path to CSV file | Download from HuggingFace |

### Step 4: Verify Setup

```bash
# Check email count
npx wrangler d1 execute iofold-benchmarks --local \
  --command "SELECT COUNT(*) FROM emails"

# Test full-text search
npx wrangler d1 execute iofold-benchmarks --local \
  --command "SELECT * FROM emails_fts WHERE emails_fts MATCH 'meeting' LIMIT 5"

# Check indexes
npx wrangler d1 execute iofold-benchmarks --local \
  --command "SELECT name FROM sqlite_master WHERE type='index'"
```

### Database Schema Details

#### emails Table

```sql
CREATE TABLE emails (
  message_id TEXT PRIMARY KEY,     -- RFC 2822 Message-ID
  inbox TEXT NOT NULL,             -- Email address of inbox owner
  subject TEXT,
  sender TEXT,
  recipients TEXT,                 -- JSON array of email addresses
  date TEXT,                       -- ISO 8601 timestamp
  body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Indexes

```sql
CREATE INDEX idx_emails_inbox ON emails(inbox);
CREATE INDEX idx_emails_date ON emails(date DESC);
CREATE INDEX idx_emails_sender ON emails(sender);
CREATE INDEX idx_emails_inbox_date ON emails(inbox, date DESC);
```

#### FTS5 Full-Text Search

```sql
CREATE VIRTUAL TABLE emails_fts USING fts5(
  subject,
  body,
  content=emails,
  content_rowid=rowid,
  tokenize = 'porter ascii'  -- Porter stemming + ASCII folding
);
```

## Integration with Eval Pipeline

The ART-E benchmark integrates with iofold's eval generation pipeline by producing **traces** that can be used for automated eval generation.

### Trace Generation Flow

```
┌─────────────────┐
│  ART-E Task     │
│  (Question)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent Execution│
│  (Playground    │
│   API)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Trace Created  │
│  - Session ID   │
│  - Messages     │
│  - Tool calls   │
│  - Response     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Task Result    │
│  - Exact match  │
│  - Semantic     │
│    similarity   │
│  - Trace ID     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Eval Generation│
│  - Analyze      │
│    successful/  │
│    failed       │
│    traces       │
│  - Generate     │
│    eval funcs   │
└─────────────────┘
```

### Using Benchmark Results for Eval Generation

#### 1. Run Benchmark and Save Results

```bash
bun scripts/run-art-e-benchmark.ts \
  -a agent_test_1 \
  -l 100 \
  -o benchmark-results.json
```

#### 2. Analyze Trace IDs

Each task result contains a `traceId`:

```json
{
  "taskId": 12345,
  "question": "Who did John email about the budget?",
  "groundTruth": "sarah.smith@enron.com",
  "agentAnswer": "Sarah Smith",
  "exactMatch": false,
  "semanticScore": 0.67,
  "traceId": "trace_abc123",
  "executionTimeMs": 4523
}
```

#### 3. Query Traces for Eval Generation

Use the trace IDs to fetch full execution traces from the database:

```typescript
// Fetch traces with low semantic scores for improvement
const failedTasks = results.taskResults.filter(
  r => r.semanticScore < 0.5 && r.traceId
);

for (const task of failedTasks) {
  const trace = await db
    .select()
    .from(traces)
    .where(eq(traces.trace_id, task.traceId))
    .get();

  // Feed into eval generation pipeline
  await generateEvalsFromTrace(trace, {
    expectedOutput: task.groundTruth,
    actualOutput: task.agentAnswer,
    semanticScore: task.semanticScore
  });
}
```

#### 4. Eval Generation Strategy

The benchmark results inform eval generation in several ways:

**High-performing tasks (semantic score > 0.8):**
- Extract successful patterns
- Generate positive test cases
- Create regression tests

**Medium-performing tasks (0.5 < semantic score < 0.8):**
- Identify partial successes
- Generate improvement opportunities
- Create edge case tests

**Low-performing tasks (semantic score < 0.5):**
- Identify failure modes
- Generate bug reproduction tests
- Create targeted improvement evals

### Example: Auto-Generated Eval from Benchmark

Given a failed benchmark task:

```json
{
  "question": "What was the subject of the email John sent to Sarah on 2001-09-15?",
  "groundTruth": "Q3 Budget Report",
  "agentAnswer": "Budget",
  "semanticScore": 0.33,
  "traceId": "trace_123"
}
```

The eval generator can create:

```typescript
// Auto-generated eval function
export async function evalEmailSubjectRetrieval(
  input: { question: string; inbox: string; date: string },
  output: string
): Promise<{ score: number; reason: string }> {
  // Extract key information from ground truth
  const expectedKeywords = ['q3', 'budget', 'report'];

  // Check if output contains all key terms
  const outputLower = output.toLowerCase();
  const matchedKeywords = expectedKeywords.filter(
    kw => outputLower.includes(kw)
  );

  if (matchedKeywords.length === expectedKeywords.length) {
    return {
      score: 1.0,
      reason: 'Output contains all key terms from email subject'
    };
  }

  return {
    score: matchedKeywords.length / expectedKeywords.length,
    reason: `Partial match: found ${matchedKeywords.length}/${expectedKeywords.length} key terms`
  };
}
```

## Advanced Usage

### Custom Scoring Functions

You can extend the scoring system with custom metrics:

```typescript
import { runArtEBenchmark } from './src/benchmark/art-e-runner';

// Add custom post-processing
const results = await runArtEBenchmark(tasks, config);

// Calculate custom metrics
const avgResponseLength = results.taskResults
  .reduce((sum, r) => sum + r.agentAnswer.length, 0)
  / results.taskResults.length;

const toolCallEfficiency = results.taskResults
  .filter(r => r.traceId)
  .map(async r => {
    const trace = await fetchTrace(r.traceId);
    return trace.toolCalls.length;
  });
```

### Parallel Execution

For faster benchmarking, run tasks in parallel with concurrency control:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(5); // 5 concurrent tasks

const taskPromises = tasks.map(task =>
  limit(() => runTask(task, config))
);

const taskResults = await Promise.all(taskPromises);
```

### Dataset Caching

The loader automatically caches downloaded datasets:

- **Cache location:** `/.tmp/art-e-cache/`
- **Formats:** `.parquet` (full dataset) or `.json` (first 100 rows)
- **Clear cache:** `rm -rf .tmp/art-e-cache/`

**Cache behavior:**
- First run: Downloads from HuggingFace
- Subsequent runs: Uses cached file
- Cache invalidation: Manual deletion required

## Troubleshooting

### Error: parquetjs not installed

**Solution:** Install the parquetjs dependency:

```bash
pnpm add -D parquetjs
```

Or use the JSON API (limited to 100 rows):

```bash
bun scripts/run-art-e-benchmark.ts -a agent_test_1 --use-json
```

### Error: Failed to download dataset

**Possible causes:**
- Network connectivity issues
- HuggingFace API rate limiting

**Solution:** Download manually and use `--csv-path`:

```bash
# Download dataset
wget https://huggingface.co/datasets/corbt/enron_emails_sample_questions/resolve/main/test.parquet

# Use local file
bun scripts/run-art-e-benchmark.ts \
  -a agent_test_1 \
  --csv-path ./test.parquet
```

### Error: High failure rate

**Symptoms:** `failedTasks / totalTasks > 0.5`

**Possible causes:**
- Agent not properly configured
- Enron database not set up
- API endpoint unreachable
- Rate limiting

**Debug steps:**

1. **Check agent exists:**
   ```bash
   curl http://localhost:8787/api/agents/agent_test_1 \
     -H "X-Workspace-Id: ws_test_1"
   ```

2. **Check database connection:**
   ```bash
   npx wrangler d1 execute iofold-benchmarks --local \
     --command "SELECT COUNT(*) FROM emails"
   ```

3. **Run single task manually:**
   ```bash
   bun scripts/run-art-e-benchmark.ts \
     -a agent_test_1 \
     --limit 1
   ```

4. **Check logs for errors:**
   - Review console output
   - Check Wrangler dev logs
   - Inspect saved results JSON

### Performance Issues

**Symptoms:** Slow benchmark execution (>60s per task)

**Solutions:**

1. **Reduce batch size:**
   ```bash
   bun scripts/run-art-e-benchmark.ts -a agent_test_1 -l 10
   ```

2. **Use faster model:**
   ```bash
   bun scripts/run-art-e-benchmark.ts \
     -a agent_test_1 \
     --model-provider anthropic \
     --model-id anthropic/claude-haiku-4
   ```

3. **Optimize database queries:**
   - Ensure FTS5 index is built
   - Check index usage with `EXPLAIN QUERY PLAN`
   - Add composite indexes for common query patterns

## References

### Source Files

- **Loader:** `/src/benchmark/art-e-loader.ts` - Dataset download and parsing
- **Runner:** `/src/benchmark/art-e-runner.ts` - Benchmark execution and scoring
- **Types:** `/src/benchmark/art-e-types.ts` - TypeScript type definitions
- **CLI Script:** `/scripts/run-art-e-benchmark.ts` - Command-line interface
- **Database Setup:** `/scripts/setup-enron-db.sql` - D1 database schema
- **Import Script:** `/scripts/import-enron.ts` - Email data import

### External Resources

- **Dataset:** [corbt/enron_emails_sample_questions](https://huggingface.co/datasets/corbt/enron_emails_sample_questions)
- **Original Corpus:** [CMU Enron Email Dataset](https://www.cs.cmu.edu/~enron/)
- **Kaggle Preprocessed:** [Enron Email Dataset](https://www.kaggle.com/datasets/wcukierski/enron-email-dataset)

### Related Documentation

- [iofold Auto-Evals Design](/docs/2025-11-05-iofold-auto-evals-design.md)
- [Eval Generation TODO](/docs/2025-11-05-iofold-evals-todo.md)
- [Success Criteria](/docs/success_criteria.md)
