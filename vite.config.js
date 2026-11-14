import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import svelteConfig from './svelte.config.js';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // The deploy's base path, always absolute ('' on the custom domain). `base`
    // from $app/paths is relative while prerendering ("..") and absolute URLs
    // such as og:image can't use that. Read through DEPLOY_BASE in $lib/og.js.
    __BASE_PATH__: JSON.stringify(svelteConfig.kit.paths.base),
  },
  test: {
    // Playwright owns tests/e2e (*.spec.js); Vitest runs the unit tests in src
    // and the page-weight budget checker's own tests
    include: ['src/**/*.test.js', 'scripts/perf/**/*.test.js']
  }
});
