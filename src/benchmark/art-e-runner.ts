/**
 * ART-E Benchmark Runner
 *
 * Runs the Enron email Q&A benchmark against an agent via the playground API.
 * Tests the agent's ability to search emails and answer questions.
 */

import type {
  ArtETask,
  BenchmarkConfig,
  BenchmarkResult,
  TaskResult,
} from './art-e-types';

/**
 * Calculate semantic similarity between two strings
 * Uses a simple word overlap metric (Jaccard similarity)
 * For production, consider using embeddings + cosine similarity
 */
function calculateSemanticSimilarity(str1: string, str2: string): number {
  // Normalize: lowercase, remove punctuation, split into words
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));

  // Calculate Jaccard similarity: |intersection| / |union|
  let intersectionCount = 0;
  words1.forEach(w => {
    if (words2.has(w)) intersectionCount++;
  });

  const unionCount = words1.size + words2.size - intersectionCount;

  if (unionCount === 0) return 0;
  return intersectionCount / unionCount;
}

/**
 * Check if two answers are semantically equivalent
 * Returns both exact match and semantic similarity score
 */
function scoreAnswer(
  groundTruth: string,
  agentAnswer: string,
  includeSemanticScoring: boolean = true
): { exactMatch: boolean; semanticScore: number } {
  // Normalize for exact match comparison
  const normalizeForExact = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, ' ');

  const exactMatch =
    normalizeForExact(groundTruth) === normalizeForExact(agentAnswer);

  const semanticScore = includeSemanticScoring
    ? calculateSemanticSimilarity(groundTruth, agentAnswer)
    : exactMatch ? 1.0 : 0.0;

  return { exactMatch, semanticScore };
}

/**
 * Run a single benchmark task against the agent
 */
async function runTask(
  task: ArtETask,
  config: BenchmarkConfig
): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    // Create a playground session for this task
    const sessionResponse = await fetch(
      `${config.apiBaseUrl}/api/agents/${config.agentId}/playground/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': config.workspaceId,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are an email assistant with access to the Enron email database. Today's date is ${task.query_date}. You can search emails across all inboxes to answer questions. Use the email_search tool without specifying an inbox_id to search all inboxes, or specify an inbox_id if you need to search a specific inbox.`,
            },
            {
              role: 'user',
              content: task.question,
            },
          ],
          modelProvider: config.modelProvider || 'anthropic',
          modelId: config.modelId || 'anthropic/claude-sonnet-4-5',
        }),
      }
    );

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Playground API error: ${sessionResponse.status} - ${errorText}`);
    }

    // Parse SSE stream to get the agent's answer
    let agentAnswer = '';
    let traceId: string | undefined;

    const reader = sessionResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') break;

        try {
          const event = JSON.parse(dataStr);

          if (event.type === 'text-delta' && event.text) {
            agentAnswer += event.text;
          } else if (event.type === 'session-info' && event.traceId) {
            traceId = event.traceId;
          }
        } catch (e) {
          // Ignore JSON parse errors for non-JSON events
        }
      }
    }

    const executionTimeMs = Date.now() - startTime;

    // Score the answer
    const { exactMatch, semanticScore } = scoreAnswer(
      task.answer,
      agentAnswer,
      config.includeSemanticScoring
    );

    return {
      taskId: task.id,
      question: task.question,
      groundTruth: task.answer,
      agentAnswer,
      exactMatch,
      semanticScore,
      executionTimeMs,
      traceId,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    return {
      taskId: task.id,
      question: task.question,
      groundTruth: task.answer,
      agentAnswer: '',
      exactMatch: false,
      semanticScore: 0,
      executionTimeMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run the ART-E benchmark against an agent
 *
 * @param tasks - Array of tasks to run
 * @param config - Benchmark configuration
 * @returns Aggregate benchmark results
 */
export async function runArtEBenchmark(
  tasks: ArtETask[],
  config: BenchmarkConfig
): Promise<BenchmarkResult> {
  console.log(`\nStarting ART-E benchmark for agent: ${config.agentId}`);
  console.log(`Tasks to run: ${tasks.length}`);
  console.log(`Split: ${config.split}`);
  console.log('─'.repeat(80));

  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  const taskResults: TaskResult[] = [];

  // Run tasks sequentially (could be parallelized with a concurrency limit)
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\nTask ${i + 1}/${tasks.length} (ID: ${task.id})`);
    console.log(`Question: ${task.question.slice(0, 80)}...`);

    const result = await runTask(task, config);

    if (result.error) {
      console.log(`  ✗ Error: ${result.error}`);
    } else {
      console.log(`  Answer: ${result.agentAnswer.slice(0, 80)}...`);
      console.log(`  Exact match: ${result.exactMatch ? '✓' : '✗'}`);
      console.log(`  Semantic score: ${result.semanticScore.toFixed(3)}`);
      console.log(`  Time: ${result.executionTimeMs}ms`);
    }

    taskResults.push(result);

    // Add a small delay between tasks to avoid rate limits
    if (i < tasks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalTimeMs = Date.now() - startTime;
  const completedAt = new Date().toISOString();

  // Calculate aggregate metrics
  const completedTasks = taskResults.filter(r => !r.error).length;
  const failedTasks = taskResults.filter(r => !!r.error).length;
  const exactMatches = taskResults.filter(r => r.exactMatch).length;
  const totalSemanticScore = taskResults.reduce((sum, r) => sum + r.semanticScore, 0);
  const totalExecutionTime = taskResults.reduce((sum, r) => sum + r.executionTimeMs, 0);

  const exactMatchAccuracy = completedTasks > 0 ? exactMatches / completedTasks : 0;
  const avgSemanticScore = completedTasks > 0 ? totalSemanticScore / completedTasks : 0;
  const avgExecutionTimeMs = completedTasks > 0 ? totalExecutionTime / completedTasks : 0;

  const result: BenchmarkResult = {
    agentId: config.agentId,
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    exactMatchAccuracy,
    avgSemanticScore,
    avgExecutionTimeMs,
    totalTimeMs,
    taskResults,
    startedAt,
    completedAt,
  };

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('═'.repeat(80));
  console.log(`Agent: ${config.agentId}`);
  console.log(`Total tasks: ${result.totalTasks}`);
  console.log(`Completed: ${result.completedTasks}`);
  console.log(`Failed: ${result.failedTasks}`);
  console.log(`Exact match accuracy: ${(result.exactMatchAccuracy * 100).toFixed(1)}%`);
  console.log(`Avg semantic score: ${result.avgSemanticScore.toFixed(3)}`);
  console.log(`Avg execution time: ${result.avgExecutionTimeMs.toFixed(0)}ms`);
  console.log(`Total time: ${(result.totalTimeMs / 1000).toFixed(1)}s`);
  console.log('═'.repeat(80) + '\n');

  return result;
}

