#!/usr/bin/env tsx
/**
 * Test Data Generator Script
 *
 * Generates realistic test data for the iofold platform including:
 * - Integrations
 * - Agents with versions
 * - Traces with various system prompts
 * - Feedback linked to agents
 * - Evals with executions
 *
 * Usage:
 *   npx tsx scripts/generate-test-data.ts [--api-url=http://localhost:8787] [--traces=50]
 */

import crypto from 'crypto';

// Configuration
const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] || 'http://localhost:8787';
const TRACE_COUNT = parseInt(process.argv.find(a => a.startsWith('--traces='))?.split('=')[1] || '50');
const WORKSPACE_ID = 'workspace_default';

// Sample system prompts for different agent types
const SYSTEM_PROMPTS = [
  {
    name: 'Customer Support Agent',
    template: `You are a helpful customer support agent for {{company_name}}.

Your role is to:
- Answer customer questions about products and services
- Help resolve issues with orders and shipping
- Maintain a friendly, professional tone

Company policies:
- Refunds within {{refund_days}} days
- Free shipping over ${{free_shipping_threshold}}

Always be helpful and aim to resolve issues in one interaction.`,
    variations: [
      { company_name: 'TechCorp', refund_days: '30', free_shipping_threshold: '50' },
      { company_name: 'ShopMart', refund_days: '14', free_shipping_threshold: '75' },
      { company_name: 'GadgetWorld', refund_days: '60', free_shipping_threshold: '100' },
    ]
  },
  {
    name: 'Code Review Assistant',
    template: `You are a senior software engineer conducting code reviews.

Focus areas:
- Code quality and best practices
- Security vulnerabilities
- Performance issues
- {{language}} specific patterns

Programming language: {{language}}
Review style: {{review_style}}

Provide constructive feedback with specific suggestions for improvement.`,
    variations: [
      { language: 'TypeScript', review_style: 'thorough' },
      { language: 'Python', review_style: 'security-focused' },
      { language: 'Go', review_style: 'performance-focused' },
    ]
  },
  {
    name: 'Writing Assistant',
    template: `You are a professional writing assistant specializing in {{writing_type}}.

Your capabilities:
- Improve clarity and readability
- Fix grammar and spelling errors
- Adjust tone to match target audience
- Optimize for {{target_audience}}

Writing style: {{tone}}
Word limit guidance: {{word_limit}}

Help users create compelling, well-structured content.`,
    variations: [
      { writing_type: 'blog posts', target_audience: 'tech professionals', tone: 'conversational', word_limit: '800-1200' },
      { writing_type: 'marketing copy', target_audience: 'consumers', tone: 'persuasive', word_limit: '200-400' },
      { writing_type: 'technical documentation', target_audience: 'developers', tone: 'formal', word_limit: '1500-3000' },
    ]
  },
  {
    name: 'Data Analysis Agent',
    template: `You are a data analyst assistant helping with {{data_domain}} data.

Your skills:
- Data cleaning and preprocessing
- Statistical analysis
- Visualization recommendations
- Insight generation

Tools available: {{tools}}
Output format: {{output_format}}

Explain findings in clear, non-technical language when needed.`,
    variations: [
      { data_domain: 'sales', tools: 'SQL, Python, Excel', output_format: 'charts and summary' },
      { data_domain: 'user behavior', tools: 'Mixpanel, SQL', output_format: 'dashboard-ready' },
      { data_domain: 'financial', tools: 'Excel, R', output_format: 'detailed report' },
    ]
  },
  {
    name: 'Research Assistant',
    template: `You are a research assistant specializing in {{research_field}}.

Research approach:
- Systematic literature review
- Source verification
- Citation management

Academic level: {{academic_level}}
Citation style: {{citation_style}}

Provide accurate, well-sourced information with proper citations.`,
    variations: [
      { research_field: 'machine learning', academic_level: 'graduate', citation_style: 'IEEE' },
      { research_field: 'economics', academic_level: 'undergraduate', citation_style: 'APA' },
      { research_field: 'medicine', academic_level: 'professional', citation_style: 'Vancouver' },
    ]
  }
];

