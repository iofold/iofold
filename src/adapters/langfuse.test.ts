import { describe, it, expect } from 'vitest';
import { LangfuseAdapter } from './langfuse';

const hasApiKeys = process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY;

describe('LangfuseAdapter', () => {
  it('should instantiate with config', () => {
    const adapter = new LangfuseAdapter({
      publicKey: 'test-public-key',
      secretKey: 'test-secret-key',
      baseUrl: 'https://test.langfuse.com'
    });

    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(LangfuseAdapter);
  });

  it.skipIf(!hasApiKeys)('should fetch traces from Langfuse', async () => {
    const adapter = new LangfuseAdapter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL
    });

    const traces = await adapter.fetchTraces({ limit: 5 });

    expect(traces).toBeInstanceOf(Array);
    expect(traces.length).toBeGreaterThan(0);
  });
});
