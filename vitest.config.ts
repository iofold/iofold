import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'tests/e2e/**',
      'node_modules/**',
      'frontend/**',
      '.tmp/**',
    ],
    globals: true,
    environment: 'node',
  },
})
