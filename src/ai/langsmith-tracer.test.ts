/**
 * Tests for LangSmith tracing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isLangSmithEnabled,
  createLangSmithClient,
  getLangChainEnvVars,
  type LangSmithEnv,
} from './langsmith-tracer';

describe('LangSmith Tracer', () => {
  describe('isLangSmithEnabled', () => {
    it('should return false when LANGSMITH_TRACING_V2 is not set', () => {
      const env: LangSmithEnv = {
        LANGSMITH_API_KEY: 'test-key',
      };
      expect(isLangSmithEnabled(env)).toBe(false);
    });

    it('should return false when LANGSMITH_API_KEY is not set', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'true',
      };
      expect(isLangSmithEnabled(env)).toBe(false);
    });

    it('should return false when LANGSMITH_TRACING_V2 is "false"', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'false',
        LANGSMITH_API_KEY: 'test-key',
      };
      expect(isLangSmithEnabled(env)).toBe(false);
    });

    it('should return true when both are properly set', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'true',
        LANGSMITH_API_KEY: 'test-key',
      };
      expect(isLangSmithEnabled(env)).toBe(true);
    });
  });

  describe('createLangSmithClient', () => {
    it('should return undefined when tracing is disabled', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'false',
        LANGSMITH_API_KEY: 'test-key',
      };
      expect(createLangSmithClient(env)).toBeUndefined();
    });

    it('should return a client when tracing is enabled', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'true',
        LANGSMITH_API_KEY: 'test-key',
        LANGSMITH_PROJECT: 'test-project',
      };
      const client = createLangSmithClient(env);
      expect(client).toBeDefined();
      expect(client).toHaveProperty('createRun');
    });
  });

  describe('getLangChainEnvVars', () => {
    it('should return empty object when tracing is disabled', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'false',
      };
      expect(getLangChainEnvVars(env)).toEqual({});
    });

    it('should return env vars when tracing is enabled', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'true',
        LANGSMITH_API_KEY: 'test-key',
        LANGSMITH_PROJECT: 'test-project',
      };
      const envVars = getLangChainEnvVars(env);
      expect(envVars).toEqual({
        LANGSMITH_API_KEY: 'test-key',
        LANGSMITH_PROJECT: 'test-project',
        LANGSMITH_TRACING_V2: 'true',
      });
    });

    it('should use default project name when not specified', () => {
      const env: LangSmithEnv = {
        LANGSMITH_TRACING_V2: 'true',
        LANGSMITH_API_KEY: 'test-key',
      };
      const envVars = getLangChainEnvVars(env);
      expect(envVars.LANGSMITH_PROJECT).toBe('iofold-development');
    });
  });
});
