/**
 * D1Backend - DeepAgents BackendProtocol implementation for Cloudflare D1
 *
 * Implements the BackendProtocol from deepagents to persist virtual filesystem
 * to D1 database in the playground_sessions.files JSON column.
 *
 * All file operations read/write from a single session's files JSON object.
 * Path validation prevents directory traversal attacks.
 */

/// <reference types="@cloudflare/workers-types" />

import type {
  BackendProtocol,
  FileInfo,
  FileData,
  WriteResult,
  EditResult,
  GrepMatch,
} from 'deepagents';

/**
 * Validates file path to prevent directory traversal attacks
 * and ensure consistent path format.
 *
 * @param path - Path to validate
 * @returns Normalized absolute path
 * @throws Error if path is invalid or contains traversal attempts
 */
function validatePath(path: string): string {
  // Remove leading/trailing whitespace
  const trimmed = path.trim();

  if (!trimmed) {
    throw new Error('Path cannot be empty');
  }

  // Ensure path starts with /
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // Check for directory traversal attempts
  if (normalized.includes('..')) {
    throw new Error('Path cannot contain ".." (directory traversal)');
  }

  // Check for other suspicious patterns
  if (normalized.includes('//')) {
    throw new Error('Path cannot contain consecutive slashes');
  }

  return normalized;
}

/**
 * Parse and validate file data from JSON
 */
