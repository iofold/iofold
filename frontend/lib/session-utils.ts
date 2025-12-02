/**
 * Session management utilities for the playground
 * Handles session deletion and export functionality
 */

import { Message } from '@/hooks/use-playground-chat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

/**
 * Delete a playground session
 * @param agentId - The agent ID
 * @param sessionId - The session ID to delete
 * @param workspaceId - The workspace ID
 * @throws Error if the deletion fails
 */
export async function deleteSession(
  agentId: string,
  sessionId: string,
  workspaceId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/agents/${agentId}/playground/sessions/${sessionId}`,
    {
      method: 'DELETE',
      headers: {
        'X-Workspace-Id': workspaceId,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || errorData.error || `Failed to delete session: ${response.status}`
    );
  }
}

/**
 * Export session messages as JSON
 * @param messages - The messages to export
 * @param agentName - The agent name for the filename
 * @param sessionId - Optional session ID for the filename
 */
export function exportSessionAsJson(
  messages: Message[] | Array<{ role: string; content: string }>,
  agentName: string,
  sessionId?: string
): void {
  const exportData = {
    agent: agentName,
    sessionId: sessionId || 'unknown',
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((msg) => {
      // Handle both full Message type and simplified API response
      if ('id' in msg) {
        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          toolCalls: msg.toolCalls,
          error: msg.error,
          traceId: msg.traceId,
          feedbackRating: msg.feedbackRating,
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    }),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(agentName)}-session-${sessionId?.slice(0, 8) || 'export'}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export session messages as markdown
 * @param messages - The messages to export
 * @param agentName - The agent name for the content and filename
 * @param sessionId - Optional session ID for the filename
 */
export function exportSessionAsMarkdown(
  messages: Message[] | Array<{ role: string; content: string }>,
  agentName: string,
  sessionId?: string
): void {
  let markdown = `# ${agentName} - Playground Session\n\n`;
  markdown += `**Session ID:** ${sessionId || 'N/A'}  \n`;
  markdown += `**Exported:** ${new Date().toISOString()}  \n`;
  markdown += `**Messages:** ${messages.length}\n\n`;
  markdown += '---\n\n';

  messages.forEach((msg, index) => {
    const roleBadge = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
    markdown += `## ${index + 1}. ${roleBadge}\n\n`;

    // Only add timestamp if message has it (full Message type)
    if ('timestamp' in msg && msg.timestamp) {
      const timestamp = msg.timestamp as Date | string;
      markdown += `**Timestamp:** ${new Date(timestamp).toLocaleString()}  \n`;
    }

    if ('traceId' in msg && msg.traceId) {
      markdown += `**Trace ID:** \`${msg.traceId}\`  \n`;
    }

    if ('feedbackRating' in msg && msg.feedbackRating) {
      markdown += `**Feedback:** ${msg.feedbackRating}  \n`;
    }

    markdown += '\n';

    if (msg.content) {
      markdown += `${msg.content}\n\n`;
    }

    // Include tool calls if present (only in full Message type)
    if ('toolCalls' in msg && msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
      markdown += '### Tool Calls\n\n';
      msg.toolCalls.forEach((tool: any) => {
        markdown += `**${tool.name}** (${tool.state})\n\n`;

        if (tool.args && Object.keys(tool.args).length > 0) {
          markdown += '```json\n';
          markdown += JSON.stringify(tool.args, null, 2);
          markdown += '\n```\n\n';
        }

        if (tool.result !== undefined) {
          markdown += '**Result:**\n```\n';
          markdown += typeof tool.result === 'string'
            ? tool.result
            : JSON.stringify(tool.result, null, 2);
          markdown += '\n```\n\n';
        }

        if (tool.error) {
          markdown += `**Error:** ${tool.error}\n\n`;
        }

        if (tool.latencyMs) {
          markdown += `*Latency: ${tool.latencyMs}ms*\n\n`;
        }
      });
    }

    // Include error if present (only in full Message type)
    if ('error' in msg && msg.error) {
      markdown += `> ⚠️ **Error:** ${msg.error}\n\n`;
    }

    markdown += '---\n\n';
  });

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(agentName)}-session-${sessionId?.slice(0, 8) || 'export'}-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename for safe download
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9-_]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/**
 * List all sessions for an agent
 * @param agentId - The agent ID
 * @param workspaceId - The workspace ID
 * @returns Array of session objects
 */
export async function listSessions(
  agentId: string,
  workspaceId: string
): Promise<PlaygroundSession[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/agents/${agentId}/playground/sessions`,
    {
      headers: {
        'X-Workspace-Id': workspaceId,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || errorData.error || `Failed to list sessions: ${response.status}`
    );
  }

  const data = await response.json();
  return data.sessions || [];
}

/**
 * Get a specific session by ID
 * @param agentId - The agent ID
 * @param sessionId - The session ID
 * @param workspaceId - The workspace ID
 * @returns Session object with messages
 */
export async function getSession(
  agentId: string,
  sessionId: string,
  workspaceId: string
): Promise<SessionWithMessages | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/agents/${agentId}/playground/sessions/${sessionId}`,
    {
      headers: {
        'X-Workspace-Id': workspaceId,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || errorData.error || `Failed to get session: ${response.status}`
    );
  }

  return response.json();
}

// Type definitions
export interface PlaygroundSession {
  id: string;
  agentVersionId: string;
  modelProvider: 'anthropic' | 'openai' | 'google';
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWithMessages extends PlaygroundSession {
  messages: Message[];
  variables?: Record<string, string>;
  files?: Record<string, unknown>;
}