// Sample user messages for generating traces
const USER_MESSAGES = {
  'Customer Support Agent': [
    'I need to return my order from last week',
    'When will my package arrive?',
    'Can I get a refund for a damaged item?',
    'How do I track my shipment?',
    'I want to change my shipping address',
    'What is your return policy?',
    'My order is missing an item',
    'Can I cancel my order?'
  ],
  'Code Review Assistant': [
    'Please review this function for any issues',
    'Is there a more efficient way to write this?',
    'Are there any security concerns in this code?',
    'How can I improve the error handling?',
    'Does this follow best practices?',
    'Can you suggest refactoring improvements?'
  ],
  'Writing Assistant': [
    'Help me improve this paragraph',
    'Make this email more professional',
    'Can you make this shorter and clearer?',
    'Add more detail to this section',
    'Check this for grammar errors',
    'Rewrite this for a technical audience'
  ],
  'Data Analysis Agent': [
    'What trends do you see in this data?',
    'Can you help me clean this dataset?',
    'What visualization would work best here?',
    'Are there any outliers I should investigate?',
    'Summarize the key insights from this report'
  ],
  'Research Assistant': [
    'Find recent papers on this topic',
    'What are the main theories in this field?',
    'Can you summarize this research paper?',
    'What are the limitations of this study?',
    'Help me form a research question'
  ]
};

// Sample assistant responses
const ASSISTANT_RESPONSES = {
  good: [
    'I understand your concern. Let me help you with that right away.',
    'Great question! Here is what I found:',
    'Based on the information provided, I recommend the following:',
    'I have analyzed the data and here are the key findings:',
    'Here is a detailed breakdown of your request:'
  ],
  bad: [
    'I cannot help with that.',
    'Error processing your request.',
    'I do not understand the question.',
    'That is outside my capabilities.',
    'Please rephrase your question.'
  ]
};

// Helper functions
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

async function apiRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': WORKSPACE_ID
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

// Data generation functions
async function createIntegration(): Promise<string> {
  console.log('Creating test integration...');

  const result = await apiRequest('/api/integrations', 'POST', {
    platform: 'langfuse',
    api_key: 'test-api-key-' + crypto.randomUUID(),
    config: {
      base_url: 'https://cloud.langfuse.com',
      project_id: 'test-project'
    }
  });

  console.log(`  Created integration: ${result.id}`);
  return result.id;
}

async function createAgent(name: string, description: string): Promise<any> {
  const result = await apiRequest('/api/agents', 'POST', {
    name,
    description
  });

  console.log(`  Created agent: ${result.name} (${result.id})`);
  return result;
}

async function createAgentVersion(agentId: string, promptTemplate: string, variables: string[]): Promise<any> {
  const result = await apiRequest(`/api/agents/${agentId}/versions`, 'POST', {
    prompt_template: promptTemplate,
    variables,
    source: 'manual'
  });

  console.log(`    Created version ${result.version} for agent`);
  return result;
}

async function promoteAgentVersion(agentId: string, version: number): Promise<void> {
  await apiRequest(`/api/agents/${agentId}/versions/${version}/promote`, 'POST');
  console.log(`    Promoted version ${version} to active`);
}

async function createTrace(integrationId: string, agentVersionId: string | null, traceData: any): Promise<string> {
  // Insert trace directly via the internal endpoint or create via import
  // For simplicity, we'll create a synthetic external ID
  const traceId = generateId('trace');
  const externalId = `ext_${crypto.randomUUID()}`;

  // We need to insert directly since there's no direct trace creation API
  // Using the traces endpoint with raw SQL would be ideal, but we'll simulate import
  const result = await apiRequest('/api/traces/import', 'POST', {
    integration_id: integrationId,
    limit: 1,
    // This will fail for actual import, so we'll use direct DB insertion instead
  });

  return traceId;
}

