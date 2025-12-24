import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { docsPlugin } from './vite-plugin-docs';

export default defineConfig({
	plugins: [sveltekit(), docsPlugin()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		// Exclude browser tests from regular test runs (they need special handling)
		exclude: ['src/tests/**/*.browser.test.ts', 'node_modules/**'],
		testTimeout: 60000, // Allow longer timeouts for image processing
	},
	worker: {
		format: 'iife'
	}
});
