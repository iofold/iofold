-- Seed Data for iofold.com
-- Test data for development and testing
-- Run this after initial schema migration

-- ============================================================================
-- Users and Workspaces
-- ============================================================================

-- Create test user
INSERT INTO users (id, email, name, created_at) VALUES
  ('user_test123', 'test@iofold.com', 'Test User', '2025-11-01T10:00:00Z');

-- Create test workspace
INSERT INTO workspaces (id, name, created_at) VALUES
  ('ws_test123', 'Test Workspace', '2025-11-01T10:00:00Z');

-- Add user to workspace
INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES
  ('wm_test123', 'ws_test123', 'user_test123', 'owner', '2025-11-01T10:00:00Z');

-- ============================================================================
-- Integration (Langfuse)
-- ============================================================================

-- Create Langfuse integration
INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status, last_synced_at, created_at) VALUES
  ('int_langfuse123', 'ws_test123', 'langfuse', 'Production Langfuse', 'encrypted_api_key_placeholder', 'active', '2025-11-12T09:00:00Z', '2025-11-01T10:30:00Z');

-- ============================================================================
-- Sample Traces (5 traces with varied scenarios)
-- ============================================================================

-- Trace 1: Good response with tool usage
INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at) VALUES
  ('trace_001', 'ws_test123', 'int_langfuse123', 'langfuse_trace_001', 'langfuse', '2025-11-10T14:30:00Z',
   '{"user_id": "user_456", "session_id": "session_abc", "tags": ["production", "chat"], "environment": "prod"}',
   '[
     {
       "step_id": "step_1",
       "timestamp": "2025-11-10T14:30:01Z",
       "messages_added": [
         {"role": "user", "content": "What are the best practices for prompt engineering?"}
       ],
       "tool_calls": [
         {
           "tool_name": "search_documentation",
           "arguments": {"query": "prompt engineering best practices"},
           "result": {"docs": ["Be specific and clear", "Provide examples", "Iterate based on results"]}
         }
       ],
       "input": {"query": "What are the best practices for prompt engineering?"},
       "output": {"response": "Here are the key best practices for prompt engineering: 1) Be specific and clear in your instructions 2) Provide concrete examples 3) Iterate and refine based on results. Would you like more details on any of these?"},
       "metadata": {"model": "gpt-4", "temperature": 0.7}
     }
   ]',
   'What are the best practices for prompt engineering?',
   'Here are the key best practices for prompt engineering: 1) Be specific and clear in your instructions 2) Provide concrete examples 3) Iterate and refine based on results. Would you like more de...',
   1, 0, '2025-11-12T09:00:00Z');

-- Trace 2: Good response, multiple steps
INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at) VALUES
  ('trace_002', 'ws_test123', 'int_langfuse123', 'langfuse_trace_002', 'langfuse', '2025-11-10T15:00:00Z',
   '{"user_id": "user_789", "session_id": "session_def", "tags": ["production"], "environment": "prod"}',
   '[
     {
       "step_id": "step_1",
       "timestamp": "2025-11-10T15:00:01Z",
       "messages_added": [
         {"role": "user", "content": "Calculate the total revenue for Q3 2024"}
       ],
       "tool_calls": [
         {
           "tool_name": "query_database",
           "arguments": {"query": "SELECT SUM(revenue) FROM sales WHERE quarter = ''Q3'' AND year = 2024"},
           "result": {"total": 2500000}
         }
       ],
       "input": {"query": "Calculate the total revenue for Q3 2024"},
       "output": {"revenue": 2500000},
       "metadata": {"model": "gpt-4", "temperature": 0.0}
     },
     {
       "step_id": "step_2",
       "timestamp": "2025-11-10T15:00:03Z",
       "messages_added": [
         {"role": "assistant", "content": "The total revenue for Q3 2024 is $2,500,000. This represents a 15% increase over Q2."}
       ],
       "tool_calls": [],
       "input": {"revenue": 2500000},
       "output": {"formatted_response": "The total revenue for Q3 2024 is $2,500,000. This represents a 15% increase over Q2."},
       "metadata": {}
     }
   ]',
   'Calculate the total revenue for Q3 2024',
   'The total revenue for Q3 2024 is $2,500,000. This represents a 15% increase over Q2.',
   2, 0, '2025-11-12T09:00:00Z');

