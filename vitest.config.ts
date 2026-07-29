import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/lib/statutoryPayrollEngine/**',
        'src/lib/payrollRulesEngine/**',
        'src/lib/payrollDocuments.ts',
        'src/lib/payrollJournal.ts',
        'src/lib/employeeIdentity.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
