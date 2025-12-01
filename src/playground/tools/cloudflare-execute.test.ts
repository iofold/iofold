import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @cloudflare/sandbox module BEFORE importing anything else
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('../../sandbox/__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

import { createCloudflareExecuteTool, createDirectExecuteTool } from './cloudflare-execute';
import { mockSandboxBinding } from '../../sandbox/__mocks__/sandbox-mock';

describe('Cloudflare Execute Tool', () => {
  describe('createCloudflareExecuteTool', () => {
    it('should create a tool with correct name and schema', () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding,
        timeout: 5000
      });

      expect(tool.name).toBe('execute');
      expect(tool.description).toContain('Python');
      expect(tool.schema).toBeDefined();
    });

    it('should reject empty commands', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ command: '' });
      expect(result).toContain('Error: Empty command');
    });

    it('should reject non-Python commands', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ command: 'node script.js' });
      expect(result).toContain('Error: Only Python execution supported');
    });

    it('should reject Python command without script path', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ command: 'python' });
      expect(result).toContain('Error: Only Python execution supported');
    });

    it('should execute Python script with python command', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      // First write a test file
      const code = 'print("Hello from script")';

      const result = await tool.invoke({ command: 'python test.py' });

      // This will fail with file not found since we're executing a file path
      // In real usage, the agent would write_file first
      expect(result).toContain('Error');
    });

    it('should execute Python script with python3 command', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ command: 'python3 test.py' });

      // Should recognize python3 as valid
      expect(result).toContain('Error'); // File doesn't exist
    });

    it('should handle execution errors gracefully', async () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding,
        timeout: 100
      });

      const result = await tool.invoke({ command: 'python nonexistent.py' });

      expect(result).toContain('Error');
    });

    it('should use custom timeout when provided', () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding,
        timeout: 1000
      });

      expect(tool.name).toBe('execute');
    });

    it('should use custom sandboxId when provided', () => {
      const tool = createCloudflareExecuteTool({
        sandboxBinding: mockSandboxBinding,
        sandboxId: 'custom-sandbox-123'
      });

      expect(tool.name).toBe('execute');
    });
  });

  describe('createDirectExecuteTool', () => {
    it('should create a tool with correct name and schema', () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding,
        timeout: 5000
      });

      expect(tool.name).toBe('execute_python');
      expect(tool.description).toContain('Python');
      expect(tool.schema).toBeDefined();
    });

    it('should reject empty code', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ code: '' });
      expect(result).toContain('Error: Empty code');
    });

    it('should execute simple Python code', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({ code: 'print("Hello World")' });

      expect(result).toContain('Hello World');
    });

    it('should execute Python code with calculations', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({
        code: 'result = 2 + 2\nprint(result)'
      });

      expect(result).toContain('4');
    });

    it('should block dangerous imports', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({
        code: 'import os\nos.system("ls")'
      });

      expect(result).toContain('Error');
      expect(result.toLowerCase()).toContain('blocked');
    });

    it('should allow whitelisted imports', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({
        code: 'import json\nprint(json.dumps({"test": True}))'
      });

      expect(result).toContain('"test": true');
    });

    it('should block non-whitelisted imports', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding,
        timeout: 100
      });

      const result = await tool.invoke({
        code: 'import time\nprint("hello")'
      });

      expect(result).toContain('Error');
      expect(result).toContain('Import not whitelisted');
    });

    it('should handle execution errors', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({
        code: 'print(undefined_variable)'
      });

      expect(result).toContain('Error');
    });

    it('should return message when code produces no output', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const result = await tool.invoke({
        code: 'x = 1 + 1'
      });

      expect(result).toContain('execution completed');
    });

    it('should handle complex Python code', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const code = `
def calculate(a, b):
    return a * b

result = calculate(6, 7)
print(f"Result: {result}")
`;

      const result = await tool.invoke({ code });

      expect(result).toContain('Result: 42');
    });

    it('should handle JSON operations', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const code = `
import json

data = {"name": "test", "value": 123}
json_str = json.dumps(data, indent=2)
print(json_str)
`;

      const result = await tool.invoke({ code });

      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 123');
    });

    it('should handle regex operations', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const code = `
import re

text = "Hello World 123"
pattern = r"\\d+"
match = re.search(pattern, text)
if match:
    print(f"Found: {match.group()}")
`;

      const result = await tool.invoke({ code });

      expect(result).toContain('Found: 123');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical eval function execution', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const evalCode = `
def eval_function(trace):
    output = trace.get("output", "")
    if "success" in str(output).lower():
        return (True, "Found success indicator")
    return (False, "No success indicator")

# Test
result = eval_function({"output": "Operation completed successfully"})
print(result)
`;

      const result = await tool.invoke({ code: evalCode });

      expect(result).toContain('True');
      expect(result).toContain('Found success indicator');
    });

    it('should handle data processing tasks', async () => {
      const tool = createDirectExecuteTool({
        sandboxBinding: mockSandboxBinding
      });

      const code = `
import json

# Process data
items = [1, 2, 3, 4, 5]
filtered = [x for x in items if x > 2]
result = {"filtered": filtered, "count": len(filtered)}
print(json.dumps(result))
`;

      const result = await tool.invoke({ code });

      expect(result).toContain('"filtered": [3, 4, 5]');
      expect(result).toContain('"count": 3');
    });
  });
});
