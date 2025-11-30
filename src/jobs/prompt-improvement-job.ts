/**
 * PromptImprovementJob - Background job for improving agent prompts based on failure analysis
 *
 * Flow:
 * 1. Fetch contradictions from D1 (human rated != eval predicted)
 * 2. Analyze failure patterns using Claude (Step 1)
 * 3. Fetch best practices from prompt_best_practices table
 * 4. Generate improved prompt using Claude (Step 2)
 * 5. Create new agent_version with status='candidate', source='ai_improved'
 * 6. Return result for user review
 */

import type { D1Database } from '@cloudflare/workers-types';
import Anthropic from '@anthropic-ai/sdk';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import type { PromptImprovementJobResult } from '../types/agent';

export interface PromptImprovementJobConfig {
  jobId: string;
  agentId: string;
  workspaceId: string;
  maxContradictions?: number; // default: 20
}

export interface PromptImprovementJobDeps {
  db: D1Database;
  anthropicApiKey: string;
}

interface Contradiction {
  trace_id: string;
  human_rating: string;
  predicted_result: boolean;
  predicted_reason: string;
  trace_data: any;
}

interface BestPractice {
  title: string;
  content: string;
  category: string;
}

interface FailureAnalysisResult {
  failure_patterns: string[];
  summary: string;
}

interface PromptImprovementResult {
  improved_prompt: string;
  changes: string[];
  reasoning: string;
}

export class PromptImprovementJob {
  private jobManager: JobManager;
  private anthropicClient: Anthropic;
  private stream?: SSEStream;

  constructor(
    private config: PromptImprovementJobConfig,
    private deps: PromptImprovementJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.anthropicClient = new Anthropic({
      apiKey: deps.anthropicApiKey
    });
  }

  async execute(stream?: SSEStream): Promise<PromptImprovementJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('fetching_agent', 0);

      // Step 1: Fetch agent and active version
      const agent = await this.fetchAgent();
      if (!agent.active_version_id) {
        throw new Error('Agent has no active version to improve');
      }

      const activeVersion = await this.fetchAgentVersion(agent.active_version_id);
      this.emitProgress('fetching_contradictions', 10);

      // Step 2: Fetch contradictions
      const contradictions = await this.fetchContradictions(
        agent.id,
        this.config.maxContradictions || 20
      );

      if (contradictions.length === 0) {
        // No contradictions - skip improvement
        await this.jobManager.completeJob(this.config.jobId, {
          new_version_id: null,
          new_version_number: null,
          changes_summary: 'No contradictions found - improvement not needed',
          failure_patterns: [],
          best_practices_applied: []
        });
        this.emitProgress('completed', 100, { status: 'No contradictions found' });

        return {
          new_version_id: '',
          new_version_number: 0,
          changes_summary: 'No contradictions found - improvement not needed',
          failure_patterns: [],
          best_practices_applied: []
        };
      }

      this.emitProgress('analyzing_failures', 30, {
        contradictions_found: contradictions.length
      });

      // Step 3: Analyze failure patterns with Claude
      const failureAnalysis = await this.analyzeFailurePatterns(contradictions);
      this.emitProgress('fetching_best_practices', 50);

      // Step 4: Fetch best practices
      const bestPractices = await this.fetchBestPractices();
      this.emitProgress('generating_improved_prompt', 60);

      // Step 5: Generate improved prompt with Claude
      const improvement = await this.generateImprovedPrompt(
        activeVersion.prompt_template,
        activeVersion.variables,
        failureAnalysis,
        bestPractices
      );

      this.emitProgress('creating_new_version', 80);

      // Step 6: Create new agent version
      const newVersionNumber = await this.getNextVersionNumber(agent.id);
      const newVersionId = `agv_${crypto.randomUUID()}`;

