/**
 * AutoEvalGenerator - Generates candidate eval functions from labeled traces
 * Uses LLM meta-prompting to analyze patterns and generate eval variations
 */

import OpenAI from 'openai';
import { createGatewayClient, DEFAULT_MODEL, type GatewayEnv } from '../../ai/gateway';

/**
 * Labeled trace with human judgment
 */
export interface LabeledTrace {
  trace_id: string;
  task: { user_message: string };
  trace: Record<string, unknown>;
  human_score: number;  // 0-1
  human_feedback?: string;
}

/**
 * Generated eval candidate with metrics
 */
export interface EvalCandidate {
  id: string;
  code: string;
  variation: string;  // "correctness", "efficiency", "safety", "completeness", "ensemble"

  // Set after testing (Phase 2B)
  agreement_rate?: number;
  confusion_matrix?: {
    tp: number;
    tn: number;
    fp: number;
    fn: number;
  };
}

/**
 * Pattern analysis from labeled traces
 */
export interface PatternAnalysis {
  positive_patterns: string[];  // What good traces have
  negative_patterns: string[];  // What bad traces have
  key_differentiators: string[];
}

/**
 * Configuration for AutoEvalGenerator
 */
export interface AutoEvalGeneratorConfig {
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
  /** Model to use (provider-prefixed, default: anthropic/claude-sonnet-4-5) */
  model?: string;
  /** Temperature for generation (default: 0.3 for creativity with variation) */
  temperature?: number;
}

/**
 * AutoEvalGenerator - Generates eval functions from labeled traces
 *
 * Process:
 * 1. Analyze patterns in high (>0.7) vs low (<0.3) scored traces
 * 2. Generate candidates with different variation focuses
 * 3. Validate code syntax and safety
 *
 * Requirements:
 * - Minimum 10 labeled traces
 * - Generates 5 variations: correctness, efficiency, safety, completeness, ensemble
 * - Validates no forbidden imports (os, subprocess, sys, socket, requests, urllib)
 */
export class AutoEvalGenerator {
  private client: OpenAI;
  private model: string;
  private temperature: number;

