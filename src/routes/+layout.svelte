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
				Polaroid Digital Processor
			</a>
			<div class="nav-links">
				<a
					href="/"
					class="nav-link {isHome ? 'nav-link-active' : ''}"
				>
					App
				</a>
				<a
					href="/docs"
					class="nav-link {isDocsPage ? 'nav-link-active' : ''}"
				>
					Docs
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
		--bg-primary: #ffffff;
		--bg-secondary: #f9fafb;
		--bg-tertiary: #f3f4f6;
		--bg-card: #ffffff;
		--bg-code: #f3f4f6;
		--bg-hover: #e5e7eb;
		
		--text-primary: #111827;
		--text-secondary: #4b5563;
		--text-muted: #9ca3af;
		
		--border-primary: #e5e7eb;
		--border-secondary: #d1d5db;
		
		--accent-blue: #2563eb;
		--accent-blue-bg: #dbeafe;
	}

	:global([data-theme="dark"]) {
		--bg-primary: #0f0f10;
		--bg-secondary: #18181b;
		--bg-tertiary: #27272a;
		--bg-card: #18181b;
		--bg-code: #09090b;
		--bg-hover: #27272a;
		
		--text-primary: #fafafa;
		--text-secondary: #a1a1aa;
		--text-muted: #71717a;
		
		--border-primary: #27272a;
		--border-secondary: #3f3f46;
		
		--accent-blue: #3b82f6;
		--accent-blue-bg: #1e3a5f;
	}

	:global(body) {
		background: var(--bg-primary);
		color: var(--text-primary);
		transition: background-color 0.2s, color 0.2s;
	}

	.layout-wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.nav-header {
		background: var(--bg-card);
		border-bottom: 1px solid var(--border-primary);
		padding: 0.75rem 1rem;
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.nav-container {
		max-width: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		text-decoration: none;
		transition: color 0.15s;
	}

	.nav-brand:hover {
		color: var(--accent-blue);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-link {
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-secondary);
		text-decoration: none;
		transition: all 0.15s;
	}

	.nav-link:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.nav-link-active {
		background: var(--accent-blue-bg);
		color: var(--accent-blue);
	}

	.nav-link-active:hover {
		background: var(--accent-blue-bg);
		color: var(--accent-blue);
	}

	.theme-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-primary);
		border-radius: 0.5rem;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
		margin-left: 0.5rem;
	}

	.theme-toggle:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-secondary);
	}

	.main-content {
		flex: 1;
	}
</style>
