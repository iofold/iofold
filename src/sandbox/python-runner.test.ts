import { describe, it, expect } from 'vitest';
import { PythonRunner } from './python-runner';

describe('PythonRunner', () => {
  it('should execute simple Python code', async () => {
    const runner = new PythonRunner();
    const result = await runner.execute('print("hello world")');

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello world');
  });

  it('should enforce timeout', async () => {
    const runner = new PythonRunner({ timeout: 100 });
    // Create an infinite loop to trigger timeout
    const code = 'while True: pass';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('timeout');
  });

  it('should block dangerous imports', async () => {
    const runner = new PythonRunner();
    const code = 'import os; os.system("ls")';

    const result = await runner.execute(code);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('blocked');
  });

  it('should allow whitelisted imports', async () => {
    const runner = new PythonRunner();
    const code = 'import json; print(json.dumps({"test": true}))';

    const result = await runner.execute(code);

    expect(result.success).toBe(true);
    expect(result.output).toContain('{"test":true}');
  });

  it('should execute eval function', async () => {
    const runner = new PythonRunner();
    const evalCode = `
def eval_test(trace):
    # Check if output contains expected text
    if "success" in str(trace.get("output", "")):
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
