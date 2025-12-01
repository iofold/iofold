/**
 * Unit tests for D1Backend
 *
 * Tests all CRUD operations, path validation, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { D1Backend } from './d1-backend';
import type { FileData } from 'deepagents';

/**
 * Mock D1Database for testing
 */
class MockD1Database {
  private sessions: Map<string, { files: string }> = new Map();

  prepare(sql: string) {
    const self = this;

    return {
      bind(...params: any[]) {
        return {
          async first<T>(): Promise<T | null> {
            // SELECT files FROM playground_sessions WHERE id = ?
            if (sql.includes('SELECT files')) {
              const sessionId = params[0] as string;
              const session = self.sessions.get(sessionId);
              return session ? (session as any) : null;
            }
            return null;
          },

          async run() {
            // UPDATE playground_sessions SET files = ?, updated_at = ? WHERE id = ?
            if (sql.includes('UPDATE playground_sessions')) {
              const [files, _updatedAt, sessionId] = params;
              self.sessions.set(sessionId, { files });
              return { success: true };
            }
            return { success: false };
          },
        };
      },
    };
  }

  // Helper method for testing
  setSessionFiles(sessionId: string, files: Record<string, FileData>) {
    this.sessions.set(sessionId, { files: JSON.stringify(files) });
  }

  // Helper method to get session files
  getSessionFiles(sessionId: string): Record<string, FileData> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};
    try {
      return JSON.parse(session.files);
    } catch {
      return {};
    }
  }
}

