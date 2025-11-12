/**
 * Mock implementation of Cloudflare Sandbox SDK for testing
 * This uses Node.js child_process to execute Python code locally
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Sandbox } from '@cloudflare/sandbox';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecOptions {
  timeout?: number;
}

class MockSandbox implements Partial<Sandbox> {
  private files: Map<string, string> = new Map();
  private tempDir: string;

  constructor(private sandboxId: string) {
    // Create a temporary directory for this sandbox instance
    this.tempDir = join(tmpdir(), `mock-sandbox-${sandboxId}`);
    try {
      mkdirSync(this.tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Store file content in memory
    this.files.set(path, content);

    // Also write to actual temp directory for execution
    const localPath = join(this.tempDir, path.replace(/^\//, ''));
    const dir = join(localPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(localPath, content, 'utf-8');
  }

  async readFile(path: string): Promise<{ content: string; encoding: string }> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return { content, encoding: 'utf-8' };
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    return new Promise((resolve) => {
      const timeout = options?.timeout || 5000;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Parse the command to get the script path
      const scriptMatch = command.match(/python3?\s+(.+)/);
      if (!scriptMatch) {
        resolve({
          success: false,
          stdout: '',
          stderr: 'Invalid command format',
          exitCode: 1
        });
        return;
      }

      const scriptPath = scriptMatch[1];
      const localPath = join(this.tempDir, scriptPath.replace(/^\//, ''));

      // Execute Python with the local file
      const child = spawn('python3', [localPath]);

      // Set timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          resolve({
            success: false,
            stdout,
            stderr: stderr || `Execution timeout exceeded ${timeout}ms`,
            exitCode: -1
          });
        } else {
          resolve({
            success: code === 0,
            stdout,
            stderr,
            exitCode: code || 0
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: 1
        });
      });
    });
  }

  async destroy(): Promise<void> {
    // Clean up temporary files
    try {
      const files = Array.from(this.files.keys());
      for (const file of files) {
        const localPath = join(this.tempDir, file.replace(/^\//, ''));
        try {
          unlinkSync(localPath);
        } catch {
          // Ignore if file doesn't exist
        }
      }
      this.files.clear();
    } catch (error) {
      console.error('Error cleaning up mock sandbox:', error);
    }
  }
}

/**
 * Mock implementation of getSandbox for testing
 */
export function getMockSandbox(
  binding: any,
  sandboxId: string,
  options?: { keepAlive?: boolean }
): Sandbox {
  return new MockSandbox(sandboxId) as unknown as Sandbox;
}

/**
 * Mock sandbox binding namespace for tests
 */
export const mockSandboxBinding = {} as DurableObjectNamespace<Sandbox>;
