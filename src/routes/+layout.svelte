<script>
	import '../app.css';
	import { page } from '$app/stores';
	import { theme } from '$lib/theme';
	import { onMount } from 'svelte';

	$: currentPath = $page.url.pathname;
	$: isHome = currentPath === '/';
	$: isDocsPage = currentPath.startsWith('/docs');

	// Apply theme class to document
	$: if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', $theme);
	}

	onMount(() => {
		document.documentElement.setAttribute('data-theme', $theme);
	});
</script>

<div class="layout-wrapper">
	<!-- Navigation Header -->
	<nav class="nav-header">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<span class="nav-logo" aria-hidden="true"><span></span></span>
				Polaroid Digital Processor
			</a>
			<div class="nav-links">
				<div class="nav-segments">
					<a href="/" class="nav-link {isHome ? 'nav-link-active' : ''}">App</a>
					<a href="/docs" class="nav-link {isDocsPage ? 'nav-link-active' : ''}">Docs</a>
				</div>
				<a
					href="https://github.com/lmcgartland/polaroid-digital-processor"
					target="_blank"
					rel="noopener noreferrer"
					class="github-link"
					aria-label="View on GitHub"
					title="View on GitHub"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
					</svg>
				</a>
				<button
					class="theme-toggle"
					on:click={() => theme.toggle()}
					aria-label="Toggle theme"
					title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
				>
					{#if $theme === 'dark'}
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="5"/>
							<line x1="12" y1="1" x2="12" y2="3"/>
							<line x1="12" y1="21" x2="12" y2="23"/>
							<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
							<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
							<line x1="1" y1="12" x2="3" y2="12"/>
							<line x1="21" y1="12" x2="23" y2="12"/>
							<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
							<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="main-content">
		<slot />
	</main>
</div>

<style>
	:global(:root) {
		/* Light theme (default) */
		--bg-primary: #f5f5f7;
		--bg-secondary: #ffffff;
		--bg-tertiary: #e8e8ed;
		--bg-card: #ffffff;
		--bg-code: #f0f0f3;
		--bg-hover: #dcdce1;

		--text-primary: #1d1d1f;
		--text-secondary: #515154;
		--text-muted: #86868b;

		--border-primary: rgba(0, 0, 0, 0.08);
		--border-secondary: rgba(0, 0, 0, 0.16);

		--accent-blue: #0071e3;
		--accent-blue-hover: #0077ed;
		--accent-blue-bg: rgba(0, 113, 227, 0.1);
		--accent-green: #28a745;
		--accent-orange: #c9730a;

		/* Translucent fill for controls, as in the system's "fill" colours */
		--fill: rgba(120, 120, 128, 0.12);
		--fill-strong: rgba(120, 120, 128, 0.2);
		--nav-bg: rgba(255, 255, 255, 0.72);
		--knob: #ffffff;

		--shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06);
		--shadow-raised: 0 2px 4px rgba(0, 0, 0, 0.08), 0 16px 40px rgba(0, 0, 0, 0.14);
		--shadow-knob: 0 0.5px 1px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.2);

		--nav-height: 52px;
		--font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
			'Helvetica Neue', 'Segoe UI', Roboto, sans-serif;
		--font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
		--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
	}

	:global([data-theme='dark']) {
		--bg-primary: #000000;
		--bg-secondary: #1c1c1e;
		--bg-tertiary: #2c2c2e;
		--bg-card: #1c1c1e;
		--bg-code: #161618;
		--bg-hover: #3a3a3c;

		--text-primary: #f5f5f7;
		--text-secondary: #a1a1a6;
		--text-muted: #6e6e73;

		--border-primary: rgba(255, 255, 255, 0.1);
		--border-secondary: rgba(255, 255, 255, 0.18);

		--accent-blue: #0a84ff;
		--accent-blue-hover: #2b95ff;
		--accent-blue-bg: rgba(10, 132, 255, 0.16);
		--accent-green: #30d158;
		--accent-orange: #ff9f0a;

		--fill: rgba(120, 120, 128, 0.24);
		--fill-strong: rgba(120, 120, 128, 0.36);
		--nav-bg: rgba(22, 22, 24, 0.72);
		--knob: #ffffff;

		--shadow-card: 0 0 0 1px rgba(255, 255, 255, 0.06);
		--shadow-raised: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 20px 50px rgba(0, 0, 0, 0.6);
		--shadow-knob: 0 0.5px 1px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.4);
	}

	:global(body) {
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		transition:
			background-color 0.3s,
			color 0.3s;
	}

	:global(code) {
		font-family: var(--font-mono);
	}

	:global(:focus-visible) {
		outline: 3px solid color-mix(in srgb, var(--accent-blue) 50%, transparent);
		outline-offset: 2px;
	}

	.layout-wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.nav-header {
		height: var(--nav-height);
		display: flex;
		align-items: center;
		padding: 0 1.25rem;
		background: var(--nav-bg);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		backdrop-filter: saturate(180%) blur(20px);
		border-bottom: 1px solid var(--border-primary);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.nav-container {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--text-primary);
		text-decoration: none;
	}

	/* A tiny polaroid: white frame, picture, thick bottom edge */
	.nav-logo {
		width: 20px;
		height: 24px;
		padding: 2.5px 2.5px 0;
		border-radius: 3px;
		background: #ffffff;
		box-shadow:
			0 0 0 0.5px rgba(0, 0, 0, 0.16),
			0 1px 3px rgba(0, 0, 0, 0.2);
		transform: rotate(-6deg);
		transition: transform 0.4s var(--ease-out);
	}

	.nav-logo span {
		display: block;
		height: 15px;
		border-radius: 1px;
		background: linear-gradient(135deg, #ff9f0a, #ff375f 55%, #5e5ce6);
	}

	.nav-brand:hover .nav-logo {
		transform: rotate(4deg) scale(1.06);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	/* Segmented control */
	.nav-segments {
		display: flex;
		padding: 2px;
		margin-right: 0.5rem;
		border-radius: 9px;
		background: var(--fill);
	}

	.nav-link {
		padding: 0.25rem 0.875rem;
		border-radius: 7px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		text-decoration: none;
		transition:
			background-color 0.2s,
			box-shadow 0.2s;
	}

	.nav-link-active {
		background: var(--bg-card);
		box-shadow:
			0 0 0 0.5px rgba(0, 0, 0, 0.06),
			0 1px 3px rgba(0, 0, 0, 0.14);
	}

	:global([data-theme='dark']) .nav-link-active {
		background: #636366;
	}

	.github-link,
	.theme-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color 0.2s,
			color 0.2s;
	}

	.github-link:hover,
	.theme-toggle:hover {
		background: var(--fill);
		color: var(--text-primary);
	}

	.main-content {
		flex: 1;
	}

	@media (max-width: 640px) {
		.nav-brand {
			font-size: 0;
			gap: 0;
		}
	}
</style>