-- Trace 3: Bad response - no tool usage when needed
INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at) VALUES
  ('trace_003', 'ws_test123', 'int_langfuse123', 'langfuse_trace_003', 'langfuse', '2025-11-10T16:00:00Z',
   '{"user_id": "user_456", "session_id": "session_ghi", "tags": ["production"], "environment": "prod"}',
   '[
     {
       "step_id": "step_1",
       "timestamp": "2025-11-10T16:00:01Z",
       "messages_added": [
         {"role": "user", "content": "What is our current pricing for the enterprise plan?"}
       ],
       "tool_calls": [],
       "input": {"query": "What is our current pricing for the enterprise plan?"},
       "output": {"response": "I think it''s around $100 per month, but I''m not entirely sure. You should check the website."},
       "metadata": {"model": "gpt-4", "temperature": 0.7}
     }
   ]',
   'What is our current pricing for the enterprise plan?',
   'I think it''s around $100 per month, but I''m not entirely sure. You should check the website.',
   1, 0, '2025-11-12T09:00:00Z');

-- Trace 4: Bad response - execution error
INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at) VALUES
  ('trace_004', 'ws_test123', 'int_langfuse123', 'langfuse_trace_004', 'langfuse', '2025-11-10T17:00:00Z',
   '{"user_id": "user_789", "session_id": "session_jkl", "tags": ["production"], "environment": "prod"}',
   '[
     {
       "step_id": "step_1",
       "timestamp": "2025-11-10T17:00:01Z",
       "messages_added": [
         {"role": "user", "content": "Send a summary email to the team"}
       ],
       "tool_calls": [
         {
           "tool_name": "send_email",
           "arguments": {"to": "team@company.com", "subject": "Summary", "body": "..."},
           "error": "SMTP connection failed: timeout after 30s"
         }
       ],
       "input": {"command": "send email"},
       "output": {},
       "error": "Failed to send email: SMTP timeout",
       "metadata": {"model": "gpt-4"}
     }
   ]',
   'Send a summary email to the team',
   'Error: Failed to send email',
   1, 1, '2025-11-12T09:00:00Z');

-- Trace 5: Good response with citations
INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at) VALUES
  ('trace_005', 'ws_test123', 'int_langfuse123', 'langfuse_trace_005', 'langfuse', '2025-11-11T09:00:00Z',
   '{"user_id": "user_456", "session_id": "session_mno", "tags": ["production", "research"], "environment": "prod"}',
   '[
     {
       "step_id": "step_1",
       "timestamp": "2025-11-11T09:00:01Z",
       "messages_added": [
         {"role": "user", "content": "Explain how transformers work in AI"}
       ],
       "tool_calls": [
         {
           "tool_name": "search_papers",
           "arguments": {"query": "transformer architecture"},
           "result": {"papers": [{"title": "Attention is All You Need", "url": "arxiv.org/..."}]}
         }
       ],
       "input": {"query": "Explain how transformers work in AI"},
       "output": {"response": "Transformers are a type of neural network architecture that uses self-attention mechanisms [1]. They were introduced in the paper ''Attention is All You Need'' and have become the foundation for models like GPT and BERT [1]. The key innovation is the attention mechanism, which allows the model to weigh the importance of different parts of the input when processing each element [2]."},
       "metadata": {"model": "gpt-4", "temperature": 0.7}
     }
   ]',
   'Explain how transformers work in AI',
   'Transformers are a type of neural network architecture that uses self-attention mechanisms [1]. They were introduced in the paper ''Attention is All You Need'' and have become the foundation for...',
   1, 0, '2025-11-12T09:00:00Z');

-- ============================================================================
-- Eval Set with Feedback
-- ============================================================================

-- Create eval set for response quality
INSERT INTO eval_sets (id, workspace_id, name, description, minimum_examples, created_at) VALUES
  ('set_quality123', 'ws_test123', 'response-quality', 'Evaluates if agent responses are helpful, accurate, and complete', 5, '2025-11-11T10:00:00Z');

-- Add feedback (3 positive, 2 negative)
INSERT INTO feedback (id, eval_set_id, trace_id, rating, notes, created_at) VALUES
  ('fb_001', 'set_quality123', 'trace_001', 'positive', 'Good use of search tool and clear response', '2025-11-11T10:05:00Z'),
  ('fb_002', 'set_quality123', 'trace_002', 'positive', 'Accurate calculation with proper context', '2025-11-11T10:06:00Z'),
  ('fb_003', 'set_quality123', 'trace_003', 'negative', 'Should have used pricing tool, vague response', '2025-11-11T10:07:00Z'),
  ('fb_004', 'set_quality123', 'trace_004', 'negative', 'Error not handled gracefully', '2025-11-11T10:08:00Z'),
  ('fb_005', 'set_quality123', 'trace_005', 'positive', 'Excellent response with citations', '2025-11-11T10:09:00Z');

-- ============================================================================
-- Generated Eval Function
-- ============================================================================

