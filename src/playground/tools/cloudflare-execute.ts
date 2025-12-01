/**
 * Cloudflare Sandbox Execute Tool for Agents Playground
 * Wraps PythonRunner to provide LangChain tool interface
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PythonRunner } from '../../sandbox/python-runner';
import type { Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

export interface CloudflareExecuteToolConfig {
  sandboxBinding: DurableObjectNamespace<Sandbox>;
  timeout?: number;
  sandboxId?: string;
}

/**
 * Create a Cloudflare execute tool for running Python code in a sandbox
 *
 * This tool wraps the existing PythonRunner implementation and provides
 * a LangChain-compatible interface for agent tool usage.
 *
 * Currently supports Python execution only. Future versions may support
 * additional languages.
 *
 * @param config - Configuration for the execute tool
 * @returns LangChain tool for code execution
 *
 * @example
 * ```typescript
 * const executeTool = createCloudflareExecuteTool({
 *   sandboxBinding: env.SANDBOX,
 *   timeout: 5000
 * });
 * ```
 */
export function createCloudflareExecuteTool(config: CloudflareExecuteToolConfig) {
  const runner = new PythonRunner({
    sandboxBinding: config.sandboxBinding,
    timeout: config.timeout || 5000,
    sandboxId: config.sandboxId
  });

  return tool(
    async ({ command }): Promise<string> => {
      // Validate command format
      if (!command.trim()) {
        return 'Error: Empty command provided';
      }

      // Extract language and script path
      const pythonMatch = command.match(/^python3?\s+(.+)/);

      if (!pythonMatch) {
        return 'Error: Only Python execution supported. Use format: python script.py or python3 script.py';
      }

      const scriptPath = pythonMatch[1].trim();

      if (!scriptPath) {
        return 'Error: No script path provided';
      }

      // Note: The actual Python code should be written to the filesystem
      // by the agent using the write_file tool before calling execute.
      // We just execute the file at the given path.

      try {
        const result = await runner.execute(
          `# Execute script at ${scriptPath}\n` +
          `with open('${scriptPath}', 'r') as f:\n` +
          `    code = f.read()\n` +
          `exec(code)`
        );

        if (result.success) {
          return result.output || '(execution completed with no output)';
        } else {
          return `Error: ${result.error || 'Unknown execution error'}`;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'execute',
      description:
        'Execute a command in the sandbox environment. ' +
        'Currently supports Python only. ' +
        'Format: "python script.py" or "python3 script.py". ' +
        'The script file must exist in the virtual filesystem (use write_file first).',
      schema: z.object({
        command: z.string().describe(
          'Command to execute. Format: "python script.py" where script.py exists in the filesystem.'
        )
      })
    }
  );
}

/**
 * Alternative implementation that executes Python code directly
 * without requiring a file to be written first.
 *
 * This is useful for quick code execution but less aligned with
 * the deepagentsjs philosophy of file-based interactions.
 */
export function createDirectExecuteTool(config: CloudflareExecuteToolConfig) {
  const runner = new PythonRunner({
    sandboxBinding: config.sandboxBinding,
    timeout: config.timeout || 5000,
    sandboxId: config.sandboxId
  });

  return tool(
    async ({ code }): Promise<string> => {
      if (!code.trim()) {
        return 'Error: Empty code provided';
      }

      try {
        const result = await runner.execute(code);

        if (result.success) {
          return result.output || '(execution completed with no output)';
        } else {
          return `Error: ${result.error || 'Unknown execution error'}`;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'execute_python',
      description:
        'Execute Python code directly in the sandbox environment. ' +
        'Code is validated for security (no dangerous imports, eval/exec) and ' +
        'executed with a timeout limit.',
      schema: z.object({
        code: z.string().describe('Python code to execute')
      })
    }
  );
}
