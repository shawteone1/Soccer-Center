import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import path from 'path';

const contentRuntimeFixture: string = path.resolve(__dirname, './src/test/content-runtime-module.ts');
const contentRuntimeStub: string = path.resolve(__dirname, './src/test/content-runtime-stub.ts');
const contentRuntimeAlias: string = existsSync(contentRuntimeFixture) ? contentRuntimeFixture : contentRuntimeStub;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // Use forks pool to isolate memory per test file (prevents OOM)
    pool: 'forks',
    maxWorkers: 4,
    isolate: true,
    // Limit concurrent tests within each file
    maxConcurrency: 5,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '*.config.js',
        '*.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      'virtual:format-overrides': path.resolve(__dirname, './src/test/format-overrides-module.ts'),
      'virtual:content-runtime': contentRuntimeAlias,
      '@airo/content': path.resolve(__dirname, './content-lib/src/index.ts'),
      '@/': path.resolve(__dirname, './src/'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/api': path.resolve(__dirname, './src/server/api'),
      '@/db': path.resolve(__dirname, './src/server/db'),
      '@/layouts': path.resolve(__dirname, './src/layouts'),
      '@/patterns': path.resolve(__dirname, './src/patterns'),
      '@/pages': path.resolve(__dirname, './src/pages'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/styles': path.resolve(__dirname, './src/styles'),
      // Subpath import — package.json #imports not resolved by Vitest by default
      '#airo/secrets': path.resolve(__dirname, existsSync('./airo-secrets/src/index.ts') ? './airo-secrets/src/index.ts' : './export-plugins/airo-secrets.ts'),
      // Server modules use .js extensions (ESM convention) — Vitest needs explicit aliases
      // to resolve them to the .ts source files during test runs.
      '@/server/db/client.js': path.resolve(__dirname, './src/server/db/client.ts'),
      '@/server/db/schema.js': path.resolve(__dirname, './src/server/db/schema.ts'),
      '@/server/auth-policy.js': path.resolve(__dirname, './src/server/auth-policy.ts'),
      '@/server/lib/player-stats-aggregation.js': path.resolve(__dirname, './src/server/lib/player-stats-aggregation.ts'),
      '@/server/lib/coach-projection.js': path.resolve(__dirname, './src/server/lib/coach-projection.ts'),
      '@/server/lib/coach-link-store.js': path.resolve(__dirname, './src/server/lib/coach-link-store.ts'),
      '@/server/lib/coach-profile-fields.js': path.resolve(__dirname, './src/server/lib/coach-profile-fields.ts'),
      '@/server/lib/coach-demo-fixtures.js': path.resolve(__dirname, './src/server/lib/coach-demo-fixtures.ts'),
      '@/server/lib/redact-coach-token.js': path.resolve(__dirname, './src/server/lib/redact-coach-token.ts'),
      '@/server/lib/coach-feature-gate.js': path.resolve(__dirname, './src/server/lib/coach-feature-gate.ts'),
      '@/server/lib/rss-parser.js': path.resolve(__dirname, './src/server/lib/rss-parser.ts'),
      '@/server/ical-parser.js': path.resolve(__dirname, './src/server/ical-parser.ts'),
      '@/server/calendar-crypto.js': path.resolve(__dirname, './src/server/calendar-crypto.ts'),
      '@/server/lib/private-uploads.js': path.resolve(__dirname, './src/server/lib/private-uploads.ts'),
      '@/server/api/parent/recruiting/_guard.js': path.resolve(__dirname, './src/server/api/parent/recruiting/_guard.ts'),
      '@/server/api/coach/profile/[token]/GET.js': path.resolve(__dirname, './src/server/api/coach/profile/[token]/GET.ts'),
      '@/server/lib/safe-outbound-text.js': path.resolve(__dirname, './src/server/lib/safe-outbound-text.ts'),
      '@/server/api/my-soccer/auth-guard.js': path.resolve(__dirname, './src/server/api/my-soccer/auth-guard.ts'),
      '@/server/lib/team-chat-config.js': path.resolve(__dirname, './src/server/lib/team-chat-config.ts'),
      '@/data/intelligence/colorado-clubs.json': path.resolve(__dirname, './src/data/intelligence/colorado-clubs.json'),
      '@/data/intelligence/colorado-colleges.json': path.resolve(__dirname, './src/data/intelligence/colorado-colleges.json'),
      '@/data/intelligence/colorado-institutions.json': path.resolve(__dirname, './src/data/intelligence/colorado-institutions.json'),
      '@/data/intelligence/logos.json': path.resolve(__dirname, './src/data/intelligence/logos.json'),
      '@/data/recruiting/college-programs.json': path.resolve(__dirname, './src/data/recruiting/college-programs.json'),
    },
  },
});
