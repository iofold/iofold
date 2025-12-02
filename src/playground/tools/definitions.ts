/**
 * Tool Definitions for Agents Playground
 * Creates LangChain tools for agent use
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { D1Backend } from '../backend/d1-backend';
import { PythonRunner } from '../../sandbox/python-runner';
import type { Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Environment interface for tool creation
 */
export interface ToolEnv {
  DB: D1Database;
  SANDBOX?: DurableObjectNamespace<Sandbox>;
}

/**
 * Create playground tools for agent use
 *
 * Returns an array of LangChain tools that agents can use to interact
 * with the virtual filesystem and execute Python code.
 *
 * @param env - Cloudflare environment bindings
 * @param sessionId - Playground session ID for filesystem persistence
 * @returns Array of LangChain tools
 *
 * @example
 * ```typescript
 * const tools = createPlaygroundTools(env, 'session_abc123');
 * const agent = createReactAgent({ llm, tools });
 * ```
 */
export function createPlaygroundTools(env: ToolEnv, sessionId: string) {
  const backend = new D1Backend(env.DB, sessionId);

  // Tool 1: Execute Python code
  const executePythonTool = tool(
    async ({ code }): Promise<string> => {
      if (!code || typeof code !== 'string' || !code.trim()) {
        return 'Error: Empty code provided';
      }

      if (!env.SANDBOX) {
        return 'Error: Sandbox binding not configured';
      }

      try {
        const runner = new PythonRunner({
          sandboxBinding: env.SANDBOX,
          timeout: 5000,
          sandboxId: `playground-${sessionId}-${Date.now()}`
        });

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
        'Execute Python code in a secure sandbox environment. ' +
        'Only the following imports are allowed: json, re, typing. ' +
        'No network access, file I/O, or subprocess execution permitted. ' +
        'Code execution has a 5-second timeout and 50MB memory limit. ' +
        'Returns the output of the code execution or an error message.',
      schema: z.object({
        code: z.string().describe('Python code to execute. Must use only allowed imports (json, re, typing).')
      })
    }
  );

  // Tool 2: Read file from virtual filesystem
  const readFileTool = tool(
    async ({ path }): Promise<string> => {
      if (!path || typeof path !== 'string') {
        return 'Error: Invalid path argument';
      }

      try {
        const content = await backend.read(path);
        return content;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'read_file',
      description:
        'Read the contents of a file from the virtual filesystem. ' +
        'Returns file contents with line numbers, or an error message if the file does not exist. ' +
        'Cannot read directories - use list_files to see directory contents.',
      schema: z.object({
        path: z.string().describe('Absolute path to the file to read (e.g., /workspace/script.py)')
      })
    }
  );

  // Tool 3: Write file to virtual filesystem
  const writeFileTool = tool(
    async ({ path, content }): Promise<string> => {
      if (!path || typeof path !== 'string') {
        return 'Error: Invalid path argument';
      }
      if (typeof content !== 'string') {
        return 'Error: Invalid content argument';
      }

      try {
        const result = await backend.write(path, content);

        if (result.error) {
          return `Error: ${result.error}`;
        }

        return `File written successfully: ${result.path}`;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'write_file',
      description:
        'Write content to a file in the virtual filesystem. ' +
        'Creates the file if it does not exist, or overwrites it if it does. ' +
        'Cannot write to directories. ' +
        'Returns success message or error.',
      schema: z.object({
        path: z.string().describe('Absolute path where the file should be written (e.g., /workspace/output.txt)'),
        content: z.string().describe('Content to write to the file')
      })
    }
  );

  // Tool 4: List files and directories
  const listFilesTool = tool(
    async ({ path }): Promise<string> => {
      const dirPath = (path || '/') as string;

      if (typeof dirPath !== 'string') {
        return 'Error: Invalid path argument';
      }

      try {
        const files = await backend.lsInfo(dirPath);

        if (files.length === 0) {
          return `Directory is empty: ${dirPath}`;
        }

        // Format output as a readable list
        const formatted = files
          .map((file) => {
            if (file.is_dir) {
              return `[DIR]  ${file.path}`;
            } else {
              const size = file.size ? ` (${file.size} bytes)` : '';
              return `[FILE] ${file.path}${size}`;
            }
          })
          .join('\n');

        return `Contents of ${dirPath}:\n${formatted}`;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'list_files',
      description:
        'List files and directories in the virtual filesystem. ' +
        'Returns a formatted list showing files and directories at the specified path. ' +
        'Does not recurse into subdirectories - list each directory separately if needed.',
      schema: z.object({
        path: z.string().optional().describe('Directory path to list (defaults to root directory "/")')
      })
    }
  );

  return [executePythonTool, readFileTool, writeFileTool, listFilesTool];
}
