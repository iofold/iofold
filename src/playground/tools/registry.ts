/**
 * Tool Handler Registry
 *
 * Central registry for all tool handlers. Maps handler_key (from DB) to actual
 * implementation functions. Supports both built-in tools and future extensibility.
 *
 * Design: Stream 2 of Tool Registry & ART-E Integration
 * See: docs/plans/2025-12-10-tool-registry-art-e-design.md
 */

import { tool } from '@langchain/core/tools';
import { z, ZodSchema } from 'zod';
import { D1Backend } from '../backend/d1-backend';
import { PythonRunner } from '../../sandbox/python-runner';
import { emailSearchHandler as emailSearchHandlerImpl, emailGetHandler as emailGetHandlerImpl } from './email';
import type { Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Context provided to all tool handlers
 * Contains environment, session info, and bindings
 */
export interface ToolContext {
  db: D1Database;
  sessionId: string;
  sandbox?: DurableObjectNamespace<Sandbox>;
  env?: Record<string, string>;
  ENRON_DB?: D1Database; // Enron email database for email search tools
}

/**
 * Tool handler function signature
 * Takes parsed/validated parameters and context, returns result
 */
export type ToolHandler = (params: unknown, context: ToolContext) => Promise<unknown>;

/**
 * Tool definition from database
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters_schema: string; // JSON Schema as string
  handler_key: string;
  category?: string;
  config?: string; // Tool-specific config JSON
}

/**
 * Execute Python code in secure sandbox
 */
async function executePythonHandler(params: unknown, context: ToolContext): Promise<string> {
  const { code } = params as { code: string };

  if (!code || typeof code !== 'string' || !code.trim()) {
    return 'Error: Empty code provided';
  }

  if (!context.sandbox) {
    return 'Error: Sandbox binding not configured';
  }

  try {
    const runner = new PythonRunner({
      sandboxBinding: context.sandbox,
      timeout: 5000,
      sandboxId: `playground-${context.sessionId}-${Date.now()}`
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
}

/**
 * Read file from virtual filesystem
 */
async function readFileHandler(params: unknown, context: ToolContext): Promise<string> {
  const { path } = params as { path: string };

  if (!path || typeof path !== 'string') {
    return 'Error: Invalid path argument';
  }

  try {
    const backend = new D1Backend(context.db, context.sessionId);
    const content = await backend.read(path);
    return content;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}

/**
 * Write file to virtual filesystem
 */
async function writeFileHandler(params: unknown, context: ToolContext): Promise<string> {
  const { path, content } = params as { path: string; content: string };

  if (!path || typeof path !== 'string') {
    return 'Error: Invalid path argument';
  }
  if (typeof content !== 'string') {
    return 'Error: Invalid content argument';
  }

  try {
    const backend = new D1Backend(context.db, context.sessionId);
    const result = await backend.write(path, content);

    if (result.error) {
      return `Error: ${result.error}`;
    }

    return `File written successfully: ${result.path}`;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}

/**
 * List files and directories in virtual filesystem
 */
async function listFilesHandler(params: unknown, context: ToolContext): Promise<string> {
  const { path } = params as { path?: string };
  const dirPath = (path || '/') as string;

  if (typeof dirPath !== 'string') {
    return 'Error: Invalid path argument';
  }

  try {
    const backend = new D1Backend(context.db, context.sessionId);
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
}

/**
 * Search emails in Enron database
 * Wrapper around the email.ts implementation
 */
async function emailSearchHandler(params: unknown, context: ToolContext): Promise<string> {
  if (!context.ENRON_DB) {
    return 'Error: ENRON_DB binding not configured';
  }

  try {
    const result = await emailSearchHandlerImpl(params, { ENRON_DB: context.ENRON_DB });
    return JSON.stringify(result, null, 2);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}

/**
 * Get full email by message_id
 * Wrapper around the email.ts implementation
 */
async function emailGetHandler(params: unknown, context: ToolContext): Promise<string> {
  if (!context.ENRON_DB) {
    return 'Error: ENRON_DB binding not configured';
  }

  try {
    const result = await emailGetHandlerImpl(params, { ENRON_DB: context.ENRON_DB });
    return JSON.stringify(result, null, 2);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}

/**
 * Central registry mapping handler_key to implementation
 * This is the single source of truth for tool handlers
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  'execute_python': executePythonHandler,
  'read_file': readFileHandler,
  'write_file': writeFileHandler,
  'list_files': listFilesHandler,
  'email_search': emailSearchHandler,
  'email_get': emailGetHandler,
};

/**
 * Get tool handler by key
 */
export function getToolHandler(handlerKey: string): ToolHandler | undefined {
  return TOOL_HANDLERS[handlerKey];
}

/**
 * Convert JSON Schema string to Zod schema
 * Simplified implementation - supports common types
 */
function jsonSchemaToZod(schemaJson: string): ZodSchema {
  try {
    const schema = JSON.parse(schemaJson);

    if (schema.type === 'object' && schema.properties) {
      // Build Zod object schema from properties
      const shape: Record<string, ZodSchema> = {};

      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        let zodType: ZodSchema;

        switch (prop.type) {
          case 'string':
            zodType = z.string();
            break;
          case 'number':
            zodType = z.number();
            break;
          case 'integer':
            zodType = z.number().int();
            break;
          case 'boolean':
            zodType = z.boolean();
            break;
          case 'array':
            zodType = z.array(z.any());
            break;
          case 'object':
            zodType = z.object({}).passthrough();
            break;
          default:
            zodType = z.any();
        }

        // Add description if available
        if (prop.description) {
          zodType = zodType.describe(prop.description);
        }

        // Make optional if not in required array
        if (!schema.required || !schema.required.includes(key)) {
          zodType = zodType.optional();
        }

        shape[key] = zodType;
      }

      return z.object(shape);
    }

    // Fallback for non-object schemas
    return z.any();
  } catch (error) {
    console.warn('Failed to parse JSON Schema, using z.any():', error);
    return z.any();
  }
}

/**
 * Build a LangChain tool from a database tool definition
 *
 * @param definition - Tool definition from database
 * @param context - Context to pass to tool handler
 * @returns LangChain tool instance
 */
export function buildTool(definition: ToolDefinition, context: ToolContext) {
  const handler = getToolHandler(definition.handler_key);

  if (!handler) {
    throw new Error(`No handler found for tool: ${definition.id} (handler_key: ${definition.handler_key})`);
  }

  // Convert JSON Schema to Zod schema
  const zodSchema = jsonSchemaToZod(definition.parameters_schema);

  // Create LangChain tool
  return tool(
    async (params: unknown) => {
      try {
        const result = await handler(params, context);
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: definition.id, // Use ID as tool name (e.g., 'execute_python')
      description: definition.description,
      schema: zodSchema,
    }
  );
}

/**
 * Build multiple LangChain tools from definitions
 *
 * @param definitions - Array of tool definitions
 * @param context - Context to pass to tool handlers
 * @returns Array of LangChain tool instances
 */
export function buildTools(definitions: ToolDefinition[], context: ToolContext) {
  return definitions.map(def => buildTool(def, context));
}
