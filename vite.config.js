import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // Playwright owns tests/e2e (*.spec.js); Vitest runs the unit tests in src
    include: ['src/**/*.test.js']
  }
});