async function submitFeedback(agentId: string, traceId: string, rating: 'positive' | 'negative' | 'neutral', detail?: string): Promise<any> {
  const result = await apiRequest('/api/feedback', 'POST', {
    agent_id: agentId,
    trace_id: traceId,
    rating,
    rating_detail: detail
  });

  return result;
}

interface TraceData {
  step_id: string;
  trace_id: string;
  timestamp: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  tool_calls: any[];
  input: any;
  output: any;
  metadata: Record<string, any>;
}

function generateTraceData(
  systemPrompt: string,
  userMessages: string[],
  isGoodResponse: boolean
): TraceData {
  const traceId = generateId('trace');
  const userMessage = randomChoice(userMessages);
  const assistantResponse = randomChoice(isGoodResponse ? ASSISTANT_RESPONSES.good : ASSISTANT_RESPONSES.bad);

  return {
    step_id: generateId('step'),
    trace_id: traceId,
    timestamp: new Date(Date.now() - randomInt(0, 7 * 24 * 60 * 60 * 1000)).toISOString(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantResponse }
    ],
    tool_calls: [],
    input: { user_message: userMessage },
    output: { response: assistantResponse },
    metadata: {
      model: randomChoice(['gpt-4', 'claude-3', 'gpt-4-turbo']),
      latency_ms: randomInt(100, 2000),
      token_count: randomInt(50, 500)
    }
  };
}

