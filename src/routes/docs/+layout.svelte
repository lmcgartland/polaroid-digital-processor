<script lang="ts">
	import { page } from '$app/stores';
	import './docs.css';

	$: currentPath = $page.url.pathname;

	// Icons are 24x24 stroked paths, drawn the same way as the ones in the app's navigation bar
	const navSections = [
		{
			title: 'Getting Started',
			items: [
				{
					href: '/docs/how-it-works',
					label: 'How It Works',
					icon: 'M12 6.5C10.2 5.2 7.6 4.5 4 4.5v13c3.6 0 6.2.7 8 2 1.8-1.3 4.4-2 8-2v-13c-3.6 0-6.2.7-8 2Zm0 0v13'
				},
				{
					href: '/docs/testing',
					label: 'Testing Guide',
					icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-3.75 8.75 2.6 2.6 4.9-5.2'
				}
			]
		},
		{
			title: 'Reference',
			items: [
				{
					href: '/docs',
					label: 'API Reference',
					icon: 'm8.5 7.5-5 4.5 5 4.5m7-9 5 4.5-5 4.5M13.5 5l-3 14'
				}
			]
		}
	];

	function isActive(href: string, currentPath: string) {
		if (href === '/docs') {
			return currentPath === '/docs';
		}
		return currentPath.startsWith(href);
	}
</script>

<div class="docs-layout">
	<!-- Primary Sidebar - Navigation between doc pages -->
	<aside class="primary-sidebar">
		<div class="sidebar-content">
			{#each navSections as section}
				<div class="nav-section">
					<h3 class="nav-section-title">{section.title}</h3>
					<nav class="nav-list">
						{#each section.items as item}
							<a
								href={item.href}
								class="nav-item"
								class:active={isActive(item.href, currentPath)}
								aria-current={isActive(item.href, currentPath) ? 'page' : undefined}
							>
								<svg
									class="nav-icon"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d={item.icon} />
								</svg>
								<span class="nav-label">{item.label}</span>
							</a>
						{/each}
					</nav>
				</div>
			{/each}
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
		grid-template-columns: 15rem minmax(0, 1fr);
		min-height: calc(100vh - var(--nav-height));
		background: var(--bg-primary);
	}

	/* Primary Sidebar */
	.primary-sidebar {
		position: sticky;
		top: var(--nav-height);
		height: calc(100vh - var(--nav-height));
		overflow-y: auto;
		border-right: 1px solid var(--border-primary);
		background: var(--bg-secondary);
	}

	:global([data-theme='dark']) .primary-sidebar {
		background: #0d0d0f;
	}

	.sidebar-content {
		padding: 1.75rem 0.75rem;
	}

	.nav-section {
		margin-bottom: 1.5rem;
	}

	.nav-section-title {
		margin-bottom: 0.375rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--text-muted);
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
		padding: 0.4375rem 0.75rem;
		border-radius: 0.625rem;
		font-size: 0.9375rem;
		letter-spacing: -0.01em;
		color: var(--text-primary);
		text-decoration: none;
		transition: background 0.2s;
	}

	.nav-item:hover {
		background: var(--fill);
	}

	.nav-item.active {
		background: var(--accent-blue);
		color: #ffffff;
	}

	.nav-icon {
		width: 1.125rem;
		height: 1.125rem;
		flex-shrink: 0;
		color: var(--accent-blue);
	}

	.nav-item.active .nav-icon {
		color: inherit;
	}

	.docs-main {
		min-width: 0;
	}

	/* Responsive */
	@media (max-width: 900px) {
		.docs-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		/* The pages become a row of pills above the content */
		.primary-sidebar {
			position: static;
			height: auto;
			border-right: none;
			border-bottom: 1px solid var(--border-primary);
		}

		.sidebar-content {
			display: flex;
			gap: 0.375rem;
			padding: 0.625rem 1rem;
			overflow-x: auto;
		}

		.nav-section {
			margin: 0;
		}

		.nav-section-title {
			display: none;
		}

		.nav-list {
			flex-direction: row;
			gap: 0.375rem;
		}

		.nav-item {
			white-space: nowrap;
		}
	}
</style>
