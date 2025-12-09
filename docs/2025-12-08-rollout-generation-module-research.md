# Rollout Generation Module Research

**Date**: 2025-12-08
**Status**: Research Complete
**Purpose**: Design a module for generating agent trajectories with simulated tools and users

## Executive Summary

This document synthesizes research from 5 parallel agents on building a rollout generation module that:
1. Ingests historical trace data
2. Works with a reward model API (score 0-1 given trace + agent version)
3. Determines which tool calls and user behaviors need simulation
4. Enables end-to-end trajectory generation for optimization algorithms

---

## Part 1: Available Data in iofold Traces

### 1.1 Tool Call Information

**Currently Captured:**
```typescript
interface ToolCall {
  tool_name: string;           // e.g., "write_file", "execute", "read_file"
  arguments: Record<string, any>;  // Full parameter object
  result?: any;                // Complete execution output
  error?: string;              // Error message if failed
}
```

**Storage Locations:**
- `traces.steps` - JSON array of `LangGraphExecutionStep`
- `playground_steps` - Granular per-step storage with `tool_name`, `tool_args`, `tool_result`, `tool_error`

**Tools Available in Playground:**
- Built-in: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`
- Custom: `execute` (Python sandbox), `execute_python` (direct)

### 1.2 User Input Patterns

**Captured:**
- Initial user message in `steps[0].messages_added[0].content`
- Full conversation history in `steps[].messages_added[]`
- Input preview (first 200 chars) in `traces.input_preview`
- Session variables in `playground_sessions.variables`

**Not Captured:**
- User intent/goal description
- Success criteria
- User satisfaction beyond thumbs up/down

### 1.3 Agent Version Information

```sql
agent_versions:
  - prompt_template TEXT     -- Full system prompt with {{variables}}
  - variables TEXT           -- JSON schema for template variables
  - source TEXT             -- 'discovered' | 'manual' | 'ai_improved'
  - parent_version_id TEXT  -- Refinement chain
  - accuracy REAL           -- Performance metrics
```

**Linking:** `traces.agent_version_id` → `agent_versions.id` → `agents.id`

### 1.4 Critical Gaps for Simulation

| Gap | Impact | Priority |
|-----|--------|----------|
| No tool environment state | Can't recreate execution context | High |
| No determinism controls | Stochastic replay variation | High |
| No tool call override mechanism | Can't inject mock responses | High |
| Missing `tool_call_id` tracking | Hard to match calls with results | Medium |
| No checkpoint/branching | Can't do counterfactual analysis | Medium |
| Missing cost/quality scores | Incomplete reward signals | Medium |

---

## Part 2: Tool Simulation Strategies

### 2.1 VCR Cassette Pattern (Recommended for MVP)

**Concept:** Record tool executions as "cassettes" (JSON with input/output pairs), replay without network calls.

```typescript
interface ToolCassette {
  id: string;
  tool_name: string;
  arguments_hash: string;      // Hash of arguments for lookup
  arguments: Record<string, any>;
  result: any;
  error?: string;
  latency_ms: number;
  recorded_at: string;
  trace_id: string;            // Source trace
}
```

**Database Schema:**
```sql
CREATE TABLE tool_cassettes (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  arguments_hash TEXT NOT NULL,
  arguments TEXT NOT NULL,       -- JSON
  result TEXT,                   -- JSON
  error TEXT,
  latency_ms INTEGER,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  trace_id TEXT,

  UNIQUE(tool_name, arguments_hash)
);

CREATE INDEX idx_tool_cassettes_lookup
  ON tool_cassettes(tool_name, arguments_hash);
```

**Extraction from Traces:**
```typescript
async function extractToolCassettes(traceId: string): Promise<ToolCassette[]> {
  const trace = await db.getTrace(traceId);
  const cassettes: ToolCassette[] = [];

  for (const step of trace.steps) {
    for (const toolCall of step.tool_calls || []) {
      cassettes.push({
        id: crypto.randomUUID(),
        tool_name: toolCall.tool_name,
        arguments_hash: hashArguments(toolCall.arguments),
        arguments: toolCall.arguments,
        result: toolCall.result,
        error: toolCall.error,
        latency_ms: step.metadata?.latency_ms,
        trace_id: traceId
      });
    }
  }

  return cassettes;
}

