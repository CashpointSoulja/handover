import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['engine/**/*.test.ts', 'evals/**/*.test.ts', 'design/**/*.test.ts'], environment: 'node', passWithNoTests: true },
});
