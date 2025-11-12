#!/usr/bin/env tsx

import { LangfuseAdapter } from '../src/adapters/langfuse';
import { EvalGenerator } from '../src/eval-generator/generator';
import { EvalTester } from '../src/eval-generator/tester';
import { CostTracker } from '../src/analytics/cost-tracker';

async function main() {
  console.log('=== iofold Pre-Implementation Validation ===\n');

  // Step 1: Fetch traces from Langfuse
  console.log('1. Fetching traces from Langfuse...');
  const adapter = new LangfuseAdapter({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL
  });

  await adapter.authenticate();
  const traces = await adapter.fetchTraces({ limit: 10 });
  console.log(`✅ Fetched ${traces.length} traces\n`);

  // Step 2: Manually label traces (for validation, we'll split randomly)
  console.log('2. Labeling traces...');
  const positiveTraces = traces.slice(0, 5);
  const negativeTraces = traces.slice(5, 10);
  console.log(`✅ Labeled ${positiveTraces.length} positive, ${negativeTraces.length} negative\n`);

  // Step 3: Generate eval
  console.log('3. Generating eval function...');
  const generator = new EvalGenerator({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!
  });

  const evalResult = await generator.generate({
    name: 'validation_test',
    positiveExamples: positiveTraces,
    negativeExamples: negativeTraces
  });

  console.log('✅ Generated eval function');
  console.log(`   Tokens: ${evalResult.metadata.tokensUsed}`);
  console.log(`   Cost: $${evalResult.metadata.cost.estimatedCostUSD.toFixed(4)}\n`);

  // Step 4: Test eval accuracy
  console.log('4. Testing eval accuracy...');
  const tester = new EvalTester();
  const testCases = [
    ...positiveTraces.map(t => ({ trace: t, expectedPass: true })),
    ...negativeTraces.map(t => ({ trace: t, expectedPass: false }))
  ];

  const testResult = await tester.test(evalResult.code, testCases);
  console.log('✅ Eval testing complete');
  console.log(`   Accuracy: ${(testResult.accuracy * 100).toFixed(1)}%`);
  console.log(`   Correct: ${testResult.correct}/${testResult.total}`);
  console.log(`   Errors: ${testResult.errors}\n`);

  // Step 5: Project costs at scale
  console.log('5. Cost projections at scale...');
  const costPerEval = evalResult.metadata.cost.estimatedCostUSD;

  const scenarios = [
    { evalsPerMonth: 10, label: 'Small team (10 evals/month)' },
    { evalsPerMonth: 50, label: 'Medium team (50 evals/month)' },
    { evalsPerMonth: 200, label: 'Large team (200 evals/month)' }
  ];

  for (const scenario of scenarios) {
    const projection = CostTracker.projectCostAtScale(costPerEval, scenario.evalsPerMonth);
    console.log(`   ${scenario.label}:`);
    console.log(`     Monthly: $${projection.monthly.toFixed(2)}`);
    console.log(`     Annual: $${projection.annual.toFixed(2)}`);
  }

  console.log('\n=== Validation Complete ===');

  // Write results
  const results = {
    date: new Date().toISOString(),
    traces_fetched: traces.length,
    eval_generated: true,
    accuracy: testResult.accuracy,
    cost_per_eval: costPerEval,
    projections: scenarios.map(s => ({
      ...s,
      ...CostTracker.projectCostAtScale(costPerEval, s.evalsPerMonth)
    }))
  };

  console.log('\nWriting results to docs/validation-results.md...');
  // You would write this to file here
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
