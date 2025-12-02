/**
 * Tool Execution System for Agents Playground
 * Handles tool execution with timeout and error handling
 */

import { PythonRunner } from '../../sandbox/python-runner';
import { D1Backend } from '../backend/d1-backend';
import type { Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Environment interface for tool execution
 */
export interface ToolExecutionEnv {
  DB: D1Database;
  SANDBOX?: DurableObjectNamespace<Sandbox>;
}

/**
 * Tool call structure from LangChain
 */
export interface ToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  result?: unknown;
  error?: string;
  latencyMs: number;
}

/**
 * Execute a tool with timeout handling
 *
 * Supports the following tools:
 * - execute_python: Execute Python code in sandbox
 * - read_file: Read file from virtual filesystem
 * - write_file: Write file to virtual filesystem
 * - list_files: List files/directories in virtual filesystem
 *
 * @param toolCall - Tool call with name, ID, and arguments
 * @param env - Cloudflare environment bindings
 * @param sessionId - Playground session ID for filesystem operations
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Tool execution result with timing information
 */
export async function executeToolWithTimeout(
  toolCall: ToolCall,
  env: ToolExecutionEnv,
  sessionId: string,
  timeoutMs: number = 10000
): Promise<ToolResult> {
  const startTime = Date.now();

  // Create AbortController for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    let result: unknown;

    // Execute based on tool name
    switch (toolCall.toolName) {
      case 'execute_python': {
        if (!env.SANDBOX) {
          throw new Error('Sandbox binding not configured');
        }

        const code = toolCall.args.code as string;
        if (!code || typeof code !== 'string') {
          throw new Error('Invalid code argument: must be a non-empty string');
        }

        // Create PythonRunner with sandbox timeout (use smaller of tool timeout or sandbox timeout)
        const sandboxTimeout = Math.min(timeoutMs - 500, 5000); // Leave 500ms buffer for cleanup
        const runner = new PythonRunner({
          sandboxBinding: env.SANDBOX,
          timeout: sandboxTimeout,
          sandboxId: `playground-${sessionId}-${Date.now()}`
        });

        // Check for abort before execution
        if (abortController.signal.aborted) {
          throw new Error(`Tool execution timeout exceeded ${timeoutMs}ms`);
        }

        const execResult = await runner.execute(code);

        if (execResult.success) {
          result = execResult.output || '(execution completed with no output)';
        } else {
          throw new Error(execResult.error || 'Unknown execution error');
        }
        break;
      }

      case 'read_file': {
        const filePath = toolCall.args.path as string;
        if (!filePath || typeof filePath !== 'string') {
          throw new Error('Invalid path argument: must be a non-empty string');
        }

        const backend = new D1Backend(env.DB, sessionId);

        // Check for abort before execution
        if (abortController.signal.aborted) {
          throw new Error(`Tool execution timeout exceeded ${timeoutMs}ms`);
        }

        const content = await backend.read(filePath);

        // Check if result is an error message
        if (content.startsWith('Error:')) {
          throw new Error(content.substring(7).trim());
        }

        result = content;
        break;
      }

      case 'write_file': {
        const filePath = toolCall.args.path as string;
        const content = toolCall.args.content as string;

        if (!filePath || typeof filePath !== 'string') {
          throw new Error('Invalid path argument: must be a non-empty string');
        }
        if (typeof content !== 'string') {
          throw new Error('Invalid content argument: must be a string');
        }

        const backend = new D1Backend(env.DB, sessionId);

        // Check for abort before execution
        if (abortController.signal.aborted) {
          throw new Error(`Tool execution timeout exceeded ${timeoutMs}ms`);
        }

        const writeResult = await backend.write(filePath, content);

        if (writeResult.error) {
          throw new Error(writeResult.error);
        }

        result = `File written successfully: ${writeResult.path}`;
        break;
      }

      case 'list_files': {
        const path = (toolCall.args.path as string) || '/';

        if (typeof path !== 'string') {
          throw new Error('Invalid path argument: must be a string');
        }

        const backend = new D1Backend(env.DB, sessionId);

        // Check for abort before execution
        if (abortController.signal.aborted) {
          throw new Error(`Tool execution timeout exceeded ${timeoutMs}ms`);
        }

        const files = await backend.lsInfo(path);
        result = files;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${toolCall.toolName}`);
    }

    const latencyMs = Date.now() - startTime;

    return {
      result,
      latencyMs
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;

    // Check if this was a timeout
    if (abortController.signal.aborted) {
      return {
        error: `Tool execution timeout exceeded ${timeoutMs}ms`,
        latencyMs
      };
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      error: errorMessage,
      latencyMs
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