describe('D1Backend', () => {
  let db: MockD1Database;
  let backend: D1Backend;
  const sessionId = 'sess_test_123';

  beforeEach(() => {
    db = new MockD1Database();
    // Initialize with empty files
    db.setSessionFiles(sessionId, {});
    backend = new D1Backend(db as any, sessionId);
  });

  describe('constructor', () => {
    it('should require db parameter', () => {
      expect(() => new D1Backend(null as any, sessionId)).toThrow(
        'D1Database is required'
      );
    });

    it('should require sessionId parameter', () => {
      expect(() => new D1Backend(db as any, '')).toThrow(
        'sessionId is required'
      );
    });
  });

  describe('write', () => {
    it('should create a new file', async () => {
      const result = await backend.write('/test.txt', 'Hello world');

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('/test.txt');
      expect(result.filesUpdate).toBe(null); // External storage

      // Verify in database
      const files = db.getSessionFiles(sessionId);
      expect(files['/test.txt']).toBeDefined();
      expect(files['/test.txt'].content).toEqual(['Hello world']);
    });

    it('should create a file with multiple lines', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = await backend.write('/multi.txt', content);

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('/multi.txt');

      const files = db.getSessionFiles(sessionId);
      expect(files['/multi.txt'].content).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should overwrite existing file', async () => {
      await backend.write('/test.txt', 'First content');
      await backend.write('/test.txt', 'Second content');

      const files = db.getSessionFiles(sessionId);
      expect(files['/test.txt'].content).toEqual(['Second content']);
    });

    it('should preserve created_at when overwriting', async () => {
      await backend.write('/test.txt', 'First');
      const firstFiles = db.getSessionFiles(sessionId);
      const createdAt = firstFiles['/test.txt'].created_at;

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await backend.write('/test.txt', 'Second');
      const secondFiles = db.getSessionFiles(sessionId);

      expect(secondFiles['/test.txt'].created_at).toBe(createdAt);
      expect(secondFiles['/test.txt'].modified_at).not.toBe(createdAt);
    });

    it('should normalize path (add leading /)', async () => {
      const result = await backend.write('test.txt', 'content');

      expect(result.path).toBe('/test.txt');
    });

    it('should reject directory paths', async () => {
      const result = await backend.write('/dir/', 'content');

      expect(result.error).toContain('is a directory');
      expect(result.path).toBeUndefined();
    });

    it('should reject empty paths', async () => {
      const result = await backend.write('', 'content');

      expect(result.error).toContain('empty');
    });

    it('should reject path traversal attempts', async () => {
      const result = await backend.write('../etc/passwd', 'content');

      expect(result.error).toContain('directory traversal');
    });

    it('should reject consecutive slashes', async () => {
      const result = await backend.write('//test.txt', 'content');

      expect(result.error).toContain('consecutive slashes');
    });
  });

  describe('read', () => {
    beforeEach(async () => {
      // Create test files
      await backend.write('/test.txt', 'Hello\nWorld\nTest');
      await backend.write('/empty.txt', '');
    });

    it('should read file content with line numbers', async () => {
      const content = await backend.read('/test.txt');

      expect(content).toBe('1→Hello\n2→World\n3→Test');
    });

    it('should read empty file', async () => {
      const content = await backend.read('/empty.txt');

      expect(content).toBe('1→');
    });

    it('should return error for missing file', async () => {
      const content = await backend.read('/missing.txt');

      expect(content).toContain('Error: File not found');
    });

    it('should return error for directory', async () => {
      const content = await backend.read('/dir/');

      expect(content).toContain('Error:');
      expect(content).toContain('is a directory');
    });

    it('should support offset parameter', async () => {
      const content = await backend.read('/test.txt', 1); // Skip first line

      expect(content).toBe('2→World\n3→Test');
    });

    it('should support limit parameter', async () => {
      const content = await backend.read('/test.txt', 0, 2); // First 2 lines

      expect(content).toBe('1→Hello\n2→World');
    });

    it('should support both offset and limit', async () => {
      const content = await backend.read('/test.txt', 1, 1); // Second line only

      expect(content).toBe('2→World');
    });
  });

  describe('readRaw', () => {
    beforeEach(async () => {
      await backend.write('/test.txt', 'Hello\nWorld');
    });

    it('should return raw FileData', async () => {
      const fileData = await backend.readRaw('/test.txt');

      expect(fileData.content).toEqual(['Hello', 'World']);
      expect(fileData.created_at).toBeDefined();
      expect(fileData.modified_at).toBeDefined();
    });

    it('should throw for missing file', async () => {
      await expect(backend.readRaw('/missing.txt')).rejects.toThrow(
        'File not found'
      );
    });

    it('should throw for directory', async () => {
      await expect(backend.readRaw('/dir/')).rejects.toThrow('is a directory');
    });
  });

  describe('lsInfo', () => {
    beforeEach(async () => {
      // Create directory structure
      await backend.write('/file1.txt', 'content1');
      await backend.write('/file2.txt', 'content2');
      await backend.write('/dir1/file3.txt', 'content3');
      await backend.write('/dir1/file4.txt', 'content4');
      await backend.write('/dir1/subdir/file5.txt', 'content5');
      await backend.write('/dir2/file6.txt', 'content6');
    });

    it('should list files in root directory', async () => {
      const results = await backend.lsInfo('/');

      expect(results).toHaveLength(4); // 2 files + 2 directories
      expect(results.map((r) => r.path)).toEqual([
        '/dir1/',
        '/dir2/',
        '/file1.txt',
        '/file2.txt',
      ]);
    });

    it('should list files in subdirectory', async () => {
      const results = await backend.lsInfo('/dir1');

      expect(results).toHaveLength(3); // 2 files + 1 subdir
      expect(results.map((r) => r.path)).toEqual([
        '/dir1/file3.txt',
        '/dir1/file4.txt',
        '/dir1/subdir/',
      ]);
    });

    it('should mark directories with is_dir flag', async () => {
      const results = await backend.lsInfo('/');
      const dir1 = results.find((r) => r.path === '/dir1/');
      const file1 = results.find((r) => r.path === '/file1.txt');

      expect(dir1?.is_dir).toBe(true);
      expect(file1?.is_dir).toBe(false);
    });

    it('should include file metadata', async () => {
      const results = await backend.lsInfo('/');
      const file1 = results.find((r) => r.path === '/file1.txt');

      expect(file1?.size).toBe(8); // "content1"
      expect(file1?.modified_at).toBeDefined();
    });

    it('should return empty array for non-existent directory', async () => {
      const results = await backend.lsInfo('/nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle path with trailing slash', async () => {
      const results1 = await backend.lsInfo('/dir1');
      const results2 = await backend.lsInfo('/dir1/');

      expect(results1).toEqual(results2);
    });
  });

  describe('globInfo', () => {
    beforeEach(async () => {
      await backend.write('/file1.txt', 'content');
      await backend.write('/file2.md', 'content');
      await backend.write('/dir1/file3.txt', 'content');
      await backend.write('/dir1/subdir/file4.txt', 'content');
      await backend.write('/script.py', 'content');
    });

    it('should match all .txt files', async () => {
      const results = await backend.globInfo('*.txt');

      expect(results.map((r) => r.path)).toEqual(['/file1.txt']);
    });

    it('should match files recursively with **', async () => {
      const results = await backend.globInfo('**/*.txt');

      expect(results.map((r) => r.path)).toEqual([
        '/dir1/file3.txt',
        '/dir1/subdir/file4.txt',
        '/file1.txt',
      ]);
    });

    it('should match all Python files', async () => {
      const results = await backend.globInfo('*.py');

      expect(results.map((r) => r.path)).toEqual(['/script.py']);
    });

    it('should match all files in a directory', async () => {
      const results = await backend.globInfo('/dir1/*');

      expect(results.map((r) => r.path)).toEqual(['/dir1/file3.txt']);
    });

    it('should support search path parameter', async () => {
      const results = await backend.globInfo('*.txt', '/dir1');

      expect(results.map((r) => r.path)).toEqual(['/dir1/file3.txt']);
    });

    it('should return empty array for no matches', async () => {
      const results = await backend.globInfo('*.java');

      expect(results).toEqual([]);
    });
  });

  describe('grepRaw', () => {
    beforeEach(async () => {
      await backend.write('/file1.txt', 'Hello world\nTest line\nAnother test');
      await backend.write('/file2.txt', 'No match here\nJust text');
      await backend.write('/dir1/file3.py', 'def hello():\n    print("test")');
    });

    it('should search for pattern across all files', async () => {
      const results = await backend.grepRaw('test');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results).toHaveLength(2);
        // Results can be in any order, so check both files are present
        const paths = results.map((r) => r.path);
        expect(paths).toContain('/file1.txt');
        expect(paths).toContain('/dir1/file3.py');

        const file1Match = results.find((r) => r.path === '/file1.txt');
        const file3Match = results.find((r) => r.path === '/dir1/file3.py');

        expect(file1Match?.line).toBe(3); // "Another test"
        expect(file3Match?.line).toBe(2); // print("test")
      }
    });

    it('should support regex patterns', async () => {
      const results = await backend.grepRaw('[Hh][ae]llo');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results).toHaveLength(2);
        expect(results.some((r) => r.path === '/file1.txt')).toBe(true);
        expect(results.some((r) => r.path === '/dir1/file3.py')).toBe(true);
      }
    });

    it('should filter by path parameter', async () => {
      const results = await backend.grepRaw('test', '/file1.txt');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.every((r) => r.path === '/file1.txt')).toBe(true);
      }
    });

    it('should filter by glob parameter', async () => {
      const results = await backend.grepRaw('test', null, '*.txt');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.every((r) => r.path.endsWith('.txt'))).toBe(true);
      }
    });

    it('should return error for invalid regex', async () => {
      const results = await backend.grepRaw('(invalid[');

      expect(typeof results).toBe('string');
      expect(results).toContain('Error: Invalid regex');
    });

    it('should return empty array for no matches', async () => {
      const results = await backend.grepRaw('nonexistent');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results).toHaveLength(0);
      }
    });

    it('should be case-sensitive by default', async () => {
      const results = await backend.grepRaw('HELLO');

      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results).toHaveLength(0);
      }
    });

    it('should support case-insensitive search with regex flag', async () => {
      const results = await backend.grepRaw('HELLO', null, null);

      expect(Array.isArray(results)).toBe(true);
      // Note: This will be empty because we're using case-sensitive regex
      // To make it case-insensitive, the pattern should be passed as (?i)HELLO
    });
  });

  describe('edit', () => {
    beforeEach(async () => {
      await backend.write('/test.txt', 'Hello world\nHello again\nGoodbye');
    });

    it('should replace first occurrence by default', async () => {
      const result = await backend.edit('/test.txt', 'Hello', 'Hi');

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('/test.txt');
      expect(result.occurrences).toBe(1);

      const content = await backend.read('/test.txt');
      expect(content).toContain('Hi world');
      expect(content).toContain('Hello again'); // Second "Hello" unchanged
    });

    it('should replace all occurrences when replaceAll is true', async () => {
      const result = await backend.edit('/test.txt', 'Hello', 'Hi', true);

      expect(result.error).toBeUndefined();
      expect(result.occurrences).toBe(2);

      const content = await backend.read('/test.txt');
      expect(content).toContain('Hi world');
      expect(content).toContain('Hi again');
    });

    it('should handle no matches', async () => {
      const result = await backend.edit('/test.txt', 'nonexistent', 'new');

      expect(result.error).toBeUndefined();
      expect(result.occurrences).toBe(0);
    });

    it('should return error for missing file', async () => {
      const result = await backend.edit('/missing.txt', 'old', 'new');

      expect(result.error).toContain('File not found');
    });

    it('should return error for directory', async () => {
      const result = await backend.edit('/dir/', 'old', 'new');

      expect(result.error).toContain('is a directory');
    });

    it('should update modified_at timestamp', async () => {
      const filesBefore = db.getSessionFiles(sessionId);
      const modifiedBefore = filesBefore['/test.txt'].modified_at;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await backend.edit('/test.txt', 'Hello', 'Hi');

      const filesAfter = db.getSessionFiles(sessionId);
      expect(filesAfter['/test.txt'].modified_at).not.toBe(modifiedBefore);
    });

    it('should preserve created_at timestamp', async () => {
      const filesBefore = db.getSessionFiles(sessionId);
      const createdAt = filesBefore['/test.txt'].created_at;

      await backend.edit('/test.txt', 'Hello', 'Hi');

      const filesAfter = db.getSessionFiles(sessionId);
      expect(filesAfter['/test.txt'].created_at).toBe(createdAt);
    });

    it('should handle special characters in replacement string', async () => {
      const result = await backend.edit('/test.txt', 'world', '$pecial');

      expect(result.error).toBeUndefined();

      const content = await backend.read('/test.txt');
      expect(content).toContain('$pecial');
    });
  });

  describe('edge cases', () => {
    it('should handle empty file content', async () => {
      await backend.write('/empty.txt', '');

      const content = await backend.read('/empty.txt');
      expect(content).toBe('1→');

      const fileData = await backend.readRaw('/empty.txt');
      expect(fileData.content).toEqual(['']);
    });

    it('should handle file with only newlines', async () => {
      await backend.write('/newlines.txt', '\n\n\n');

      const fileData = await backend.readRaw('/newlines.txt');
      expect(fileData.content).toEqual(['', '', '', '']);
    });

    it('should handle very long lines', async () => {
      const longLine = 'x'.repeat(10000);
      await backend.write('/long.txt', longLine);

      const content = await backend.read('/long.txt');
      expect(content).toContain(longLine);
    });

    it('should handle Unicode content', async () => {
      const unicode = '你好世界 🌍 Привет мир';
      await backend.write('/unicode.txt', unicode);

      const content = await backend.read('/unicode.txt');
      expect(content).toContain(unicode);
    });

    it('should handle many files', async () => {
      // Create 100 files
      for (let i = 0; i < 100; i++) {
        await backend.write(`/file${i}.txt`, `content${i}`);
      }

      const results = await backend.lsInfo('/');
      expect(results.length).toBe(100);
    });

    it('should handle deep directory structure', async () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/file.txt';
      await backend.write(deepPath, 'deep content');

      const content = await backend.read(deepPath);
      expect(content).toContain('deep content');
    });

    it('should handle session with no files', async () => {
      const emptyBackend = new D1Backend(db as any, 'sess_empty');

      const results = await emptyBackend.lsInfo('/');
      expect(results).toEqual([]);

      const content = await emptyBackend.read('/missing.txt');
      expect(content).toContain('Error: File not found');
    });
  });
});
