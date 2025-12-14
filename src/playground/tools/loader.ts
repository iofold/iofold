/**
 * Tool Loader
 *
 * Loads tool definitions from database and builds LangChain tools.
 * Provides high-level API for agent tool configuration.
 *
 * Design: Stream 4 of Tool Registry & ART-E Integration
 * See: docs/plans/2025-12-10-tool-registry-art-e-design.md
 */

import { buildTools, type ToolDefinition, type ToolContext } from './registry';
import type { StructuredTool } from '@langchain/core/tools';
import { createDb, type Database } from '../../db/client';
import { agentTools, tools } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

// Re-export ToolContext for external use
export type { ToolContext };

/**
 * Load tool IDs for a specific agent from agent_tools table
 *
 * @param db - D1 database instance
 * @param agentId - Agent ID
 * @returns Array of tool IDs configured for this agent
 */
export async function loadAgentTools(db: D1Database, agentId: string): Promise<string[]> {
  try {
    const drizzle = createDb(db);
    const result = await drizzle
      .select({ toolId: agentTools.toolId })
      .from(agentTools)
      .where(eq(agentTools.agentId, agentId))
      .orderBy(agentTools.toolId);

    return result.map(row => row.toolId);
  } catch (error) {
    console.warn(`Failed to load tools for agent ${agentId}:`, error);
    return [];
  }
}

/**
 * Load tool definitions from tools table by IDs
 *
 * @param db - D1 database instance
 * @param toolIds - Array of tool IDs to load
 * @returns Array of tool definitions
 */
export async function loadToolDefinitions(db: D1Database, toolIds: string[]): Promise<ToolDefinition[]> {
  if (toolIds.length === 0) {
    return [];
  }

  try {
    const drizzle = createDb(db);
    const result = await drizzle
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        parameters_schema: tools.parametersSchema,
        handler_key: tools.handlerKey,
        category: tools.category,
      })
      .from(tools)
      .where(inArray(tools.id, toolIds))
      .orderBy(tools.category, tools.name);

    return result;
  } catch (error) {
    console.warn(`Failed to load tool definitions for IDs ${toolIds.join(', ')}:`, error);
    return [];
  }
}

/**
 * Full pipeline: Load tool definitions for an agent and build LangChain tools
 *
 * This is the main entry point for playground agent creation.
 *
 * @param db - D1 database instance
 * @param agentId - Agent ID
 * @param context - Tool context (session, bindings, etc.)
 * @returns Array of LangChain tool instances ready for agent use
 */
export async function buildToolsForAgent(
  db: D1Database,
  agentId: string,
  context: ToolContext
): Promise<StructuredTool[]> {
  try {
    // Step 1: Load tool IDs for this agent
    const toolIds = await loadAgentTools(db, agentId);

    if (toolIds.length === 0) {
      console.log(`No tools configured for agent ${agentId}`);
      return [];
    }

    // Step 2: Load tool definitions
    const definitions = await loadToolDefinitions(db, toolIds);

    if (definitions.length === 0) {
      console.warn(`No tool definitions found for agent ${agentId}`);
      return [];
    }

    // Step 3: Build LangChain tools
    const tools = buildTools(definitions, context);

    console.log(`Built ${tools.length} tools for agent ${agentId}: ${toolIds.join(', ')}`);
    return tools;
  } catch (error) {
    console.error(`Failed to build tools for agent ${agentId}:`, error);
    return [];
  }
}

/**
 * Load tool definitions by explicit list of tool IDs and build LangChain tools
 *
 * Used when caller has already determined which tools to use.
 *
 * @param db - D1 database instance
 * @param toolIds - Array of tool IDs to load and build
 * @param context - Tool context (session, bindings, etc.)
 * @returns Array of LangChain tool instances
 */
export async function buildToolsByIds(
  db: D1Database,
  toolIds: string[],
  context: ToolContext
): Promise<StructuredTool[]> {
  if (toolIds.length === 0) {
    return [];
  }

  try {
    // Load definitions
    const definitions = await loadToolDefinitions(db, toolIds);

    if (definitions.length === 0) {
      console.warn(`No tool definitions found for IDs: ${toolIds.join(', ')}`);
      return [];
    }

    // Build tools
    const tools = buildTools(definitions, context);

    console.log(`Built ${tools.length} tools: ${toolIds.join(', ')}`);
    return tools;
  } catch (error) {
    console.error(`Failed to build tools for IDs ${toolIds.join(', ')}:`, error);
    return [];
  }
}
