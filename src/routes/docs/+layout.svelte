<script lang="ts">
	import { page } from '$app/stores';

	$: currentPath = $page.url.pathname;

	const navSections = [
		{
			title: 'Getting Started',
			items: [
				{ href: '/docs/how-it-works', label: 'How It Works', icon: '📖' },
				{ href: '/docs/testing', label: 'Testing Guide', icon: '🧪' }
			]
		},
		{
			title: 'Reference',
			items: [
				{ href: '/docs', label: 'API Reference', icon: '⚙️' }
			]
		}
	];

	function isActive(href: string) {
		if (href === '/docs') {
			return currentPath === '/docs';
		}
		return currentPath.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="docs-layout">
	<!-- Primary Sidebar - Navigation between doc pages -->
	<aside class="primary-sidebar">
		<div class="sidebar-content">
			<div class="sidebar-header">
				<span class="docs-logo">📚</span>
				<span class="docs-title">Documentation</span>
			</div>

			{#each navSections as section}
				<div class="nav-section">
					<h3 class="nav-section-title">{section.title}</h3>
					<nav class="nav-list">
						{#each section.items as item}
							<a
								href={item.href}
								class="nav-item"
								class:active={isActive(item.href)}
							>
								<span class="nav-icon">{item.icon}</span>
								<span class="nav-label">{item.label}</span>
							</a>
						{/each}
					</nav>
				</div>
			{/each}

			<div class="sidebar-footer">
				<a href="/" class="back-link">
					← Back to App
				</a>
			</div>
		</div>
	</aside>

	<!-- Main content area -->
	<div class="docs-main">
		<slot />
	</div>
</div>

<style>
	.docs-layout {
		display: grid;
		grid-template-columns: 220px 1fr;
		min-height: calc(100vh - 57px);
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	/* Primary Sidebar */
	.primary-sidebar {
		background: var(--bg-secondary, #18181b);
		border-right: 1px solid var(--border-primary, #27272a);
		position: sticky;
		top: 57px;
		height: calc(100vh - 57px);
		overflow-y: auto;
	}

	.sidebar-content {
		padding: 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.docs-logo {
		font-size: 1.25rem;
	}

	.docs-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary, #fafafa);
	}

	.nav-section {
		margin-bottom: 1.5rem;
	}

	.nav-section-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted, #71717a);
		padding: 0 0.5rem;
		margin-bottom: 0.5rem;
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: var(--text-secondary, #a1a1aa);
		text-decoration: none;
		transition: all 0.15s;
	}

	.nav-item:hover {
		background: var(--bg-hover, #27272a);
		color: var(--text-primary, #fafafa);
	}

	.nav-item.active {
		background: var(--accent-blue-bg, #1e3a5f);
		color: var(--accent-blue, #3b82f6);
	}

	.nav-icon {
		font-size: 1rem;
		width: 1.25rem;
		text-align: center;
	}

	.nav-label {
		font-weight: 500;
	}

	.sidebar-footer {
		margin-top: auto;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border-primary, #27272a);
	}

	.back-link {
		display: block;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: var(--text-muted, #71717a);
		text-decoration: none;
		transition: color 0.15s;
	}

	.back-link:hover {
		color: var(--text-primary, #fafafa);
	}

	.docs-main {
		background: var(--bg-primary, #0f0f10);
		min-height: 100%;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.docs-layout {
			grid-template-columns: 1fr;
		}

		.primary-sidebar {
			display: none;
		}
	}
</style>