function hashArguments(args: Record<string, any>): string {
  // Normalize and hash for consistent lookup
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

**Replay Implementation:**
```typescript
class CassetteToolSimulator {
  private cassettes: Map<string, ToolCassette[]>;

  async simulateTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<ToolResult> {
    const hash = hashArguments(args);
    const key = `${toolName}:${hash}`;

    // Exact match
    const cassette = this.cassettes.get(key);
    if (cassette) {
      await sleep(cassette.latency_ms);  // Simulate realistic timing
      if (cassette.error) throw new Error(cassette.error);
      return cassette.result;
    }

    // Fuzzy match (same tool, similar args)
    const similar = this.findSimilarCassette(toolName, args);
    if (similar) {
      return this.adaptResult(similar, args);
    }

    throw new Error(`No cassette found for ${toolName}`);
  }
}
```

**Pros:**
- 80% of value with 20% effort
- Deterministic replay
- Zero API/tool costs
- 10-100x faster execution

**Cons:**
- Only works for seen inputs
- Storage grows with trace count
- Doesn't handle novel scenarios

### 2.2 Learned Tool Models (Advanced)

**Concept:** Train neural models to predict tool responses for novel inputs.

**When to Use:**
- Complex tools with variable responses
- Need "what-if" analysis beyond recorded data
- Stochastic tools (API responses vary)

**Architecture:**
```
Input Embedding → Seq2Seq Model → Output Prediction
     ↓                              ↓
  Tool name +              Predicted response +
  Arguments                Confidence score
```

**Training Requirements:**
- 200-500 examples for simple tools
- 1000-2000 for complex/stateful tools
- Quality > quantity

**Research Reference:** Modelizer framework for API behavior learning

### 2.3 Hybrid Approach (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Simulator Router                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Incoming Tool Call                                         │
│        │                                                     │
│        ▼                                                     │
│   ┌─────────────────┐                                       │
│   │ Exact Cassette  │──── Found ────▶ Return recorded       │
│   │    Match?       │                  result               │
│   └────────┬────────┘                                       │
│            │ Not Found                                       │
│            ▼                                                 │
│   ┌─────────────────┐                                       │
│   │ Similar Cassette│──── Found ────▶ Adapt and return      │
│   │    Match?       │                                       │
│   └────────┬────────┘                                       │
│            │ Not Found                                       │
│            ▼                                                 │
│   ┌─────────────────┐                                       │
│   │ Learned Model   │──── High Conf ─▶ Return prediction    │
│   │   Available?    │                                       │
│   └────────┬────────┘                                       │
│            │ Low Conf / Not Available                        │
│            ▼                                                 │
│   ┌─────────────────┐                                       │
│   │ Real Execution  │──────────────▶ Execute + Record       │
│   │  (Fallback)     │                  new cassette         │
│   └─────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 3: User Simulation Strategies

### 3.1 LLM-as-User Pattern

**Concept:** Use an LLM to role-play as the user based on extracted personas and goals.

**Prompt Template:**
```markdown
# User Simulator System Prompt

You are simulating a user interacting with an AI assistant.

## User Profile
- Name: {{user_name}}
- Expertise: {{expertise_level}}  (novice/intermediate/expert)
- Communication Style: {{style}}  (formal/casual/technical)
- Personality: {{traits}}

## User Goal
Primary Goal: {{goal}}
Success Criteria: {{success_criteria}}
Constraints: {{constraints}}

## Behavioral Guidelines
1. Stay in character throughout the conversation
2. Only use information this user would reasonably know
3. Work toward the primary goal but allow natural digressions
4. Express appropriate frustration if stuck
5. Vary response length naturally (5-100 words)

## Current Context
Conversation so far: {{conversation_history}}
What has been achieved: {{progress}}

Now respond as this user to the assistant's message:
{{assistant_message}}
```

### 3.2 Persona Extraction from Traces

```typescript
interface ExtractedPersona {
  expertise_level: 'novice' | 'intermediate' | 'expert';
  communication_style: 'formal' | 'casual' | 'technical';
  typical_goals: string[];
  common_constraints: string[];
  vocabulary_sample: string[];
  avg_message_length: number;
  turn_patterns: string[];  // e.g., "asks clarifying questions", "provides context upfront"
}

async function extractPersonasFromTraces(
  traces: Trace[]
): Promise<ExtractedPersona[]> {
  // 1. Extract user messages from all traces
  const userMessages = traces.flatMap(t =>
    t.steps.flatMap(s =>
      s.messages_added.filter(m => m.role === 'user')
    )
  );

  // 2. Cluster by communication patterns
  const embeddings = await embed(userMessages.map(m => m.content));
  const clusters = hdbscan(embeddings, { minClusterSize: 10 });

  // 3. For each cluster, extract persona
  const personas: ExtractedPersona[] = [];
  for (const cluster of clusters) {
    const clusterMessages = cluster.map(i => userMessages[i]);

    const persona = await llm.generate(`
      Analyze these user messages and extract a persona profile:
      ${JSON.stringify(clusterMessages.slice(0, 20))}

      Return JSON with: expertise_level, communication_style,
      typical_goals, common_constraints, vocabulary_sample,
      avg_message_length, turn_patterns
    `);

    personas.push(JSON.parse(persona));
  }

  return personas;
}
```

### 3.3 Goal-Oriented Simulation

```typescript
interface UserGoal {
  primary_goal: string;
  sub_goals: string[];
  success_criteria: string;
  constraints: string[];
  flexibility: Record<string, 'rigid' | 'flexible'>;
}

class GoalOrientedUserSimulator {
  private persona: ExtractedPersona;
  private goal: UserGoal;
  private goalState: 'not_started' | 'in_progress' | 'achieved' | 'failed';

  async generateResponse(
    assistantMessage: string,
    conversationHistory: Message[]
  ): Promise<string> {
    // 1. Update goal state based on assistant's response
    this.goalState = await this.assessProgress(assistantMessage);

    // 2. Generate response based on state
    const prompt = this.buildPrompt(assistantMessage, conversationHistory);

    // 3. Add appropriate emotion/frustration based on progress
    const emotionalContext = this.getEmotionalContext();

    return await llm.generate(prompt + emotionalContext);
  }

  private async assessProgress(response: string): Promise<GoalState> {
    const assessment = await llm.generate(`
      Goal: ${this.goal.primary_goal}
      Success criteria: ${this.goal.success_criteria}
      Assistant's response: ${response}

      Has the goal been achieved? Return: achieved/in_progress/failed
    `);
    return assessment.trim() as GoalState;
  }
}
```

### 3.4 Diversity Strategies

**Multi-Persona Sampling:**
```typescript
const PERSONA_ARCHETYPES = [
  { name: 'novice_casual', expertise: 'novice', style: 'casual' },
  { name: 'expert_technical', expertise: 'expert', style: 'technical' },
  { name: 'impatient_user', patience: 'low', verbosity: 'terse' },
  { name: 'detailed_explainer', patience: 'high', verbosity: 'verbose' },
  { name: 'confused_user', expertise: 'novice', asks_clarifications: true },
];

function sampleDiversePersona(): Persona {
  // Stratified sampling to ensure coverage
  return weightedSample(PERSONA_ARCHETYPES, getUnderrepresentedWeights());
}
```

**Adversarial User Injection:**
```typescript
const ADVERSARIAL_BEHAVIORS = [
  'off_topic_questions',      // Tests context awareness
  'contradictory_info',       // Tests consistency
  'typos_and_misspellings',   // Tests robustness
  'aggressive_tone',          // Tests de-escalation
  'prompt_injection_attempts' // Tests security
];

function generateAdversarialUser(baseBehavior: string): Persona {
  return {
    ...sampleDiversePersona(),
    adversarial_behavior: baseBehavior,
    injection_probability: 0.1  // 10% of responses include adversarial element
  };
}
```

---

## Part 4: Environment Simulation Architecture

### 4.1 Overall Module Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ROLLOUT GENERATION MODULE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │ Historical Trace │────▶│ Environment      │                      │
│  │     Ingestion    │     │   Extractor      │                      │
│  └──────────────────┘     └────────┬─────────┘                      │
│                                    │                                 │
│                    ┌───────────────┼───────────────┐                │
│                    ▼               ▼               ▼                │
│           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│           │ Tool Cassette│ │ User Persona │ │ Goal/Intent  │       │
│           │   Library    │ │   Library    │ │   Library    │       │
│           └──────────────┘ └──────────────┘ └──────────────┘       │
│                    │               │               │                │
│                    └───────────────┼───────────────┘                │
│                                    ▼                                 │
│                         ┌──────────────────┐                        │
│                         │    Environment   │                        │
│                         │    Simulator     │                        │
│                         └────────┬─────────┘                        │
│                                  │                                   │
│           ┌──────────────────────┼──────────────────────┐           │
│           ▼                      ▼                      ▼           │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────┐    │
│  │  Tool Simulator  │   │  User Simulator  │   │ State Manager│    │
│  │  (Cassette/Model)│   │  (LLM-as-User)   │   │ (Filesystem) │    │
│  └────────┬─────────┘   └────────┬─────────┘   └──────┬───────┘    │
│           │                      │                     │            │
│           └──────────────────────┼─────────────────────┘            │
│                                  ▼                                   │
│                         ┌──────────────────┐                        │
│                         │ Trajectory       │                        │
│                         │ Generator        │                        │
│                         └────────┬─────────┘                        │
│                                  │                                   │
│                                  ▼                                   │
│                         ┌──────────────────┐                        │
│                         │ Generated        │                        │
│                         │ Trajectories     │                        │
│                         └────────┬─────────┘                        │
│                                  │                                   │
│                                  ▼                                   │
│                         ┌──────────────────┐                        │
│                         │ Reward Model     │                        │
│                         │ (Score 0-1)      │                        │
│                         └──────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Interfaces

```typescript
// ==================== CORE INTERFACES ====================

interface EnvironmentConfig {
  toolSimulatorMode: 'cassette' | 'learned' | 'hybrid' | 'real';
  userSimulatorMode: 'scripted' | 'llm' | 'extracted';
  stateManagement: 'stateless' | 'checkpoint' | 'full';
  maxTurns: number;
  timeoutMs: number;
}

interface RolloutRequest {
  agentVersionId: string;           // Agent to test
  promptOverride?: string;          // Optional prompt modification
  environmentConfig: EnvironmentConfig;
  numRollouts: number;              // How many trajectories to generate
  diversityConfig?: DiversityConfig;
}

interface GeneratedTrajectory {
  id: string;
  agentVersionId: string;
  prompt: string;
  turns: Turn[];
  toolCalls: ToolCallRecord[];
  finalState: EnvironmentState;
  metadata: TrajectoryMetadata;
}

interface Turn {
  index: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: ToolCall[];
  timestamp: string;
}

interface TrajectoryMetadata {
  totalTokens: number;
  totalLatencyMs: number;
  toolCallCount: number;
  userTurnCount: number;
  simulationMode: string;
  personaUsed?: string;
  goalAchieved?: boolean;
}

// ==================== REWARD MODEL ====================

interface RewardModelAPI {
  score(trace: GeneratedTrajectory, agentVersion: AgentVersion): Promise<RewardScore>;
}

interface RewardScore {
  score: number;              // 0-1 overall score
  components?: {
    task_completion: number;
    efficiency: number;
    quality: number;
  };
  explanation?: string;
}

// Simple LLM-based implementation
class LLMRewardModel implements RewardModelAPI {
  async score(
    trace: GeneratedTrajectory,
    agentVersion: AgentVersion
  ): Promise<RewardScore> {
    const prompt = `
      Evaluate this agent trajectory on a scale of 0-1.

      ## Agent System Prompt
      ${agentVersion.prompt_template}

      ## Conversation
      ${formatConversation(trace.turns)}

      ## Tool Calls Made
      ${formatToolCalls(trace.toolCalls)}

      ## Evaluation Criteria
      1. Task Completion: Did the agent achieve the user's goal?
      2. Efficiency: Were tool calls appropriate and minimal?
      3. Quality: Was the response helpful and accurate?

      Return JSON: { "score": 0.XX, "components": {...}, "explanation": "..." }
    `;

    const response = await llm.generate(prompt);
    return JSON.parse(response);
  }
}
```

### 4.3 Environment Simulator Implementation

```typescript
class EnvironmentSimulator {
  private toolSimulator: ToolSimulator;
  private userSimulator: UserSimulator;
  private stateManager: StateManager;
  private rewardModel: RewardModelAPI;

  constructor(config: EnvironmentConfig) {
    this.toolSimulator = this.createToolSimulator(config.toolSimulatorMode);
    this.userSimulator = this.createUserSimulator(config.userSimulatorMode);
    this.stateManager = new StateManager(config.stateManagement);
  }

  async generateRollout(
    agent: Agent,
    scenario: Scenario
  ): Promise<GeneratedTrajectory> {
    // Initialize state
    const state = await this.stateManager.initialize(scenario.initialState);
    const turns: Turn[] = [];

    // Generate initial user message
    let userMessage = await this.userSimulator.generateInitialMessage(
      scenario.persona,
      scenario.goal
    );

    for (let i = 0; i < this.config.maxTurns; i++) {
      // 1. Agent responds
      const agentResponse = await this.executeAgent(
        agent,
        userMessage,
        turns,
        state
      );

      // 2. Record turn
      turns.push({
        index: i,
        userMessage,
        assistantResponse: agentResponse.content,
        toolCalls: agentResponse.toolCalls,
        timestamp: new Date().toISOString()
      });

      // 3. Check termination conditions
      if (await this.shouldTerminate(turns, scenario.goal)) {
        break;
      }

      // 4. Generate next user message
      userMessage = await this.userSimulator.generateResponse(
        agentResponse.content,
        turns,
        scenario
      );
    }

    return this.buildTrajectory(agent, turns, state);
  }

  private async executeAgent(
    agent: Agent,
    userMessage: string,
    history: Turn[],
    state: EnvironmentState
  ): Promise<AgentResponse> {
    // Build messages
    const messages = this.buildMessages(agent, userMessage, history);

    // Execute agent with tool interception
    const response = await agent.execute(messages, {
      toolHandler: async (toolCall) => {
        // Intercept tool calls and route to simulator
        return await this.toolSimulator.execute(toolCall, state);
      }
    });

    return response;
  }

  private async shouldTerminate(
    turns: Turn[],
    goal: UserGoal
  ): Promise<boolean> {
    // Check if goal achieved
    const goalAssessment = await this.userSimulator.assessGoalProgress(
      turns,
      goal
    );

    if (goalAssessment === 'achieved' || goalAssessment === 'failed') {
      return true;
    }

    // Check for stuck patterns (same exchange repeating)
    if (this.detectStuckPattern(turns)) {
      return true;
    }

    return false;
  }
}
```

### 4.4 Trajectory Generator with Parallelization

```typescript
class TrajectoryGenerator {
  private envSimulator: EnvironmentSimulator;
  private rewardModel: RewardModelAPI;

  async generateBatch(
    request: RolloutRequest
  ): Promise<BatchResult> {
    const agent = await this.loadAgent(request.agentVersionId);
    const scenarios = await this.generateScenarios(request);

    // Parallel generation with concurrency control
    const results = await pMap(
      scenarios,
      async (scenario) => {
        const trajectory = await this.envSimulator.generateRollout(
          agent,
          scenario
        );

        const reward = await this.rewardModel.score(
          trajectory,
          agent.version
        );

        return { trajectory, reward };
      },
      { concurrency: request.parallelism || 10 }
    );

    return {
      trajectories: results.map(r => r.trajectory),
      rewards: results.map(r => r.reward),
      summary: this.summarizeResults(results)
    };
  }

  private async generateScenarios(
    request: RolloutRequest
  ): Promise<Scenario[]> {
    const scenarios: Scenario[] = [];

    for (let i = 0; i < request.numRollouts; i++) {
      // Sample diverse persona
      const persona = this.samplePersona(request.diversityConfig);

      // Sample goal from historical data or generate
      const goal = this.sampleGoal(request.agentVersionId);

      // Generate initial state
      const initialState = this.generateInitialState();

      scenarios.push({ persona, goal, initialState });
    }

    return scenarios;
  }
}
```

---

## Part 5: Integration with Reward Model

### 5.1 Reward Model API Contract

```typescript
// Reward model accepts trace + agent version, returns 0-1 score
interface RewardModelAPI {
  /**
   * Score a generated trajectory
   * @param trace - The generated trajectory to evaluate
   * @param agentVersion - The agent version used
   * @returns Score between 0-1 with optional breakdown
   */
  score(
    trace: GeneratedTrajectory,
    agentVersion: AgentVersion
  ): Promise<RewardScore>;
}

interface RewardScore {
  score: number;              // Primary score [0, 1]

  // Optional component breakdown
  components?: {
    task_completion: number;  // Did agent achieve goal?
    efficiency: number;       // Minimal steps/tokens?
    quality: number;          // Response helpfulness?
    safety: number;           // No harmful outputs?
  };

  // Textual feedback for GEPA reflection
  explanation?: string;

  // For RULER-style relative scoring
  relative_rank?: number;     // Rank within comparison group
  comparison_group_id?: string;
}
```

### 5.2 Simple LLM-Based Implementation

```typescript
class SimpleLLMRewardModel implements RewardModelAPI {
  private judgeModel: string = 'claude-sonnet-4-5-20250514';

  async score(
    trace: GeneratedTrajectory,
    agentVersion: AgentVersion
  ): Promise<RewardScore> {
    const prompt = `
You are evaluating an AI agent's performance. Score from 0.0 to 1.0.

## Agent's System Prompt
${agentVersion.prompt_template}

## Conversation Transcript
${this.formatConversation(trace.turns)}

## Tool Calls Made
${this.formatToolCalls(trace.toolCalls)}

## Evaluation Criteria

1. **Task Completion (40%)**: Did the agent help the user achieve their goal?
   - 1.0: Goal fully achieved
   - 0.5: Partial progress
   - 0.0: No progress or wrong direction

2. **Efficiency (30%)**: Were tool calls and responses efficient?
   - 1.0: Minimal steps, no redundancy
   - 0.5: Some unnecessary steps
   - 0.0: Many wasted steps or loops

3. **Quality (30%)**: Was the agent helpful and accurate?
   - 1.0: Clear, accurate, helpful
   - 0.5: Mostly helpful with minor issues
   - 0.0: Unhelpful or inaccurate

Return JSON:
{
  "score": <weighted average>,
  "components": {
    "task_completion": <0-1>,
    "efficiency": <0-1>,
    "quality": <0-1>
  },
  "explanation": "<brief explanation of score>"
}
`;

    const response = await this.llm.generate(prompt, {
      model: this.judgeModel,
      temperature: 0
    });

    return JSON.parse(response);
  }

  private formatConversation(turns: Turn[]): string {
    return turns.map(t =>
      `User: ${t.userMessage}\nAssistant: ${t.assistantResponse}`
    ).join('\n\n');
  }

  private formatToolCalls(calls: ToolCallRecord[]): string {
    return calls.map(c =>
      `- ${c.tool_name}(${JSON.stringify(c.arguments)}) → ${
        c.error ? `ERROR: ${c.error}` : JSON.stringify(c.result).slice(0, 200)
      }`
    ).join('\n');
  }
}
```

### 5.3 RULER-Style Comparative Scoring

```typescript
class RULERRewardModel implements RewardModelAPI {
  async scoreGroup(
    traces: GeneratedTrajectory[],
    agentVersion: AgentVersion
  ): Promise<RewardScore[]> {
    // Compare traces side-by-side
    const prompt = `
Compare these ${traces.length} agent trajectories for the same scenario.

## Agent System Prompt
${agentVersion.prompt_template}

## Trajectories
${traces.map((t, i) => `
### Trajectory ${i + 1}
${this.formatTrajectory(t)}
`).join('\n')}

Rank these trajectories from best to worst. Assign relative scores (0.0 to 1.0).

Return JSON array:
[
  { "trajectory_index": 0, "score": 0.95, "explanation": "Best because..." },
  { "trajectory_index": 1, "score": 0.70, "explanation": "Good but..." },
  ...
]
`;

    const response = await this.llm.generate(prompt);
    const rankings = JSON.parse(response);

    // Normalize with GRPO
    const scores = rankings.map(r => r.score);
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const std = Math.sqrt(
      scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
    );

    return rankings.map(r => ({
      score: r.score,
      advantage: (r.score - mean) / (std || 1),
      explanation: r.explanation,
      relative_rank: r.trajectory_index
    }));
  }
}
```

---

## Part 6: Determining What to Simulate

### 6.1 Simulation Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│           WHAT NEEDS TO BE SIMULATED?                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  For each tool in agent's toolkit:                              │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ Is tool stateless? │                                         │
│  └─────────┬──────────┘                                         │
│            │                                                     │
│       Yes  │  No (stateful)                                      │
│            │        │                                            │
│            ▼        ▼                                            │
│     ┌──────────┐  ┌──────────────────┐                          │
│     │ Cassette │  │ Do we have state │                          │
│     │ Replay   │  │ snapshots?       │                          │
│     │ ✅        │  └────────┬─────────┘                          │
│     └──────────┘           │                                     │
│                       Yes  │  No                                 │
│                            │   │                                 │
│                            ▼   ▼                                 │
│                    ┌──────────┐  ┌──────────────┐               │
│                    │ Snapshot │  │ Real execution│               │
│                    │ Replay   │  │ + Record state│               │
│                    │ ✅        │  │ ⚠️             │               │
│                    └──────────┘  └──────────────┘               │
│                                                                  │
│  For user simulation:                                           │
│                                                                  │
│  ┌─────────────────────────┐                                    │
│  │ Do we have enough       │                                    │
│  │ historical conversations│                                    │
│  │ (>100)?                 │                                    │
│  └───────────┬─────────────┘                                    │
│              │                                                   │
│         Yes  │  No                                               │
│              │   │                                               │
│              ▼   ▼                                               │
│      ┌──────────────┐  ┌──────────────────┐                     │
│      │ Extract      │  │ Use generic      │                     │
│      │ personas +   │  │ persona templates│                     │
│      │ goals        │  │ + synthetic goals│                     │
│      │ ✅            │  │ ⚠️                │                     │
│      └──────────────┘  └──────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Tool Classification

```typescript
interface ToolClassification {
  tool_name: string;
  category: 'pure' | 'stateful' | 'external' | 'side_effect';
  simulation_strategy: 'cassette' | 'snapshot' | 'mock' | 'real';
  state_dependencies: string[];
  data_requirements: DataRequirements;
}

// Classify tools based on observed behavior
function classifyTool(
  toolName: string,
  historicalCalls: ToolCallRecord[]
): ToolClassification {
  // Analyze call patterns
  const sameInputSameOutput = checkDeterminism(historicalCalls);
  const dependsOnState = checkStateDependency(historicalCalls);
  const hasExternalCalls = checkExternalDependency(toolName);
  const hasSideEffects = checkSideEffects(toolName);

  if (hasSideEffects) {
    return {
      tool_name: toolName,
      category: 'side_effect',
      simulation_strategy: 'mock',  // Never replay emails, payments, etc.
      state_dependencies: [],
      data_requirements: { min_cassettes: 0 }
    };
  }

  if (hasExternalCalls) {
    return {
      tool_name: toolName,
      category: 'external',
      simulation_strategy: sameInputSameOutput ? 'cassette' : 'real',
      state_dependencies: [],
      data_requirements: { min_cassettes: 50 }
    };
  }

  if (dependsOnState) {
    return {
      tool_name: toolName,
      category: 'stateful',
      simulation_strategy: 'snapshot',
      state_dependencies: identifyDependencies(historicalCalls),
      data_requirements: { min_snapshots: 20 }
    };
  }

  return {
    tool_name: toolName,
    category: 'pure',
    simulation_strategy: 'cassette',
    state_dependencies: [],
    data_requirements: { min_cassettes: 10 }
  };
}

// iofold tool classifications
const IOFOLD_TOOL_CLASSIFICATIONS: ToolClassification[] = [
  {
    tool_name: 'read_file',
    category: 'stateful',
    simulation_strategy: 'snapshot',
    state_dependencies: ['filesystem'],
    data_requirements: { min_snapshots: 10 }
  },
  {
    tool_name: 'write_file',
    category: 'stateful',
    simulation_strategy: 'snapshot',
    state_dependencies: ['filesystem'],
    data_requirements: { min_snapshots: 10 }
  },
  {
    tool_name: 'execute_python',
    category: 'stateful',
    simulation_strategy: 'snapshot',  // Depends on filesystem + Python state
    state_dependencies: ['filesystem', 'python_env'],
    data_requirements: { min_snapshots: 20 }
  },
  {
    tool_name: 'grep',
    category: 'stateful',
    simulation_strategy: 'snapshot',
    state_dependencies: ['filesystem'],
    data_requirements: { min_snapshots: 10 }
  },
  {
    tool_name: 'ls',
    category: 'stateful',
    simulation_strategy: 'snapshot',
    state_dependencies: ['filesystem'],
    data_requirements: { min_snapshots: 5 }
  }
];
```

### 6.3 Data Requirements Analysis

```typescript
interface DataRequirementsAnalysis {
  tool_name: string;
  current_cassettes: number;
  required_cassettes: number;
  coverage_percentage: number;
  recommendation: 'ready' | 'needs_more_data' | 'use_fallback';
}

async function analyzeDataRequirements(
  agentId: string
): Promise<DataRequirementsAnalysis[]> {
  const traces = await db.getTracesForAgent(agentId);
  const toolCalls = extractAllToolCalls(traces);

  const analysis: DataRequirementsAnalysis[] = [];

  for (const classification of IOFOLD_TOOL_CLASSIFICATIONS) {
    const callsForTool = toolCalls.filter(
      c => c.tool_name === classification.tool_name
    );

    const uniquePatterns = countUniquePatterns(callsForTool);
    const minRequired = classification.data_requirements.min_cassettes;

    analysis.push({
      tool_name: classification.tool_name,
      current_cassettes: uniquePatterns,
      required_cassettes: minRequired,
      coverage_percentage: Math.min(100, (uniquePatterns / minRequired) * 100),
      recommendation:
        uniquePatterns >= minRequired ? 'ready' :
        uniquePatterns >= minRequired * 0.5 ? 'needs_more_data' :
        'use_fallback'
    });
  }

  return analysis;
}
```

---

## Part 7: Implementation Roadmap

### Phase 1: MVP - Cassette-Based Simulation (Week 1-2)

**Goal:** Basic rollout generation with recorded tool responses

**Tasks:**
1. [ ] Create `tool_cassettes` table
2. [ ] Implement cassette extraction from traces
3. [ ] Build `CassetteToolSimulator` class
4. [ ] Create simple LLM reward model
5. [ ] Basic trajectory generator (sequential)
6. [ ] API endpoint: `POST /api/rollouts/generate`

**Deliverable:** Can generate trajectories using recorded tool responses

### Phase 2: User Simulation (Week 3-4)

**Goal:** LLM-based user simulation with persona diversity

**Tasks:**
1. [ ] Implement persona extraction from traces
2. [ ] Build `LLMUserSimulator` class
3. [ ] Create goal-oriented simulation
4. [ ] Add diversity sampling
5. [ ] Adversarial user injection (10%)
6. [ ] Goal progress tracking

**Deliverable:** Can generate diverse multi-turn conversations

### Phase 3: State Management (Week 5-6)

**Goal:** Handle stateful tools properly

**Tasks:**
1. [ ] Implement filesystem state snapshots
2. [ ] Build `StateManager` with checkpointing
3. [ ] Add state restoration for replay
4. [ ] Handle Python environment state
5. [ ] Create state diff tracking

**Deliverable:** Can replay stateful tool sequences accurately

### Phase 4: Parallelization & Scale (Week 7-8)

**Goal:** Generate trajectories at scale efficiently

**Tasks:**
1. [ ] Implement parallel trajectory generation
2. [ ] Add batching and caching
3. [ ] Cost optimization (model tiering)
4. [ ] Failure handling and retries
5. [ ] Progress tracking and monitoring
6. [ ] Storage optimization (hot/warm/cold)

**Deliverable:** Can generate 1000+ trajectories/hour efficiently

---

## Part 8: Database Schema Additions

```sql
-- Tool cassettes for replay
CREATE TABLE tool_cassettes (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  arguments_hash TEXT NOT NULL,
  arguments TEXT NOT NULL,
  result TEXT,
  error TEXT,
  latency_ms INTEGER,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_trace_id TEXT,
  call_count INTEGER DEFAULT 1,

  UNIQUE(tool_name, arguments_hash),
  FOREIGN KEY (source_trace_id) REFERENCES traces(id)
);

-- User personas extracted from traces
CREATE TABLE user_personas (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  expertise_level TEXT,
  communication_style TEXT,
  personality_traits TEXT,         -- JSON
  typical_goals TEXT,              -- JSON array
  vocabulary_sample TEXT,          -- JSON array
  avg_message_length REAL,
  source_trace_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- User goals/scenarios for simulation
CREATE TABLE simulation_scenarios (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  success_criteria TEXT,
  constraints TEXT,                -- JSON
  initial_state TEXT,              -- JSON
  source_trace_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Generated trajectories
CREATE TABLE generated_trajectories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_version_id TEXT NOT NULL,
  scenario_id TEXT,
  persona_id TEXT,

  -- Trajectory data
  turns TEXT NOT NULL,             -- JSON array of turns
  tool_calls TEXT NOT NULL,        -- JSON array of tool calls
  final_state TEXT,                -- JSON

  -- Metadata
  total_tokens INTEGER,
  total_latency_ms INTEGER,
  tool_call_count INTEGER,
  turn_count INTEGER,
  simulation_mode TEXT,

  -- Reward
  reward_score REAL,
  reward_components TEXT,          -- JSON
  reward_explanation TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id),
  FOREIGN KEY (scenario_id) REFERENCES simulation_scenarios(id),
  FOREIGN KEY (persona_id) REFERENCES user_personas(id)
);

-- Rollout batches
CREATE TABLE rollout_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_version_id TEXT NOT NULL,

  -- Configuration
  config TEXT NOT NULL,            -- JSON: EnvironmentConfig
  num_requested INTEGER NOT NULL,

  -- Status
  status TEXT DEFAULT 'pending',
  num_completed INTEGER DEFAULT 0,
  num_failed INTEGER DEFAULT 0,

  -- Results
  avg_reward REAL,
  reward_std REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id)
);

-- Indexes
CREATE INDEX idx_cassettes_tool ON tool_cassettes(tool_name);
CREATE INDEX idx_trajectories_agent ON generated_trajectories(agent_version_id);
CREATE INDEX idx_trajectories_reward ON generated_trajectories(reward_score);
CREATE INDEX idx_batches_status ON rollout_batches(status);
```

---

## Part 9: Key Research Sources

### Environment Simulation
- LangGraph checkpointing and persistence patterns
- AgentRR: Record & Replay for LLM Agents
- REAL benchmark: Deterministic web environment simulation
- Braintrust: Trace-driven evaluation with golden datasets

### Tool Simulation
- VCR/pytest-recording for HTTP cassette replay
- Modelizer framework for learned API behavior
- HDBSCAN clustering for tool call patterns
- Docker sandboxing for safe tool execution

### User Simulation
- UserSimCRS v2: Controllable user simulators
- DuetSim: Dual LLM pattern (generator + verifier)
- RecUserSim: Fine-grained user behavior simulation
- DAUS: Domain-aware hallucination mitigation

### Trajectory Generation at Scale
- Ray RLlib: Actor-learner separation architecture
- OpenPipe ART: GRPO-based agent training
- AgentGym-RL: Multi-turn RL framework
- IMPALA/SEED RL: High-throughput trajectory generation

### Reward Modeling
- RULER: Relative scoring without labels
- GEPA: Natural language reflection as reward signal
- Self-Rewarding Language Models
- Contrastive Preference Learning

---

## Summary

The rollout generation module needs to:

1. **Ingest traces** → Extract tool cassettes, user personas, and goals
2. **Classify tools** → Determine simulation strategy per tool (cassette/snapshot/real)
3. **Simulate users** → LLM-as-user with extracted personas and goals
4. **Manage state** → Checkpoint filesystem and environment state
5. **Generate trajectories** → Parallel execution with diversity sampling
6. **Score with reward model** → LLM-based scoring API (0-1)

**Key insight:** Start with cassette replay (80% value, 20% effort), add learned models only for tools with high variance or coverage gaps.
