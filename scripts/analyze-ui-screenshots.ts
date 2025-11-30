#!/usr/bin/env bun
/**
 * UI/UX Screenshot Analyzer using Gemini Vision
 * Analyzes screenshots in parallel and provides critical/constructive feedback
 */

import { VertexAI } from '@google-cloud/vertexai';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PROJECT_ID = process.env.VERTEXAI_PROJECT || 'gemini-testing-417518';
const LOCATION = process.env.VERTEXAI_LOCATION || 'us-central1';
const MODEL = 'gemini-2.5-flash';
const MAX_WORKERS = 8;

// Initialize Vertex AI
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const model = vertexAI.getGenerativeModel({ model: MODEL });

// UI/UX Analysis Prompt
const ANALYSIS_PROMPT = `You are an expert UI/UX designer and frontend engineer. Analyze this screenshot of a web application and provide critical, constructive feedback.

## Your Task
Evaluate the UI/UX design and provide:

### 1. CRITICAL ISSUES (Must Fix)
- Accessibility problems (contrast, text size, missing labels)
- Usability blockers (confusing navigation, hidden actions)
- Visual hierarchy problems
- Layout/alignment issues
- Inconsistencies with modern design standards

### 2. CONSTRUCTIVE FEEDBACK (Should Improve)
- Spacing and padding suggestions
- Color scheme improvements
- Typography recommendations
- Interactive element enhancements
- Information architecture suggestions

### 3. POSITIVE ASPECTS (What Works Well)
- Good design patterns used
- Effective visual elements
- Strong UX decisions

### 4. SCORE (1-10)
Rate the overall UI/UX quality with brief justification.

Be specific, reference exact elements in the screenshot, and provide actionable recommendations. Be honest and critical - don't sugarcoat issues.`;

interface AnalysisResult {
  filename: string;
  pageName: string;
  analysis: string;
  score?: number;
  error?: string;
  duration: number;
}

async function analyzeImage(imagePath: string): Promise<AnalysisResult> {
  const startTime = Date.now();
  const filename = path.basename(imagePath);
  const pageName = filename.replace(/^\d+-/, '').replace(/\.png$/, '').replace(/-/g, ' ');

  try {
    // Read image as base64
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Create request with image
    const request = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `Page: ${pageName}\n\n${ANALYSIS_PROMPT}`
          }
        ]
      }]
    };

    // Generate analysis
    const response = await model.generateContent(request);
    const result = response.response;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated';

    // Extract score from text (look for patterns like "Score: 7/10" or "7/10")
    const scoreMatch = text.match(/(?:score[:\s]*)?(\d+)\/10/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : undefined;

    return {
      filename,
      pageName,
      analysis: text,
      score,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      filename,
      pageName,
      analysis: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

async function processBatch(images: string[], maxWorkers: number): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  const queue = [...images];
  let completed = 0;
  const total = images.length;

  console.log(`\n🔍 Analyzing ${total} screenshots with ${maxWorkers} parallel workers...\n`);

  // Process in parallel batches
  while (queue.length > 0) {
    const batch = queue.splice(0, maxWorkers);
    const batchResults = await Promise.all(
      batch.map(async (imagePath) => {
        const result = await analyzeImage(imagePath);
        completed++;
        const status = result.error ? '❌' : '✅';
        const score = result.score ? ` (Score: ${result.score}/10)` : '';
        console.log(`${status} [${completed}/${total}] ${result.pageName}${score} - ${result.duration}ms`);
        return result;
      })
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

function generateReport(results: AnalysisResult[]): string {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const avgScore = successful.reduce((sum, r) => sum + (r.score || 0), 0) / successful.filter(r => r.score).length;

  let report = `# UI/UX Analysis Report - iofold.com

**Generated:** ${new Date().toISOString()}
**Screenshots Analyzed:** ${successful.length}/${results.length}
**Average Score:** ${avgScore.toFixed(1)}/10
**Model:** ${MODEL}

---

## Executive Summary

`;

  // Sort by score (lowest first for priority fixing)
  const sorted = [...successful].sort((a, b) => (a.score || 0) - (b.score || 0));

  // Add priority list
  report += `### Priority Order (by score)\n\n`;
  for (const r of sorted) {
    const emoji = r.score && r.score >= 7 ? '🟢' : r.score && r.score >= 5 ? '🟡' : '🔴';
    report += `${emoji} **${r.pageName}**: ${r.score}/10\n`;
  }

  report += `\n---\n\n## Detailed Analysis\n\n`;

  // Add detailed analysis for each page
  for (const result of sorted) {
    report += `### ${result.pageName}\n\n`;
    report += `**File:** \`${result.filename}\`\n`;
    report += `**Score:** ${result.score || 'N/A'}/10\n`;
    report += `**Analysis Time:** ${result.duration}ms\n\n`;
    report += result.analysis;
    report += `\n\n---\n\n`;
  }

  // Add failures if any
  if (failed.length > 0) {
    report += `## Failed Analyses\n\n`;
    for (const f of failed) {
      report += `- **${f.filename}**: ${f.error}\n`;
    }
  }

  return report;
}

async function main() {
  const screenshotsDir = '/home/ygupta/workspace/iofold/.playwright-mcp/screenshots';
  const outputDir = '/home/ygupta/workspace/iofold/docs';

  // Get all PNG files
  const files = fs.readdirSync(screenshotsDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => path.join(screenshotsDir, f));

  if (files.length === 0) {
    console.error('No screenshots found in', screenshotsDir);
    process.exit(1);
  }

  console.log(`Found ${files.length} screenshots to analyze`);

  // Process all images
  const results = await processBatch(files, MAX_WORKERS);

  // Generate report
  const report = generateReport(results);

  // Save report
  const reportPath = path.join(outputDir, 'ui-ux-analysis-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Save raw results as JSON
  const jsonPath = path.join(outputDir, 'ui-ux-analysis-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`📊 Raw results saved to: ${jsonPath}`);

  // Print summary
  const successful = results.filter(r => !r.error);
  const avgScore = successful.reduce((sum, r) => sum + (r.score || 0), 0) / successful.filter(r => r.score).length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✨ ANALYSIS COMPLETE`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📸 Screenshots: ${successful.length}/${results.length}`);
  console.log(`⭐ Average Score: ${avgScore.toFixed(1)}/10`);
  console.log(`📁 Report: ${reportPath}`);
}

main().catch(console.error);