/**
 * Run the benchmark with progress callbacks
 */
export async function runArtEBenchmarkWithProgress(
  tasks: ArtETask[],
  config: BenchmarkConfig,
  onProgress?: (completed: number, total: number, result: TaskResult) => void
): Promise<BenchmarkResult> {
  console.log(`\nStarting ART-E benchmark for agent: ${config.agentId}`);
  console.log(`Tasks to run: ${tasks.length}`);
  console.log(`Split: ${config.split}`);
  console.log('─'.repeat(80));

  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  const taskResults: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const result = await runTask(task, config);
    taskResults.push(result);

    if (onProgress) {
      onProgress(i + 1, tasks.length, result);
    }

    // Add a small delay between tasks
    if (i < tasks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalTimeMs = Date.now() - startTime;
  const completedAt = new Date().toISOString();

  // Calculate aggregate metrics
  const completedTasks = taskResults.filter(r => !r.error).length;
  const failedTasks = taskResults.filter(r => !!r.error).length;
  const exactMatches = taskResults.filter(r => r.exactMatch).length;
  const totalSemanticScore = taskResults.reduce((sum, r) => sum + r.semanticScore, 0);
  const totalExecutionTime = taskResults.reduce((sum, r) => sum + r.executionTimeMs, 0);

  const exactMatchAccuracy = completedTasks > 0 ? exactMatches / completedTasks : 0;
  const avgSemanticScore = completedTasks > 0 ? totalSemanticScore / completedTasks : 0;
  const avgExecutionTimeMs = completedTasks > 0 ? totalExecutionTime / completedTasks : 0;

  return {
    agentId: config.agentId,
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    exactMatchAccuracy,
    avgSemanticScore,
    avgExecutionTimeMs,
    totalTimeMs,
    taskResults,
    startedAt,
    completedAt,
  };
}