// Main data generation
async function generateTestData() {
  console.log('='.repeat(60));
  console.log('iofold Test Data Generator');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`Target traces: ${TRACE_COUNT}`);
  console.log('');

  try {
    // Step 1: Create integration
    console.log('\n[1/5] Creating integration...');
    let integrationId: string;
    try {
      integrationId = await createIntegration();
    } catch (error) {
      console.log('  Using existing integration or creating with fallback...');
      // Try to list and use existing
      const integrations = await apiRequest('/api/integrations');
      if (integrations.integrations?.length > 0) {
        integrationId = integrations.integrations[0].id;
        console.log(`  Using existing integration: ${integrationId}`);
      } else {
        throw error;
      }
    }

    // Step 2: Create agents with versions
    console.log('\n[2/5] Creating agents and versions...');
    const agents: Array<{ agent: any; prompt: typeof SYSTEM_PROMPTS[0]; variation: any }> = [];

    for (const promptConfig of SYSTEM_PROMPTS) {
      const agent = await createAgent(
        promptConfig.name,
        `Test agent for ${promptConfig.name.toLowerCase()} scenarios`
      );

      // Create multiple versions for each agent
      for (let i = 0; i < Math.min(3, promptConfig.variations.length); i++) {
        const variation = promptConfig.variations[i];
        const filledPrompt = fillTemplate(promptConfig.template, variation);
        const variables = Object.keys(variation);

        const version = await createAgentVersion(agent.id, filledPrompt, variables);

        // Promote the first version
        if (i === 0) {
          await promoteAgentVersion(agent.id, version.version);
        }
      }

      // Confirm the agent
      await apiRequest(`/api/agents/${agent.id}/confirm`, 'POST', {
        name: promptConfig.name,
        description: `Confirmed ${promptConfig.name.toLowerCase()} agent`
      });
      console.log(`    Confirmed agent: ${agent.name}`);

      agents.push({ agent, prompt: promptConfig, variation: promptConfig.variations[0] });
    }

    // Step 3: Note - Agents are used directly for feedback (no separate eval sets)
    console.log('\n[3/5] Preparing feedback for agents...');
    // Agents are already created, feedback will be linked directly to them

    // Step 4: Generate traces and insert directly
    console.log('\n[4/5] Generating and inserting traces...');

    // Since we can't import directly without Langfuse, we'll insert traces via direct DB access
    // For now, let's create a SQL script that can be run separately
    const tracesPerAgent = Math.floor(TRACE_COUNT / agents.length);
    const traces: Array<{ id: string; integrationId: string; agentIndex: number; isGood: boolean; traceData: TraceData }> = [];

    for (let agentIndex = 0; agentIndex < agents.length; agentIndex++) {
      const { prompt, variation } = agents[agentIndex];
      const filledPrompt = fillTemplate(prompt.template, variation);
      const userMessages = USER_MESSAGES[prompt.name as keyof typeof USER_MESSAGES] || USER_MESSAGES['Customer Support Agent'];

      for (let i = 0; i < tracesPerAgent; i++) {
        // 70% good responses, 30% bad for realistic distribution
        const isGood = Math.random() > 0.3;
        const traceData = generateTraceData(filledPrompt, userMessages, isGood);

        traces.push({
          id: traceData.trace_id,
          integrationId,
          agentIndex,
          isGood,
          traceData
        });
      }
    }

    console.log(`  Generated ${traces.length} trace records`);

    // Output SQL for direct insertion
    const sqlFile = 'scripts/insert-test-traces.sql';
    let sql = '-- Auto-generated test data\n-- Run with: wrangler d1 execute iofold_validation --local --file=scripts/insert-test-traces.sql\n\n';

    // Insert traces
    sql += '-- Traces\n';
    for (const trace of traces) {
      const traceDataJson = JSON.stringify(trace.traceData).replace(/'/g, "''");
      sql += `INSERT OR IGNORE INTO traces (id, workspace_id, integration_id, external_id, trace_data, assignment_status) VALUES ('${trace.id}', '${WORKSPACE_ID}', '${trace.integrationId}', 'ext_${trace.id}', '${traceDataJson}', 'unassigned');\n`;
    }

    // Write SQL file
    await Bun.write(sqlFile, sql);
    console.log(`  Generated SQL file: ${sqlFile}`);

    // Step 5: Create feedback for agents
    console.log('\n[5/5] Creating feedback records...');

    // We can't create feedback without traces in DB, so output feedback SQL too
    sql += '\n-- Feedback\n';

    for (let i = 0; i < agents.length; i++) {
      const { agent, prompt } = agents[i];
      const agentTraces = traces.filter(t => t.agentIndex === i);

      // Add feedback for first 10 traces (or all if fewer)
      const feedbackTraces = agentTraces.slice(0, 10);

      for (const trace of feedbackTraces) {
        const feedbackId = generateId('feedback');
        const rating = trace.isGood ? 'positive' : (Math.random() > 0.5 ? 'negative' : 'neutral');
        const detail = trace.isGood ? 'Good response' : 'Could be improved';

        sql += `INSERT OR IGNORE INTO feedback (id, agent_id, trace_id, rating, rating_detail) VALUES ('${feedbackId}', '${agent.id}', '${trace.id}', '${rating}', '${detail}');\n`;
      }

      console.log(`  Added ${feedbackTraces.length} feedback records for ${prompt.name}`);
    }

    // Write final SQL file
    await Bun.write(sqlFile, sql);

    console.log('\n' + '='.repeat(60));
    console.log('Test Data Generation Complete!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Run the SQL file to insert traces and feedback:');
    console.log(`   npx wrangler d1 execute iofold_validation --local --file=${sqlFile}`);
    console.log('\n2. Start the development server:');
    console.log('   npm run dev');
    console.log('\n3. Visit http://localhost:3000 to explore the test data');
    console.log('');

    // Print summary
    console.log('Summary:');
    console.log(`  - Integration: ${integrationId}`);
    console.log(`  - Agents: ${agents.length}`);
    console.log(`  - Traces: ${traces.length}`);
    console.log(`  - Feedback records: ${agents.length * 10}`);

  } catch (error) {
    console.error('\nError generating test data:', error);
    process.exit(1);
  }
}

// Run the generator
generateTestData();