-- Create sample eval (generated from the feedback above)
INSERT INTO evals (id, eval_set_id, name, description, version, code, model_used, accuracy, test_results, training_trace_ids, status, created_at) VALUES
  ('eval_001', 'set_quality123', 'response_quality_check', 'Checks if response is helpful, uses appropriate tools, and provides accurate information', 1,
   'import json
import re
from typing import Tuple

def response_quality_check(trace: dict) -> Tuple[bool, str]:
    """
    Evaluates if a trace represents a high-quality response.

    Criteria:
    - Uses appropriate tools when needed
    - Provides specific, confident responses
    - Handles errors gracefully
    - Includes citations when making factual claims
    """
    steps = trace.get(''steps'', [])
    if not steps:
        return (False, ''No execution steps found'')

    last_step = steps[-1]

    # Check for errors
    if last_step.get(''error''):
        return (False, f"Execution error: {last_step[''error'']}")

    # Get output
    output = last_step.get(''output'', {})
    response = output.get(''response'', '''') or output.get(''formatted_response'', '''')

    if not response:
        return (False, ''Empty or missing response'')

    # Check for vague language
    vague_patterns = [''i think'', ''not sure'', ''maybe'', ''probably'', ''you should check'']
    if any(pattern in response.lower() for pattern in vague_patterns):
        return (False, ''Response contains uncertain or vague language'')

    # Check minimum length
    if len(response) < 50:
        return (False, f"Response too short: {len(response)} characters")

    # Check tool usage for queries that likely need data
    messages = last_step.get(''messages_added'', [])
    if messages:
        user_query = messages[0].get(''content'', '''').lower()
        needs_tool = any(keyword in user_query for keyword in [''current'', ''latest'', ''pricing'', ''calculate'', ''what is our''])

        tool_calls = last_step.get(''tool_calls'', [])
        if needs_tool and not tool_calls:
            return (False, ''Query requires tool usage but no tools were called'')

    return (True, ''Response meets quality criteria'')
',
   'claude-sonnet-4.5',
   1.0,
   '{"correct": 5, "incorrect": 0, "errors": 0, "total": 5, "details": [
     {"trace_id": "trace_001", "expected": true, "predicted": true, "match": true, "reason": "Response meets quality criteria", "execution_time_ms": 8},
     {"trace_id": "trace_002", "expected": true, "predicted": true, "match": true, "reason": "Response meets quality criteria", "execution_time_ms": 7},
     {"trace_id": "trace_003", "expected": false, "predicted": false, "match": true, "reason": "Response contains uncertain or vague language", "execution_time_ms": 6},
     {"trace_id": "trace_004", "expected": false, "predicted": false, "match": true, "reason": "Execution error: Failed to send email: SMTP timeout", "execution_time_ms": 5},
     {"trace_id": "trace_005", "expected": true, "predicted": true, "match": true, "reason": "Response meets quality criteria", "execution_time_ms": 9}
   ]}',
   '["trace_001", "trace_002", "trace_003", "trace_004", "trace_005"]',
   'active',
   '2025-11-11T11:00:00Z');

-- ============================================================================
-- Eval Executions
-- ============================================================================

-- Create execution results (matching the test_results above)
INSERT INTO eval_executions (id, eval_id, trace_id, result, reason, execution_time_ms, executed_at) VALUES
  ('exec_001', 'eval_001', 'trace_001', 1, 'Response meets quality criteria', 8, '2025-11-11T11:00:05Z'),
  ('exec_002', 'eval_001', 'trace_002', 1, 'Response meets quality criteria', 7, '2025-11-11T11:00:06Z'),
  ('exec_003', 'eval_001', 'trace_003', 0, 'Response contains uncertain or vague language', 6, '2025-11-11T11:00:07Z'),
  ('exec_004', 'eval_001', 'trace_004', 0, 'Execution error: Failed to send email: SMTP timeout', 5, '2025-11-11T11:00:08Z'),
  ('exec_005', 'eval_001', 'trace_005', 1, 'Response meets quality criteria', 9, '2025-11-11T11:00:09Z');

-- ============================================================================
-- Sample Job (Completed Import)
-- ============================================================================

INSERT INTO jobs (id, workspace_id, type, status, progress, context, result, created_at, started_at, completed_at) VALUES
  ('job_import001', 'ws_test123', 'import', 'completed', 100,
   '{"integration_id": "int_langfuse123", "filters": {"date_from": "2025-11-10T00:00:00Z", "date_to": "2025-11-12T00:00:00Z", "limit": 100}}',
   '{"imported": 5, "failed": 0, "skipped": 0}',
   '2025-11-12T08:55:00Z',
   '2025-11-12T08:55:02Z',
   '2025-11-12T09:00:00Z');

-- ============================================================================
-- Update Statistics
-- ============================================================================

-- Update eval execution count
UPDATE evals SET execution_count = 5 WHERE id = 'eval_001';

-- Note: contradiction_count is 0 because all predictions match human feedback