function parseFileData(json: string | null): Record<string, FileData> {
  if (!json) {
    return {};
  }

  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Check if a path represents a directory (ends with /)
 */
function isDirectory(path: string): boolean {
  return path.endsWith('/');
}

/**
 * Get parent directory path
 */
function getParentPath(path: string): string {
  const normalized = validatePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
}

/**
 * Match glob pattern against path
 * Simplified implementation - supports * and ** wildcards
 */
function matchGlob(pattern: string, path: string): boolean {
  // Escape special regex characters except * and /
  let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert glob to regex
  // First replace ** with a placeholder to avoid conflict with *
  let regex = escaped
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>') // Placeholder for **
    .replace(/\*/g, '[^/]*') // * matches any file/dir name (not /)
    .replace(/<<<DOUBLESTAR>>>/g, '.*?'); // ** matches any path including / (non-greedy)

  // Special handling for **/ pattern - it should match zero or more directories
  // So **/foo should match /foo, /a/foo, /a/b/foo, etc.
  regex = regex.replace(/\.\*\?\//g, '(?:.*/)?');

  // Add anchors if not already present
  if (!regex.startsWith('^') && !regex.startsWith('/')) {
    regex = '^/' + regex;
  } else if (!regex.startsWith('^')) {
    regex = '^' + regex;
  }

  if (!regex.endsWith('$')) {
    regex = regex + '$';
  }

  try {
    return new RegExp(regex).test(path);
  } catch {
    return false;
  }
}

/**
 * D1Backend - Implements BackendProtocol for Cloudflare D1 storage
 */
export class D1Backend implements BackendProtocol {
  constructor(
    private db: D1Database,
    private sessionId: string
  ) {
    if (!db) {
      throw new Error('D1Database is required');
    }
    if (!sessionId) {
      throw new Error('sessionId is required');
    }
  }

  /**
   * Get session from database
   */
  private async getSession(): Promise<{ files: string | null } | null> {
    const result = await this.db
      .prepare('SELECT files FROM playground_sessions WHERE id = ?')
      .bind(this.sessionId)
      .first<{ files: string | null }>();

    return result;
  }

  /**
   * Update session files in database
   */
  private async updateFiles(files: Record<string, FileData>): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        'UPDATE playground_sessions SET files = ?, updated_at = ? WHERE id = ?'
      )
      .bind(JSON.stringify(files), now, this.sessionId)
      .run();
  }

  /**
   * Structured listing with file metadata.
   *
   * Lists files and directories in the specified directory (non-recursive).
   * Directories have a trailing / in their path and is_dir=true.
   */
  async lsInfo(path: string): Promise<FileInfo[]> {
    const normalized = validatePath(path);
    const session = await this.getSession();
    const files = parseFileData(session?.files || null);

    const results: FileInfo[] = [];
    const dirPath = isDirectory(normalized) ? normalized : normalized + '/';

    // Find all files/dirs directly in this directory
    const seen = new Set<string>();

    for (const filePath of Object.keys(files)) {
      // Skip if not in this directory
      if (!filePath.startsWith(dirPath)) {
        continue;
      }

      // Get relative path within directory
      const relativePath = filePath.substring(dirPath.length);

      // Skip if empty (the directory itself)
      if (!relativePath) {
        continue;
      }

      // Check if this is a direct child or subdirectory
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        // Direct file child
        const fileData = files[filePath];
        results.push({
          path: filePath,
          is_dir: false,
          size: fileData.content.join('\n').length,
          modified_at: fileData.modified_at,
        });
      } else {
        // Subdirectory - add it once
        const subdirName = relativePath.substring(0, slashIndex);
        const subdirPath = dirPath + subdirName + '/';

        if (!seen.has(subdirPath)) {
          seen.add(subdirPath);
          results.push({
            path: subdirPath,
            is_dir: true,
          });
        }
      }
    }

    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Read file content with line numbers or an error string.
   */
  async read(
    filePath: string,
    offset: number = 0,
    limit: number = 2000
  ): Promise<string> {
    try {
      const normalized = validatePath(filePath);

      if (isDirectory(normalized)) {
        return `Error: ${filePath} is a directory`;
      }

      const session = await this.getSession();
      const files = parseFileData(session?.files || null);
      const fileData = files[normalized];

      if (!fileData) {
        return `Error: File not found: ${filePath}`;
      }

      // Apply offset and limit
      const lines = fileData.content.slice(offset, offset + limit);

      // Format with line numbers (1-indexed)
      return lines
        .map((line, idx) => `${offset + idx + 1}→${line}`)
        .join('\n');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Read file content as raw FileData.
   */
  async readRaw(filePath: string): Promise<FileData> {
    const normalized = validatePath(filePath);

    if (isDirectory(normalized)) {
      throw new Error(`${filePath} is a directory`);
    }

    const session = await this.getSession();
    const files = parseFileData(session?.files || null);
    const fileData = files[normalized];

    if (!fileData) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fileData;
  }

  /**
   * Structured search results or error string for invalid input.
   *
   * Searches file contents for a regex pattern.
   */
  async grepRaw(
    pattern: string,
    path: string | null = null,
    glob: string | null = null
  ): Promise<GrepMatch[] | string> {
    try {
      // Validate regex pattern
      const regex = new RegExp(pattern);

      const session = await this.getSession();
      const files = parseFileData(session?.files || null);
      const matches: GrepMatch[] = [];

      // Determine search path
      const searchPath = path ? validatePath(path) : '/';

      for (const [filePath, fileData] of Object.entries(files)) {
        // Skip directories
        if (isDirectory(filePath)) {
          continue;
        }

        // Filter by path prefix
        if (!filePath.startsWith(searchPath)) {
          continue;
        }

        // Filter by glob pattern if provided
        if (glob && !matchGlob(glob, filePath)) {
          continue;
        }

        // Search in file content
        fileData.content.forEach((line, idx) => {
          if (regex.test(line)) {
            matches.push({
              path: filePath,
              line: idx + 1, // 1-indexed
              text: line,
            });
          }
        });
      }

      return matches;
    } catch (error) {
      return `Error: Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Structured glob matching returning FileInfo objects.
   */
  async globInfo(pattern: string, path: string = '/'): Promise<FileInfo[]> {
    const searchPath = validatePath(path);
    const session = await this.getSession();
    const files = parseFileData(session?.files || null);

    const results: FileInfo[] = [];

    // If pattern doesn't start with /, we need to match relative to searchPath
    const fullPattern = pattern.startsWith('/') ? pattern : searchPath + (searchPath.endsWith('/') ? '' : '/') + pattern;

    for (const [filePath, fileData] of Object.entries(files)) {
      // Check if path starts with search path
      if (!filePath.startsWith(searchPath)) {
        continue;
      }

      // Match against glob pattern
      if (matchGlob(fullPattern, filePath)) {
        results.push({
          path: filePath,
          is_dir: isDirectory(filePath),
          size: isDirectory(filePath)
            ? undefined
            : fileData.content.join('\n').length,
          modified_at: fileData.modified_at,
        });
      }
    }

    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Create a new file.
   */
  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      const normalized = validatePath(filePath);

      if (isDirectory(normalized)) {
        return {
          error: `${filePath} is a directory`,
        };
      }

      const session = await this.getSession();
      const files = parseFileData(session?.files || null);

      // Create file data
      const now = new Date().toISOString();
      const lines = content.split('\n');

      files[normalized] = {
        content: lines,
        created_at: files[normalized]?.created_at || now,
        modified_at: now,
      };

      // Update in database
      await this.updateFiles(files);

      return {
        path: normalized,
        // External storage - filesUpdate is null (already persisted to D1)
        filesUpdate: null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Edit a file by replacing string occurrences.
   */
  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false
  ): Promise<EditResult> {
    try {
      const normalized = validatePath(filePath);

      if (isDirectory(normalized)) {
        return {
          error: `${filePath} is a directory`,
        };
      }

      const session = await this.getSession();
      const files = parseFileData(session?.files || null);
      const fileData = files[normalized];

      if (!fileData) {
        return {
          error: `File not found: ${filePath}`,
        };
      }

      // Perform replacement
      const content = fileData.content.join('\n');
      let newContent: string;
      let occurrences = 0;

      if (replaceAll) {
        // Count occurrences
        const matches = content.match(new RegExp(escapeRegex(oldString), 'g'));
        occurrences = matches ? matches.length : 0;
        newContent = content.split(oldString).join(newString);
      } else {
        // Replace first occurrence
        const index = content.indexOf(oldString);
        if (index !== -1) {
          newContent =
            content.substring(0, index) +
            newString +
            content.substring(index + oldString.length);
          occurrences = 1;
        } else {
          newContent = content;
        }
      }

      // Update file data
      const now = new Date().toISOString();
      files[normalized] = {
        content: newContent.split('\n'),
        created_at: fileData.created_at,
        modified_at: now,
      };

      // Update in database
      await this.updateFiles(files);

      return {
        path: normalized,
        occurrences,
        // External storage - filesUpdate is null (already persisted to D1)
        filesUpdate: null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
