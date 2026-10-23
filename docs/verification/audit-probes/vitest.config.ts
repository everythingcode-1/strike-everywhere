import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['docs/verification/audit-probes/*.test.ts'] } });