  /**
   * Create a new AutoEvalGenerator
   * @param config - Configuration with gateway credentials
   */
  constructor(config: AutoEvalGeneratorConfig) {
    // Use AI Gateway /compat endpoint
    this.client = createGatewayClient({
      CF_ACCOUNT_ID: config.cfAccountId,
      CF_AI_GATEWAY_ID: config.cfGatewayId,
      CF_AI_GATEWAY_TOKEN: config.cfGatewayToken,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.temperature = config.temperature !== undefined ? config.temperature : 0.3;
  }

  /**
   * Generate candidate eval functions from labeled traces
   *
   * @param labeledTraces - Traces with human scores and feedback
   * @param targetCount - Number of candidates to generate (default: 5)
   * @returns Array of validated eval candidates
   * @throws Error if fewer than 10 labeled traces
   */
  async generate(
    labeledTraces: LabeledTrace[],
    targetCount: number = 5
  ): Promise<EvalCandidate[]> {
    // Validate minimum traces
    if (labeledTraces.length < 10) {
      throw new Error(
        `Need at least 10 labeled traces, got ${labeledTraces.length}. ` +
        `Add more human scores to generate reliable eval functions.`
      );
    }

    console.log(`[AutoEvalGenerator] Analyzing ${labeledTraces.length} labeled traces...`);

    // Step 1: Analyze patterns in high vs low scored traces
    const patterns = await this.analyzePatterns(labeledTraces);
    console.log(`[AutoEvalGenerator] Pattern analysis complete`);
    console.log(`  Positive patterns: ${patterns.positive_patterns.length}`);
    console.log(`  Negative patterns: ${patterns.negative_patterns.length}`);
    console.log(`  Key differentiators: ${patterns.key_differentiators.length}`);

    // Step 2: Generate candidates with different variations
    const variations = ['correctness', 'efficiency', 'safety', 'completeness', 'ensemble'];
    const candidates: EvalCandidate[] = [];

    for (let i = 0; i < Math.min(targetCount, variations.length); i++) {
      const variation = variations[i];
      console.log(`[AutoEvalGenerator] Generating ${variation} candidate...`);

      try {
        const candidate = await this.generateCandidate(
          patterns,
          variation,
          labeledTraces
        );
        candidates.push(candidate);
        console.log(`[AutoEvalGenerator] Generated ${variation} candidate: ${candidate.id}`);
      } catch (error: any) {
        console.error(`[AutoEvalGenerator] Failed to generate ${variation} candidate:`, error.message);
      }
    }

    // Step 3: Validate all candidates
    const validCandidates = candidates.filter(c => {
      const isValid = this.validateCandidate(c);
      if (!isValid) {
        console.warn(`[AutoEvalGenerator] Candidate ${c.id} failed validation`);
      }
      return isValid;
    });

    console.log(`[AutoEvalGenerator] Generated ${validCandidates.length}/${candidates.length} valid candidates`);

    if (validCandidates.length === 0) {
      throw new Error('Failed to generate any valid eval candidates');
    }

    return validCandidates;
  }

  /**
   * Analyze patterns in high vs low scored traces
   *
   * Uses LLM to identify what distinguishes good from bad executions
   *
   * @param labeledTraces - All labeled traces
   * @returns Pattern analysis with positive/negative patterns and differentiators
   */
  private async analyzePatterns(labeledTraces: LabeledTrace[]): Promise<PatternAnalysis> {
    // Split into high and low scored traces
    const highScored = labeledTraces.filter(t => t.human_score >= 0.7);
    const lowScored = labeledTraces.filter(t => t.human_score <= 0.3);

    console.log(`[AutoEvalGenerator] High scored: ${highScored.length}, Low scored: ${lowScored.length}`);

    // If we don't have enough examples, use fallback patterns
    if (highScored.length < 2 || lowScored.length < 2) {
      console.warn('[AutoEvalGenerator] Insufficient high/low examples, using fallback patterns');
      return {
        positive_patterns: [
          'Complete response addressing the task',
          'Correct and accurate information',
          'Well-structured output'
        ],
        negative_patterns: [
          'Incomplete or partial response',
          'Incorrect or inaccurate information',
          'Poor structure or formatting'
        ],
        key_differentiators: [
          'Completeness of response',
          'Accuracy of information',
          'Task alignment'
        ]
      };
    }

    // Build analysis prompt
    const analysisPrompt = this.buildPatternAnalysisPrompt(highScored, lowScored);

    // Call LLM using OpenAI SDK format (AI Gateway /compat endpoint)
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2000,
      temperature: 0,  // Deterministic for analysis
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    // Extract text response (OpenAI format)
    const text = response.choices[0]?.message?.content || '';

    // Parse JSON from response
    const patterns = this.parsePatternAnalysis(text);

    return patterns;
  }

  /**
   * Build prompt for pattern analysis
   */
  private buildPatternAnalysisPrompt(
    highScored: LabeledTrace[],
    lowScored: LabeledTrace[]
  ): string {
    const highExamples = highScored.slice(0, 5).map((t, i) => {
      const traceStr = JSON.stringify(t.trace, null, 2);
      const truncatedTrace = traceStr.length > 1000 ? traceStr.slice(0, 1000) + '...' : traceStr;

      return `
### High-Quality Example ${i + 1} (score: ${t.human_score.toFixed(2)})
**Task:** ${t.task.user_message}

**Trace:**
\`\`\`json
${truncatedTrace}
\`\`\`

${t.human_feedback ? `**Human Feedback:** ${t.human_feedback}` : ''}
`;
    }).join('\n');

    const lowExamples = lowScored.slice(0, 5).map((t, i) => {
      const traceStr = JSON.stringify(t.trace, null, 2);
      const truncatedTrace = traceStr.length > 1000 ? traceStr.slice(0, 1000) + '...' : traceStr;

      return `
### Low-Quality Example ${i + 1} (score: ${t.human_score.toFixed(2)})
**Task:** ${t.task.user_message}

**Trace:**
\`\`\`json
${truncatedTrace}
\`\`\`

${t.human_feedback ? `**Human Feedback:** ${t.human_feedback}` : ''}
`;
    }).join('\n');

    return `Analyze these agent execution traces to identify patterns that distinguish high-quality from low-quality responses.

# HIGH-QUALITY EXECUTIONS (score >= 0.7)
${highExamples}

# LOW-QUALITY EXECUTIONS (score <= 0.3)
${lowExamples}

Your task is to identify:

1. **POSITIVE PATTERNS:** What do high-quality responses consistently have? (e.g., completeness, accuracy, proper formatting)
2. **NEGATIVE PATTERNS:** What do low-quality responses consistently have? (e.g., errors, incompleteness, off-topic)
3. **KEY DIFFERENTIATORS:** What's the clearest signal distinguishing good from bad? (most important factors)

Return your analysis as JSON:
\`\`\`json
{
  "positive_patterns": ["pattern1", "pattern2", "pattern3", ...],
  "negative_patterns": ["pattern1", "pattern2", "pattern3", ...],
  "key_differentiators": ["differentiator1", "differentiator2", "differentiator3", ...]
}
\`\`\`

Focus on concrete, observable patterns that can be checked programmatically or with LLM assistance.`;
  }

  /**
   * Parse pattern analysis from LLM response
   */
  private parsePatternAnalysis(text: string): PatternAnalysis {
    try {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      // Try to find JSON object
      const objectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!objectMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(objectMatch[0]);

      // Validate structure
      if (!parsed.positive_patterns || !Array.isArray(parsed.positive_patterns)) {
        throw new Error('Missing or invalid positive_patterns');
      }
      if (!parsed.negative_patterns || !Array.isArray(parsed.negative_patterns)) {
        throw new Error('Missing or invalid negative_patterns');
      }
      if (!parsed.key_differentiators || !Array.isArray(parsed.key_differentiators)) {
        throw new Error('Missing or invalid key_differentiators');
      }

      return {
        positive_patterns: parsed.positive_patterns,
        negative_patterns: parsed.negative_patterns,
        key_differentiators: parsed.key_differentiators
      };
    } catch (error: any) {
      console.error('[AutoEvalGenerator] Failed to parse pattern analysis:', error.message);
      console.error('[AutoEvalGenerator] Response text:', text.slice(0, 500));

      // Return fallback patterns
      return {
        positive_patterns: ['Complete response', 'Addresses user request'],
        negative_patterns: ['Incomplete response', 'Off-topic'],
        key_differentiators: ['Completeness', 'Relevance']
      };
    }
  }

  /**
   * Generate a single eval candidate with specific variation focus
   *
   * @param patterns - Analyzed patterns from traces
   * @param variation - Focus area (correctness, efficiency, safety, completeness, ensemble)
   * @param labeledTraces - Sample traces for reference
   * @returns Generated eval candidate
   */
  private async generateCandidate(
    patterns: PatternAnalysis,
    variation: string,
    labeledTraces: LabeledTrace[]
  ): Promise<EvalCandidate> {
    // Build generation prompt
    const genPrompt = this.buildGenerationPrompt(patterns, variation, labeledTraces);

    // Call LLM with some creativity for variation (OpenAI SDK format)
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 3000,
      temperature: this.temperature,
      messages: [{ role: 'user', content: genPrompt }]
    });

    // Extract text response (OpenAI format)
    const text = response.choices[0]?.message?.content || '';

    // Extract Python code from response
    const rawCode = this.extractPythonCode(text);

    // Fix common LLM code generation mistakes
    const code = this.fixCommonCodeIssues(rawCode);

    // Generate unique ID
    const id = `candidate_${variation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      code,
      variation
    };
  }

  /**
   * Build prompt for eval function generation
   */
  private buildGenerationPrompt(
    patterns: PatternAnalysis,
    variation: string,
    labeledTraces: LabeledTrace[]
  ): string {
    const variationDescriptions: Record<string, string> = {
      correctness: 'Focus on whether the response correctly addresses the task. Check for accuracy and completeness of the solution.',
      efficiency: 'Focus on whether the response is concise and efficient. Penalize unnecessary verbosity or redundant steps.',
      safety: 'Focus on whether the response is safe and appropriate. Check for harmful content, errors, or security issues.',
      completeness: 'Focus on whether all aspects of the task are addressed. Check for missing parts or incomplete responses.',
      ensemble: 'Balance all aspects: correctness, efficiency, safety, and completeness equally. Provide a holistic evaluation.'
    };

    const variationFocus = variationDescriptions[variation] || variationDescriptions.ensemble;

    // Get a sample trace structure
    const sampleTrace = labeledTraces[0]?.trace || {};
    const sampleTraceStr = JSON.stringify(sampleTrace, null, 2);
    const truncatedSample = sampleTraceStr.length > 500 ? sampleTraceStr.slice(0, 500) + '...' : sampleTraceStr;

    return `Generate a Python eval function based on these patterns and focus area.

# PATTERNS IDENTIFIED

## Positive Patterns (what good traces have):
${patterns.positive_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Negative Patterns (what bad traces have):
${patterns.negative_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Key Differentiators:
${patterns.key_differentiators.map((d, i) => `${i + 1}. ${d}`).join('\n')}

# FOCUS AREA: ${variation}
${variationFocus}

# FUNCTION SIGNATURE (MUST match exactly)

\`\`\`python
def eval_function(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
    """
    Evaluate an agent's execution trace.

    Args:
        task: {"user_message": "the user's request"}
        task_metadata: {
            "expected_output": "...",
            "similar_high_rated_traces": [...],
            "success_criteria": [...],
            ...
        }
        trace: The agent's execution trace (structure varies by agent)
        ctx: EvalContext with methods:
            - ctx.call_llm(prompt, model, temperature, max_tokens, cache_key) -> str
            - ctx.get_cost_so_far() -> float
            - ctx.get_remaining_budget() -> float
            - ctx.has_cache(key) -> bool
            - ctx.get_cache(key) -> str | None
            - ctx.set_cache(key, value) -> None

    Returns:
        (score, feedback) where:
            - score: float between 0.0 and 1.0 (0 = worst, 1 = best)
            - feedback: string explaining the score
    """
    # Your implementation here
    ...
\`\`\`

# REQUIREMENTS

1. **Return Type:** Must return a tuple (score: float, feedback: str)
2. **Score Range:** Score must be between 0.0 and 1.0
3. **LLM Usage:** Use ctx.call_llm() SPARINGLY - it's expensive. Use fast heuristics first, LLM only when needed for semantic checks.
4. **Safe Imports:** ONLY use: json, re, typing, math, datetime, difflib. NO os, subprocess, sys, socket, requests, urllib, etc.
5. **Error Handling:** Handle edge cases (empty response, missing fields, malformed trace)
6. **Feedback Quality:** Provide specific, actionable feedback explaining the score

# SAMPLE TRACE STRUCTURE

\`\`\`json
${truncatedSample}
\`\`\`

# GENERATE THE COMPLETE FUNCTION

Write a complete, production-ready eval_function that:
- Implements the ${variation} focus
- Uses the identified patterns to evaluate traces
- Returns appropriate scores and feedback
- Handles errors gracefully

Return ONLY the Python function code, wrapped in a markdown code block.`;
  }

  /**
   * Extract Python code from LLM response
   *
   * Handles various formats: ```python, ```, or plain code
   */
  private extractPythonCode(text: string): string {
    // Try to find python code block
    const pythonBlockMatch = text.match(/```python\s*([\s\S]*?)\s*```/);
    if (pythonBlockMatch) {
      return pythonBlockMatch[1].trim();
    }

    // Try plain code block
    const plainBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (plainBlockMatch) {
      return plainBlockMatch[1].trim();
    }

    // Look for function definition directly
    const funcMatch = text.match(/def eval_function[\s\S]*/);
    if (funcMatch) {
      return funcMatch[0].trim();
    }

    // If nothing found, return the whole text (might work)
    return text.trim();
  }

  /**
   * Fix common LLM code generation mistakes
   *
   * Fixes:
   * - Invalid return type annotations (tuple[float, feedback: str] -> tuple[float, str])
   * - Named tuple annotations that Python doesn't support
   */
  private fixCommonCodeIssues(code: string): string {
    let fixed = code;

    // Fix invalid return type annotations with named parameters
    // Matches: tuple[float, feedback: str] or tuple[float, score: str] etc.
    // Replaces with: tuple[float, str]
    fixed = fixed.replace(
      /tuple\[float,\s*\w+:\s*str\]/gi,
      'tuple[float, str]'
    );

    // Also fix Tuple (capital T) version
    fixed = fixed.replace(
      /Tuple\[float,\s*\w+:\s*str\]/gi,
      'Tuple[float, str]'
    );

    // Fix any other named tuple parameters
    // e.g., tuple[score: float, feedback: str] -> tuple[float, str]
    fixed = fixed.replace(
      /tuple\[\w+:\s*float,\s*\w+:\s*str\]/gi,
      'tuple[float, str]'
    );

    if (fixed !== code) {
      console.log('[AutoEvalGenerator] Fixed invalid return type annotation');
    }

    return fixed;
  }

  /**
   * Validate candidate eval code for safety and correctness
   *
   * Checks:
   * - Has eval_function definition
   * - Has return statement
   * - No forbidden imports
   * - Uses task/trace parameters
   *
   * @param candidate - The candidate to validate
   * @returns True if valid, false otherwise
   */
  private validateCandidate(candidate: EvalCandidate): boolean {
    const code = candidate.code;

    // Check function signature exists
    if (!code.includes('def eval_function(')) {
      console.warn(`[AutoEvalGenerator] ${candidate.id}: Missing eval_function definition`);
      return false;
    }

    // Check has return statement
    if (!code.includes('return')) {
      console.warn(`[AutoEvalGenerator] ${candidate.id}: Missing return statement`);
      return false;
    }

    // Check no forbidden imports
    const forbiddenImports = ['os', 'subprocess', 'sys', 'socket', 'requests', 'urllib', 'http', 'urllib3'];
    for (const forbidden of forbiddenImports) {
      // Check for various import forms
      const importPatterns = [
        new RegExp(`import\\s+${forbidden}\\b`),
        new RegExp(`from\\s+${forbidden}\\b`),
        new RegExp(`import\\s+.*\\s+as\\s+${forbidden}\\b`)
      ];

      for (const pattern of importPatterns) {
        if (pattern.test(code)) {
          console.warn(`[AutoEvalGenerator] ${candidate.id}: Forbidden import ${forbidden}`);
          return false;
        }
      }
    }

    // Check uses task or trace (basic sanity check)
    if (!code.includes('task') && !code.includes('trace')) {
      console.warn(`[AutoEvalGenerator] ${candidate.id}: Doesn't use task or trace parameters`);
      return false;
    }

    // Check return type hint (if present) is correct
    const returnTypeMatch = code.match(/def eval_function\([^)]*\)\s*->\s*([^:]+):/);
    if (returnTypeMatch) {
      const returnType = returnTypeMatch[1].trim();
      // Should be tuple[float, str] or Tuple[float, str]
      if (!returnType.includes('tuple') && !returnType.includes('Tuple')) {
        console.warn(`[AutoEvalGenerator] ${candidate.id}: Invalid return type hint: ${returnType}`);
        // Not a hard failure - type hints are optional
      }
    }

    return true;
  }
}
