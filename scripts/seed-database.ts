#!/usr/bin/env npx tsx
/**
 * Comprehensive Database Seed Script
 *
 * Generates realistic test data for the iofold platform including:
 * - Integrations
 * - Agents with multiple versions
 * - Traces with realistic conversation data
 * - Feedback linked to agents and traces
 * - Evals with execution results
 * - Jobs with various statuses
 *
 * Usage:
 *   npx tsx scripts/seed-database.ts [--api-url=http://localhost:8787] [--traces=100]
 *
 * The script uses the API directly for most operations and outputs SQL for
 * data that requires direct DB insertion.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] || 'http://localhost:8787';
const TRACE_COUNT = parseInt(process.argv.find(a => a.startsWith('--traces='))?.split('=')[1] || '100');
const WORKSPACE_ID = 'workspace_default';

// ============================================================================
// Sample Data Templates
// ============================================================================

const AGENT_TEMPLATES = [
  {
    name: 'Customer Support Agent',
    description: 'AI assistant for handling customer inquiries, returns, and support tickets',
    promptTemplate: 'You are a helpful customer support agent for {{company_name}}.\n\nYour role is to:\n- Answer customer questions about products and services\n- Help resolve issues with orders and shipping\n- Maintain a friendly, professional tone\n\nCompany policies:\n- Refunds within {{refund_days}} days\n- Free shipping over ${{free_shipping_threshold}}\n\nAlways be helpful and aim to resolve issues in one interaction.',
    variables: ['company_name', 'refund_days', 'free_shipping_threshold'],
    variations: [
      { company_name: 'TechCorp', refund_days: '30', free_shipping_threshold: '50' },
      { company_name: 'ShopMart', refund_days: '14', free_shipping_threshold: '75' },
      { company_name: 'GadgetWorld', refund_days: '60', free_shipping_threshold: '100' },
    ],
    userMessages: [
      'I need to return my order from last week',
      'When will my package arrive?',
      'Can I get a refund for a damaged item?',
      'How do I track my shipment?',
      'I want to change my shipping address',
      'What is your return policy?',
      'My order is missing an item',
      'Can I cancel my order?',
      'The product I received is defective',
      'I was charged twice for my order',
    ],
  },
  {
    name: 'Code Review Assistant',
    description: 'Senior software engineer providing code reviews with focus on quality and security',
    promptTemplate: 'You are a senior software engineer conducting code reviews.\n\nFocus areas:\n- Code quality and best practices\n- Security vulnerabilities\n- Performance issues\n- {{language}} specific patterns\n\nProgramming language: {{language}}\nReview style: {{review_style}}\n\nProvide constructive feedback with specific suggestions for improvement.',
    variables: ['language', 'review_style'],
    variations: [
      { language: 'TypeScript', review_style: 'thorough' },
      { language: 'Python', review_style: 'security-focused' },
      { language: 'Go', review_style: 'performance-focused' },
    ],
    userMessages: [
      'Please review this function for any issues',
      'Is there a more efficient way to write this?',
      'Are there any security concerns in this code?',
      'How can I improve the error handling?',
      'Does this follow best practices?',
      'Can you suggest refactoring improvements?',
      'Review this API endpoint implementation',
      'Check this database query for N+1 issues',
    ],
  },
  {
    name: 'Writing Assistant',
    description: 'Professional writing assistant for various content types',
    promptTemplate: 'You are a professional writing assistant specializing in {{writing_type}}.\n\nYour capabilities:\n- Improve clarity and readability\n- Fix grammar and spelling errors\n- Adjust tone to match target audience\n- Optimize for {{target_audience}}\n\nWriting style: {{tone}}\nWord limit guidance: {{word_limit}}\n\nHelp users create compelling, well-structured content.',
    variables: ['writing_type', 'target_audience', 'tone', 'word_limit'],
    variations: [
      { writing_type: 'blog posts', target_audience: 'tech professionals', tone: 'conversational', word_limit: '800-1200' },
      { writing_type: 'marketing copy', target_audience: 'consumers', tone: 'persuasive', word_limit: '200-400' },
      { writing_type: 'technical documentation', target_audience: 'developers', tone: 'formal', word_limit: '1500-3000' },
    ],
    userMessages: [
      'Help me improve this paragraph',
      'Make this email more professional',
      'Can you make this shorter and clearer?',
      'Add more detail to this section',
      'Check this for grammar errors',
      'Rewrite this for a technical audience',
      'Create an outline for this topic',
      'Summarize this article in 3 sentences',
    ],
  },
  {
    name: 'Data Analysis Agent',
    description: 'Data analyst assistant for insights and visualization recommendations',
    promptTemplate: 'You are a data analyst assistant helping with {{data_domain}} data.\n\nYour skills:\n- Data cleaning and preprocessing\n- Statistical analysis\n- Visualization recommendations\n- Insight generation\n\nTools available: {{tools}}\nOutput format: {{output_format}}\n\nExplain findings in clear, non-technical language when needed.',
    variables: ['data_domain', 'tools', 'output_format'],
    variations: [
      { data_domain: 'sales', tools: 'SQL, Python, Excel', output_format: 'charts and summary' },
      { data_domain: 'user behavior', tools: 'Mixpanel, SQL', output_format: 'dashboard-ready' },
      { data_domain: 'financial', tools: 'Excel, R', output_format: 'detailed report' },
    ],
    userMessages: [
      'What trends do you see in this data?',
      'Can you help me clean this dataset?',
      'What visualization would work best here?',
      'Are there any outliers I should investigate?',
      'Summarize the key insights from this report',
      'Help me create a pivot table',
      'Calculate the conversion rate from this data',
      'Find correlations between these variables',
    ],
  },
  {
    name: 'Research Assistant',
    description: 'Research assistant for academic and professional research tasks',
    promptTemplate: 'You are a research assistant specializing in {{research_field}}.\n\nResearch approach:\n- Systematic literature review\n- Source verification\n- Citation management\n\nAcademic level: {{academic_level}}\nCitation style: {{citation_style}}\n\nProvide accurate, well-sourced information with proper citations.',
    variables: ['research_field', 'academic_level', 'citation_style'],
    variations: [
      { research_field: 'machine learning', academic_level: 'graduate', citation_style: 'IEEE' },
      { research_field: 'economics', academic_level: 'undergraduate', citation_style: 'APA' },
      { research_field: 'medicine', academic_level: 'professional', citation_style: 'Vancouver' },
    ],
    userMessages: [
      'Find recent papers on this topic',
      'What are the main theories in this field?',
      'Can you summarize this research paper?',
      'What are the limitations of this study?',
      'Help me form a research question',
      'Compare these two methodologies',
      'What is the current consensus on this topic?',
      'Cite this source in the correct format',
    ],
  },
];

// Response templates
const GOOD_RESPONSES = [
  'I understand your concern and would be happy to help you with that. Let me provide a detailed solution.',
  'Great question! Based on the information you provided, here is my recommendation:',
  'Thank you for reaching out. I have analyzed your request and here are the key findings:',
  'I can definitely assist you with this. Here is a step-by-step approach:',
  'After reviewing the details, I recommend the following course of action:',
  'This is an excellent question. Let me break down the answer for you:',
  'I have thoroughly examined your situation and here is my assessment:',
  'Based on best practices, here is the most effective solution:',
];

const BAD_RESPONSES = [
  'I cannot help with that request.',
  'Error processing your request. Please try again.',
  'I do not understand what you are asking.',
  'That is outside my current capabilities.',
  'Please rephrase your question more clearly.',
  'I am unable to provide assistance with this.',
  'This request cannot be processed.',
  'Sorry, I encountered an issue.',
];

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo: number): Date {
  const now = new Date();
  const msAgo = randomInt(0, daysAgo * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - msAgo);
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

async function apiRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': WORKSPACE_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status} at ${endpoint}: ${errorText}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

// ============================================================================
// Data Generation Functions
// ============================================================================

async function createIntegration(): Promise<string> {
  console.log('📦 Creating integration...');

  try {
    const result = await apiRequest('/api/integrations', 'POST', {
      platform: 'langfuse',
      name: 'Langfuse Integration',
      api_key: 'lf_pk_' + crypto.randomUUID(),
      config: {
        base_url: 'https://cloud.langfuse.com',
        project_id: 'test-project-' + randomInt(1000, 9999),
      },
    });

    console.log(`   ✓ Created integration: ${result.id}`);
    return result.id;
  } catch (error: any) {
    // Try to use existing integration
    console.log('   ⚠ Trying to use existing integration...');
    const integrations = await apiRequest('/api/integrations');
    if (integrations.integrations?.length > 0) {
      const existing = integrations.integrations[0];
      console.log(`   ✓ Using existing integration: ${existing.id}`);
      return existing.id;
    }
    throw error;
  }
}

async function createAgent(template: typeof AGENT_TEMPLATES[0]): Promise<any> {
  const result = await apiRequest('/api/agents', 'POST', {
    name: template.name,
    description: template.description,
  });

  console.log(`   ✓ Created agent: ${result.name} (${result.id})`);
  return result;
}

async function createAgentVersion(
  agentId: string,
  promptTemplate: string,
  variables: string[],
  source: string = 'manual'
): Promise<any> {
  const result = await apiRequest(`/api/agents/${agentId}/versions`, 'POST', {
    prompt_template: promptTemplate,
    variables,
    source,
  });

  return result;
}

async function promoteAgentVersion(agentId: string, version: number): Promise<void> {
  await apiRequest(`/api/agents/${agentId}/versions/${version}/promote`, 'POST');
}

// Note: confirmAgent is not needed since POST /api/agents creates agents with 'confirmed' status

function generateTraceSteps(
  systemPrompt: string,
  userMessage: string,
  assistantResponse: string,
  includeToolCalls: boolean = false
): any[] {
  const steps = [
    {
      step_id: generateId('step'),
      step_type: 'llm',
      timestamp: new Date().toISOString(),
      messages_added: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantResponse },
      ],
      tool_calls: includeToolCalls
        ? [
            {
              id: generateId('tool'),
              name: randomChoice(['search', 'lookup', 'calculate', 'format']),
              arguments: { query: userMessage.slice(0, 50) },
              result: 'Tool executed successfully',
            },
          ]
        : [],
      input: { user_message: userMessage },
      output: { response: assistantResponse },
      metadata: {
        model: randomChoice(['gpt-4', 'gpt-4-turbo', 'claude-3-opus', 'claude-3-sonnet']),
        latency_ms: randomInt(200, 3000),
        tokens: {
          prompt: randomInt(100, 500),
          completion: randomInt(50, 300),
          total: randomInt(150, 800),
        },
      },
    },
  ];

  return steps;
}

async function createTrace(
  integrationId: string,
  template: typeof AGENT_TEMPLATES[0],
  variation: Record<string, string>,
  isGoodResponse: boolean
): Promise<any> {
  const systemPrompt = fillTemplate(template.promptTemplate, variation);
  const userMessage = randomChoice(template.userMessages);
  const assistantResponse = isGoodResponse
    ? randomChoice(GOOD_RESPONSES) + '\n\n' + generateDetailedResponse(template.name, userMessage)
    : randomChoice(BAD_RESPONSES);

  const timestamp = randomDate(30).toISOString();
  const steps = generateTraceSteps(
    systemPrompt,
    userMessage,
    assistantResponse,
    Math.random() > 0.7 // 30% chance of tool calls
  );

  const result = await apiRequest('/api/traces', 'POST', {
    integration_id: integrationId,
    timestamp,
    steps,
    input_preview: userMessage.slice(0, 200),
    output_preview: assistantResponse.slice(0, 200),
    has_errors: !isGoodResponse && Math.random() > 0.7,
  });

  return {
    ...result,
    isGoodResponse,
  };
}

function generateDetailedResponse(agentType: string, userMessage: string): string {
  const responses: Record<string, string[]> = {
    'Customer Support Agent': [
      'I have initiated a return request for your order. You will receive an email confirmation shortly with the return shipping label.',
      'Your package is currently in transit and expected to arrive within 2-3 business days. You can track it using the link in your confirmation email.',
      'I have processed a full refund for the damaged item. The amount will be credited to your original payment method within 5-7 business days.',
    ],
    'Code Review Assistant': [
      'The code looks generally well-structured. I noticed a few potential improvements:\n1. Consider adding null checks on line 15\n2. The function could benefit from memoization\n3. Add unit tests for edge cases',
      'Security concerns identified:\n- SQL injection vulnerability in the query builder\n- Missing input sanitization\n- Consider using parameterized queries',
    ],
    'Writing Assistant': [
      'Here is the revised version with improved clarity and flow:\n\n[Revised text would appear here]\n\nKey changes made:\n- Shortened sentences for readability\n- Added transitional phrases\n- Fixed grammatical issues',
    ],
    'Data Analysis Agent': [
      'Key trends identified in the data:\n1. 15% increase in sales over the past quarter\n2. Strong correlation between marketing spend and conversions\n3. Seasonal patterns suggest peak activity in Q4',
    ],
    'Research Assistant': [
      'Based on recent literature, the current consensus suggests:\n\n1. Smith et al. (2024) found significant evidence supporting...\n2. The meta-analysis by Johnson (2023) indicates...\n3. Further research is needed in the area of...',
    ],
  };

  return randomChoice(responses[agentType] || responses['Customer Support Agent']);
}

async function createFeedback(agentId: string, traceId: string, rating: string): Promise<any> {
  const details: Record<string, string[]> = {
    positive: [
      'Great response, very helpful!',
      'Exactly what the user needed',
      'Clear and comprehensive',
      'Perfect solution provided',
      'Excellent customer service',
    ],
    negative: [
      'Response was unhelpful',
      'Did not address the question',
      'Too vague, needs more detail',
      'Incorrect information provided',
      'Tone was inappropriate',
    ],
    neutral: [
      'Acceptable response',
      'Could be improved',
      'Partial answer given',
      'Needs follow-up',
      'Average quality',
    ],
  };

  const result = await apiRequest('/api/feedback', 'POST', {
    agent_id: agentId,
    trace_id: traceId,
    rating,
    rating_detail: randomChoice(details[rating] || details.neutral),
  });

  return result;
}

interface GeneratedData {
  integrationId: string;
  agents: Array<{
    agent: any;
    template: typeof AGENT_TEMPLATES[0];
    variations: Record<string, string>[];
    traces: any[];
  }>;
  feedbackCounts: Record<string, number>;
  totalTraces: number;
}

async function generateAllData(): Promise<GeneratedData> {
  console.log('='.repeat(60));
  console.log('🌱 iofold Database Seeder');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`Target traces: ${TRACE_COUNT}`);
  console.log('');

  // Step 1: Create integration
  console.log('\n[1/5] Creating integration...');
  const integrationId = await createIntegration();

  // Step 2: Create agents with versions
  console.log('\n[2/5] Creating agents and versions...');
  const agents: GeneratedData['agents'] = [];

  for (const template of AGENT_TEMPLATES) {
    const agent = await createAgent(template);

    // Create multiple versions for each agent
    for (let i = 0; i < template.variations.length; i++) {
      const variation = template.variations[i];
      const filledPrompt = fillTemplate(template.promptTemplate, variation);

      const version = await createAgentVersion(
        agent.id,
        filledPrompt,
        template.variables,
        i === 0 ? 'discovered' : 'manual'
      );

      console.log(`      Created version ${version.version} for ${template.name}`);

      // Promote the latest version
      if (i === template.variations.length - 1) {
        await promoteAgentVersion(agent.id, version.version);
        console.log(`      Promoted version ${version.version} to active`);
      }
    }

    // Agents created via POST are automatically confirmed
    console.log(`      Agent ${template.name} is ready`);

    agents.push({
      agent,
      template,
      variations: template.variations,
      traces: [],
    });
  }

  // Step 3: Generate traces for each agent
  console.log('\n[3/5] Generating traces...');
  const tracesPerAgent = Math.floor(TRACE_COUNT / agents.length);
  let totalTraces = 0;

  for (const agentData of agents) {
    console.log(`   Generating ${tracesPerAgent} traces for ${agentData.template.name}...`);

    for (let i = 0; i < tracesPerAgent; i++) {
      // 75% good responses, 25% bad for realistic distribution
      const isGoodResponse = Math.random() > 0.25;
      const variation = randomChoice(agentData.variations);

      const trace = await createTrace(
        integrationId,
        agentData.template,
        variation,
        isGoodResponse
      );

      agentData.traces.push(trace);
      totalTraces++;

      // Progress indicator
      if ((i + 1) % 10 === 0) {
        process.stdout.write(`      ${i + 1}/${tracesPerAgent} traces created\r`);
      }
    }
    console.log(`   ✓ Created ${tracesPerAgent} traces for ${agentData.template.name}`);
  }

  // Step 4: Create feedback for traces
  console.log('\n[4/5] Creating feedback...');
  const feedbackCounts: Record<string, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  for (const agentData of agents) {
    // Create feedback for 60% of traces
    const feedbackCount = Math.floor(agentData.traces.length * 0.6);
    const tracesWithFeedback = agentData.traces
      .sort(() => Math.random() - 0.5)
      .slice(0, feedbackCount);

    console.log(`   Adding feedback for ${feedbackCount} traces of ${agentData.template.name}...`);

    for (const trace of tracesWithFeedback) {
      // Rating based on response quality with some noise
      let rating: string;
      if (trace.isGoodResponse) {
        rating = Math.random() > 0.15 ? 'positive' : 'neutral';
      } else {
        rating = Math.random() > 0.2 ? 'negative' : 'neutral';
      }

      try {
        await createFeedback(agentData.agent.id, trace.id, rating);
        feedbackCounts[rating]++;
      } catch (error: any) {
        // Ignore duplicate feedback errors
        if (!error.message.includes('UNIQUE constraint')) {
          console.error(`      Error creating feedback: ${error.message}`);
        }
      }
    }
    console.log(`   ✓ Created feedback for ${agentData.template.name}`);
  }

  console.log('\n[5/5] Generating summary...');

  return {
    integrationId,
    agents,
    feedbackCounts,
    totalTraces,
  };
}

// ============================================================================
// SQL Generation for Additional Data
// ============================================================================

function generateEvalSQL(agents: GeneratedData['agents']): string {
  let sql = '-- Generated Evals and Executions\n\n';

  for (const agentData of agents) {
    // Create 2 evals per agent
    for (let evalNum = 0; evalNum < 2; evalNum++) {
      const evalId = generateId('eval');
      const version = evalNum + 1;
      const accuracy = randomInt(70, 95) / 100;
      const status = evalNum === 1 ? 'active' : 'draft';

      const evalCode = `def eval_${agentData.template.name.toLowerCase().replace(/\s+/g, '_')}_v${version}(trace: dict) -> tuple[bool, str]:
    """
    Evaluate ${agentData.template.name} responses.
    Generated automatically from training examples.
    """
    output = trace.get('output', {}).get('response', '')

    # Check for quality indicators
    quality_indicators = ['understand', 'help', 'solution', 'recommend']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    # Check for negative patterns
    negative_patterns = ['cannot', 'error', 'unable', 'sorry']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, 'Response demonstrates quality indicators'
    elif has_negative:
        return False, 'Response contains negative patterns'
    else:
        return len(output) > 100, 'Based on response length'
`;

      const trainingTraceIds = agentData.traces.slice(0, 10).map(t => t.id);

      sql += `INSERT OR IGNORE INTO evals (id, agent_id, version, name, description, code, model_used, accuracy, training_trace_ids, status, created_at, updated_at)
VALUES ('${evalId}', '${agentData.agent.id}', ${version}, '${agentData.template.name} Quality Check v${version}', 'Evaluates response quality for ${agentData.template.name}', '${evalCode.replace(/'/g, "''")}', 'gpt-4', ${accuracy}, '${JSON.stringify(trainingTraceIds).replace(/'/g, "''")}', '${status}', datetime('now', '-${randomInt(1, 14)} days'), datetime('now'));\n\n`;

      // Create eval executions for some traces
      const executionTraces = agentData.traces.slice(0, 20);
      for (const trace of executionTraces) {
        const executionId = generateId('exec');
        const predictedResult = Math.random() > 0.25 ? 1 : 0;
        const executionTimeMs = randomInt(50, 500);

        sql += `INSERT OR IGNORE INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at)
VALUES ('${executionId}', '${evalId}', '${trace.id}', ${predictedResult}, '${predictedResult ? 'Response meets quality criteria' : 'Response did not meet criteria'}', ${executionTimeMs}, datetime('now', '-${randomInt(0, 7)} days'));\n`;
      }
      sql += '\n';
    }
  }

  return sql;
}

function generateJobsSQL(): string {
  let sql = '-- Generated Jobs\n\n';

  const jobTypes = ['import', 'generate', 'execute', 'agent_discovery', 'prompt_improvement', 'prompt_evaluation'];
  const statuses = ['completed', 'completed', 'completed', 'failed', 'running', 'queued'];

  for (let i = 0; i < 20; i++) {
    const jobId = generateId('job');
    const jobType = randomChoice(jobTypes);
    const status = randomChoice(statuses);
    const progress = status === 'completed' ? 100 : status === 'failed' ? randomInt(10, 80) : randomInt(0, 99);

    const metadata: any = { batch_size: randomInt(10, 100) };
    if (jobType === 'import') {
      metadata.integration_id = 'int_placeholder';
      metadata.filters = { limit: randomInt(50, 200) };
    }

    const result = status === 'completed' ? { processed: randomInt(50, 200), success: true } : null;
    const error = status === 'failed' ? 'Simulated error for testing' : null;

    sql += `INSERT OR IGNORE INTO jobs (id, workspace_id, type, status, progress, metadata, result, error, created_at, started_at, completed_at)
VALUES ('${jobId}', '${WORKSPACE_ID}', '${jobType}', '${status}', ${progress}, '${JSON.stringify(metadata).replace(/'/g, "''")}', ${result ? `'${JSON.stringify(result).replace(/'/g, "''")}'` : 'NULL'}, ${error ? `'${error}'` : 'NULL'}, datetime('now', '-${randomInt(0, 30)} days'), datetime('now', '-${randomInt(0, 30)} days', '+${randomInt(1, 60)} minutes'), ${status === 'completed' || status === 'failed' ? `datetime('now', '-${randomInt(0, 30)} days', '+${randomInt(2, 120)} minutes')` : 'NULL'});\n`;
  }

  return sql;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    // Check if API is available
    try {
      const response = await fetch(`${API_URL}/api/integrations`, {
        headers: { 'X-Workspace-Id': WORKSPACE_ID },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (e: any) {
      if (e.cause?.code === 'ECONNREFUSED') {
        console.error(`❌ Cannot connect to API at ${API_URL}`);
        console.error('   Please ensure the backend is running: pnpm run dev');
        process.exit(1);
      }
      // API is available but might have returned an error - that's okay for the check
    }

    // Generate all data via API
    const data = await generateAllData();

    // Generate SQL for evals and jobs (these need direct DB insertion)
    const evalSQL = generateEvalSQL(data.agents);
    const jobsSQL = generateJobsSQL();

    const fullSQL = `-- iofold Test Data SQL
-- Generated at ${new Date().toISOString()}
-- Run with: npx wrangler d1 execute iofold_validation --local --file=scripts/seed-data.sql

${evalSQL}
${jobsSQL}
`;

    // Write SQL file
    const sqlPath = path.join(__dirname, 'seed-data.sql');
    fs.writeFileSync(sqlPath, fullSQL);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Database Seeding Complete!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   • Integration: ${data.integrationId}`);
    console.log(`   • Agents: ${data.agents.length}`);
    console.log(`   • Traces: ${data.totalTraces}`);
    console.log(`   • Feedback: ${Object.values(data.feedbackCounts).reduce((a, b) => a + b, 0)}`);
    console.log(`     - Positive: ${data.feedbackCounts.positive}`);
    console.log(`     - Negative: ${data.feedbackCounts.negative}`);
    console.log(`     - Neutral: ${data.feedbackCounts.neutral}`);

    console.log('\n📝 Next Steps:');
    console.log('   1. Run the SQL file to insert evals and jobs:');
    console.log(`      npx wrangler d1 execute iofold_validation --local --file=scripts/seed-data.sql`);
    console.log('\n   2. Start the frontend and explore the data:');
    console.log('      cd frontend && pnpm run dev');
    console.log('\n   3. Visit http://localhost:3000');

  } catch (error: any) {
    console.error('\n❌ Error during seeding:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
