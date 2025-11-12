import { describe, it, expect, vi } from 'vitest';

// Mock the @cloudflare/sandbox module BEFORE importing anything else
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('./__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

import { PythonRunner } from './python-runner';
import { mockSandboxBinding } from './__mocks__/sandbox-mock';

describe('PythonRunner', () => {
  it('should execute simple Python code', async () => {
    const runner = new PythonRunner({ sandboxBinding: mockSandboxBinding });
    const result = await runner.execute('print("hello world")');

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello world');
  });

  it('should enforce timeout', async () => {
    const runner = new PythonRunner({
      timeout: 100,
      sandboxBinding: mockSandboxBinding
    });
    // Create an infinite loop to trigger timeout
    const code = 'while True: pass';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('timeout');
  });

  it('should block dangerous imports', async () => {
    const runner = new PythonRunner({ sandboxBinding: mockSandboxBinding });
    const code = 'import os; os.system("ls")';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('blocked');
  });

  it('should allow whitelisted imports', async () => {
    const runner = new PythonRunner({ sandboxBinding: mockSandboxBinding });
    const code = 'import json; print(json.dumps({"test": True}))';

    const result = await runner.execute(code);

    expect(result.success).toBe(true);
    expect(result.output).toContain('"test": true');
  });

  it('should execute eval function', async () => {
    const runner = new PythonRunner({ sandboxBinding: mockSandboxBinding });
    const evalCode = `
def eval_test(trace):
    # Check if output contains expected text
    output = trace.get("output", "")
    if "success" in str(output):
        return (True, "Output contains success")
    return (False, "Output missing success indicator")

# Test invocation
result = eval_test({"output": "operation success"})
print(result)
`;

    const result = await runner.execute(evalCode);

    expect(result.success).toBe(true);
    expect(result.output).toContain('True');
  });
});