      await this.deps.db
        .prepare(
          `INSERT INTO agent_versions (
            id, agent_id, version, prompt_template, variables,
            source, parent_version_id, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newVersionId,
          agent.id,
          newVersionNumber,
          improvement.improved_prompt,
          JSON.stringify(activeVersion.variables),
          'ai_improved',
          agent.active_version_id,
          'candidate',
          new Date().toISOString()
        )
        .run();

      this.emitProgress('finalizing', 90);

      const result: PromptImprovementJobResult = {
        new_version_id: newVersionId,
        new_version_number: newVersionNumber,
        changes_summary: improvement.reasoning,
        failure_patterns: failureAnalysis.failure_patterns,
        best_practices_applied: improvement.changes
      };

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100, result);

      return result;
    } catch (error: any) {
      console.error('Prompt improvement job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  private async fetchAgent(): Promise<{
    id: string;
    active_version_id: string | null;
  }> {
    const result = await this.deps.db
      .prepare(
        `SELECT id, active_version_id
         FROM agents
         WHERE id = ? AND workspace_id = ?`
      )
      .bind(this.config.agentId, this.config.workspaceId)
      .first();

    if (!result) {
      throw new Error(`Agent ${this.config.agentId} not found`);
    }

    return {
      id: result.id as string,
      active_version_id: result.active_version_id as string | null
    };
  }

  private async fetchAgentVersion(versionId: string): Promise<{
    prompt_template: string;
    variables: string[];
  }> {
    const result = await this.deps.db
      .prepare(
        `SELECT prompt_template, variables
         FROM agent_versions
         WHERE id = ?`
      )
      .bind(versionId)
      .first();

    if (!result) {
      throw new Error(`Agent version ${versionId} not found`);
    }

    return {
      prompt_template: result.prompt_template as string,
      variables: result.variables ? JSON.parse(result.variables as string) : []
    };
  }

  private async fetchContradictions(
    agentId: string,
    limit: number
  ): Promise<Contradiction[]> {
    // Find contradictions where human rating differs from eval prediction
    // Join through agent_versions to get traces for this agent
    const results = await this.deps.db
      .prepare(
        `SELECT
          f.trace_id,
          f.rating as human_rating,
          ee.predicted_result,
          ee.predicted_reason,
          t.trace_data
         FROM feedback f
         JOIN eval_executions ee ON f.trace_id = ee.trace_id
         JOIN traces t ON f.trace_id = t.id
         JOIN agent_versions av ON t.agent_version_id = av.id
         WHERE av.agent_id = ?
           AND (
             (f.rating = 'positive' AND ee.predicted_result = 0)
             OR (f.rating = 'negative' AND ee.predicted_result = 1)
           )
         ORDER BY f.created_at DESC
         LIMIT ?`
      )
      .bind(agentId, limit)
      .all();

    return results.results.map(r => ({
      trace_id: r.trace_id as string,
      human_rating: r.human_rating as string,
      predicted_result: (r.predicted_result as number) === 1,
      predicted_reason: r.predicted_reason as string,
      trace_data: JSON.parse(r.trace_data as string)
    }));
  }

  private async analyzeFailurePatterns(
    contradictions: Contradiction[]
  ): Promise<FailureAnalysisResult> {
    const prompt = this.buildFailureAnalysisPrompt(contradictions);

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4.5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    try {
      const parsed = JSON.parse(textContent.text);
      return {
        failure_patterns: parsed.failure_patterns || [],
        summary: parsed.summary || ''
      };
    } catch {
      // If not JSON, treat as plain text summary
      return {
        failure_patterns: [textContent.text],
        summary: textContent.text
      };
    }
  }

  private buildFailureAnalysisPrompt(contradictions: Contradiction[]): string {
    const examples = contradictions.slice(0, 20).map((c, idx) => {
      const tracePreview = JSON.stringify(c.trace_data).substring(0, 500);
      return `
Example ${idx + 1}:
- Human rated: ${c.human_rating}
- Eval predicted: ${c.predicted_result ? 'positive' : 'negative'}
- Eval reason: ${c.predicted_reason}
- Trace preview: ${tracePreview}...
`;
    }).join('\n');

    return `You are an expert at analyzing AI system failures. Analyze these contradictions where human ratings differ from eval predictions.

## Contradictions (${contradictions.length} total, showing up to 20)

${examples}

## Task

Identify patterns in these failures. What themes emerge? When does the eval fail?

Output JSON format:
{
  "failure_patterns": ["Pattern 1", "Pattern 2", ...],
  "summary": "Brief summary of the main failure themes"
}

Focus on actionable insights that can improve the agent's prompt.`;
  }

  private async fetchBestPractices(): Promise<BestPractice[]> {
    const results = await this.deps.db
      .prepare(
        `SELECT title, content, category
         FROM prompt_best_practices
         WHERE category IN ('clarity', 'structure', 'reasoning', 'general')
         ORDER BY created_at DESC
         LIMIT 10`
      )
      .all();

    return results.results.map(r => ({
      title: r.title as string,
      content: r.content as string,
      category: r.category as string
    }));
  }

  private async generateImprovedPrompt(
    currentTemplate: string,
    variables: string[],
    failureAnalysis: FailureAnalysisResult,
    bestPractices: BestPractice[]
  ): Promise<PromptImprovementResult> {
    const prompt = this.buildImprovementPrompt(
      currentTemplate,
      variables,
      failureAnalysis,
      bestPractices
    );

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4.5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Try to extract JSON from markdown code blocks or plain text
    let parsed: PromptImprovementResult;
    try {
      // Try direct JSON parse
      parsed = JSON.parse(textContent.text);
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = textContent.text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Could not parse improved prompt JSON from Claude response');
      }
    }

    // Validate that required fields exist
    if (!parsed.improved_prompt || !parsed.changes || !parsed.reasoning) {
      throw new Error('Invalid improved prompt format from Claude');
    }

    return parsed;
  }

  private buildImprovementPrompt(
    currentTemplate: string,
    variables: string[],
    failureAnalysis: FailureAnalysisResult,
    bestPractices: BestPractice[]
  ): string {
    const practicesText = bestPractices.map(p =>
      `**${p.title}** (${p.category})\n${p.content}`
    ).join('\n\n');

    return `You are a prompt engineering expert. Improve this system prompt based on failure analysis and best practices.

## Current Prompt

${currentTemplate}

## Failure Analysis

${failureAnalysis.summary}

**Identified Patterns:**
${failureAnalysis.failure_patterns.map(p => `- ${p}`).join('\n')}

## Best Practices to Apply

${practicesText}

## Requirements

1. **Preserve these variables:** ${variables.join(', ')}
2. **Maintain the core intent** of the original prompt
3. **Address the identified failure patterns** directly
4. **Apply relevant best practices** from above
5. **Keep the improved prompt clear and concise**

## Output Format

Respond with ONLY valid JSON (no markdown, no code blocks):

{
  "improved_prompt": "The complete improved prompt text here...",
  "changes": ["Change 1: description", "Change 2: description", ...],
  "reasoning": "Brief explanation of why these changes address the failures"
}`;
  }

  private async getNextVersionNumber(agentId: string): Promise<number> {
    const result = await this.deps.db
      .prepare(
        `SELECT MAX(version) as max_version
         FROM agent_versions
         WHERE agent_id = ?`
      )
      .bind(agentId)
      .first();

    const maxVersion = result?.max_version as number | null;
    return (maxVersion || 0) + 1;
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
