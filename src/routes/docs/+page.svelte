<script lang="ts">
	// @ts-ignore - Generated at build time
	import apiDocs from '$lib/docs/api.json';

	interface DocParam {
		name: string;
		type: string;
		description: string;
		optional: boolean;
		defaultValue?: string;
	}

	interface DocEntry {
		name: string;
		kind: 'interface' | 'function' | 'type' | 'const';
		description: string;
		params?: DocParam[];
		returnType?: string;
		properties?: DocParam[];
		remarks?: string;
		example?: string;
		exported: boolean;
	}

	const docs: DocEntry[] = apiDocs;

	// Filter to only show exported items (public API)
	const interfaces = docs.filter((d) => d.kind === 'interface' && d.exported);
	const functions = docs.filter((d) => d.kind === 'function' && d.exported);
	const types = docs.filter((d) => d.kind === 'type' && d.exported);

	// Also show internal functions for documentation purposes
	const internalFunctions = docs.filter((d) => d.kind === 'function' && !d.exported);
</script>

<svelte:head>
	<title>API Documentation - Polaroid Digital Processor</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="docs-page">
	<div class="docs-container">
		<!-- Sidebar -->
		<aside class="sidebar">
			<div class="sidebar-sticky">
				<h2 class="sidebar-title">Contents</h2>
				<nav class="sidebar-nav">
					{#if interfaces.length > 0}
						<a href="#interfaces" class="nav-link nav-link-interface">
							<span class="nav-badge badge-interface">{interfaces.length}</span>
							Interfaces
						</a>
					{/if}
					{#if types.length > 0}
						<a href="#types" class="nav-link nav-link-type">
							<span class="nav-badge badge-type">{types.length}</span>
							Types
						</a>
					{/if}
					{#if functions.length > 0}
						<a href="#functions" class="nav-link nav-link-function">
							<span class="nav-badge badge-function">{functions.length}</span>
							Functions
						</a>
					{/if}
					{#if internalFunctions.length > 0}
						<a href="#internal" class="nav-link nav-link-internal">
							<span class="nav-badge badge-internal">{internalFunctions.length}</span>
							Internal
						</a>
					{/if}
				</nav>
			</div>
		</aside>

		<!-- Main Content -->
		<main class="main-content">
			<header class="page-header">
				<h1 class="page-title">API Documentation</h1>
				<p class="page-subtitle">
					Auto-generated from JSDoc comments using ts-morph. Edit the source code to update these
					docs.
				</p>
			</header>

			<!-- Interfaces Section -->
			{#if interfaces.length > 0}
				<section id="interfaces" class="doc-section">
					<div class="section-header section-header-interface">
						<span class="section-icon">I</span>
						<h2 class="section-title">Interfaces</h2>
					</div>

					{#each interfaces as iface}
						<article class="doc-card card-interface">
							<div class="card-header">
								<span class="kind-badge kind-interface">interface</span>
								<h3 class="card-title">{iface.name}</h3>
							</div>

							{#if iface.description}
								<p class="card-description">{iface.description}</p>
							{/if}

							{#if iface.remarks}
								<div class="remarks remarks-interface">
									<span class="remarks-label">Remarks</span>
									<p>{iface.remarks}</p>
								</div>
							{/if}

							{#if iface.properties && iface.properties.length > 0}
								<div class="properties-table">
									<div class="table-header">
										<div class="col-name">Property</div>
										<div class="col-type">Type</div>
										<div class="col-desc">Description</div>
									</div>
									{#each iface.properties as prop}
										<div class="table-row">
											<div class="col-name">
												<code class="prop-name">{prop.name}</code>
												{#if prop.optional}
													<span class="optional-mark">?</span>
												{/if}
											</div>
											<div class="col-type">
												<code class="type-signature">{prop.type}</code>
											</div>
											<div class="col-desc">
												<span class="prop-desc">{prop.description}</span>
												{#if prop.defaultValue}
													<code class="default-value">= {prop.defaultValue}</code>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			<!-- Types Section -->
			{#if types.length > 0}
				<section id="types" class="doc-section">
					<div class="section-header section-header-type">
						<span class="section-icon">T</span>
						<h2 class="section-title">Types</h2>
					</div>

					{#each types as type}
						<article class="doc-card card-type">
							<div class="card-header">
								<span class="kind-badge kind-type">type</span>
								<h3 class="card-title">{type.name}</h3>
							</div>
							{#if type.description}
								<p class="card-description">{type.description}</p>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			<!-- Exported Functions Section -->
			{#if functions.length > 0}
				<section id="functions" class="doc-section">
					<div class="section-header section-header-function">
						<span class="section-icon">F</span>
						<h2 class="section-title">Exported Functions</h2>
					</div>

					{#each functions as func}
						<article class="doc-card card-function">
							<div class="card-header">
								<span class="kind-badge kind-function">function</span>
								<h3 class="card-title">
									{func.name}<span class="parens">()</span>
								</h3>
							</div>

							{#if func.description}
								<p class="card-description">{func.description}</p>
							{/if}

							{#if func.remarks}
								<div class="remarks remarks-function">
									<span class="remarks-label">Remarks</span>
									<p>{func.remarks}</p>
								</div>
							{/if}

							{#if func.params && func.params.length > 0}
								<div class="params-section">
									<h4 class="subsection-title">Parameters</h4>
									<div class="params-list">
										{#each func.params as param}
											<div class="param-item">
												<code class="param-name">{param.name}</code>
												<code class="param-type">{param.type}</code>
												{#if param.description}
													<span class="param-desc">{param.description}</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if func.returnType}
								<div class="returns-section">
									<h4 class="subsection-title">Returns</h4>
									<code class="return-type">{func.returnType}</code>
								</div>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			<!-- Internal Functions Section -->
			{#if internalFunctions.length > 0}
				<section id="internal" class="doc-section">
					<div class="section-header section-header-internal">
						<span class="section-icon">⚙</span>
						<h2 class="section-title">Internal Functions</h2>
					</div>
					<p class="section-subtitle">
						Private functions used internally by the worker. Not part of the public API.
					</p>

					{#each internalFunctions as func}
						<article class="doc-card card-internal">
							<div class="card-header">
								<span class="kind-badge kind-internal">internal</span>
								<h3 class="card-title">
									{func.name}<span class="parens">()</span>
								</h3>
							</div>

							{#if func.description}
								<p class="card-description">{func.description}</p>
							{/if}

							{#if func.remarks}
								<div class="remarks remarks-internal">
									<span class="remarks-label">Pipeline</span>
									<pre class="remarks-pre">{func.remarks}</pre>
								</div>
							{/if}

							{#if func.params && func.params.length > 0}
								<div class="params-section">
									<h4 class="subsection-title">Parameters</h4>
									<div class="params-list">
										{#each func.params as param}
											<div class="param-item">
												<code class="param-name">{param.name}</code>
												<code class="param-type">{param.type}</code>
												{#if param.description}
													<span class="param-desc">{param.description}</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if func.returnType}
								<div class="returns-section">
									<h4 class="subsection-title">Returns</h4>
									<code class="return-type">{func.returnType}</code>
								</div>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			<footer class="page-footer">
				<p>Documentation auto-generated from source code using ts-morph</p>
			</footer>
		</main>
	</div>
</div>

<style>
	/* Theme-aware CSS variables for docs */
	.docs-page {
		/* Dark theme defaults */
		--docs-bg: #0f0f10;
		--docs-bg-secondary: #18181b;
		--docs-bg-tertiary: #09090b;
		--docs-bg-hover: #27272a;
		--docs-border: #27272a;
		--docs-text: #e4e4e7;
		--docs-text-secondary: #a1a1aa;
		--docs-text-muted: #71717a;
		--docs-text-heading: #fafafa;
		
		/* Syntax colors - consistent across themes */
		--color-interface: #7c3aed;
		--color-interface-text: #a78bfa;
		--color-interface-bg: #7c3aed20;
		
		--color-type: #0891b2;
		--color-type-text: #22d3ee;
		--color-type-bg: #0891b210;
		
		--color-function: #10b981;
		--color-function-text: #34d399;
		--color-function-bg: #10b98120;
		
		--color-internal: #f97316;
		--color-internal-text: #fb923c;
		--color-internal-bg: #f9731620;
		
		--color-prop: #c084fc;
		--color-param: #fb923c;
	}

	/* Light theme overrides */
	:global([data-theme="light"]) .docs-page {
		--docs-bg: #f8fafc;
		--docs-bg-secondary: #ffffff;
		--docs-bg-tertiary: #f1f5f9;
		--docs-bg-hover: #e2e8f0;
		--docs-border: #e2e8f0;
		--docs-text: #334155;
		--docs-text-secondary: #64748b;
		--docs-text-muted: #94a3b8;
		--docs-text-heading: #0f172a;
		
		/* Darker syntax colors for light mode */
		--color-interface: #7c3aed;
		--color-interface-text: #6d28d9;
		--color-interface-bg: #ede9fe;
		
		--color-type: #0891b2;
		--color-type-text: #0e7490;
		--color-type-bg: #cffafe;
		
		--color-function: #10b981;
		--color-function-text: #059669;
		--color-function-bg: #d1fae5;
		
		--color-internal: #f97316;
		--color-internal-text: #ea580c;
		--color-internal-bg: #ffedd5;
		
		--color-prop: #9333ea;
		--color-param: #ea580c;
	}

	/* Base styles */
	.docs-page {
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		background: var(--docs-bg);
		min-height: 100vh;
		color: var(--docs-text);
		transition: background-color 0.2s, color 0.2s;
	}

	.docs-container {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: calc(100vh - 60px);
	}

	/* Sidebar */
	.sidebar {
		background: var(--docs-bg-secondary);
		border-right: 1px solid var(--docs-border);
		padding: 1.5rem;
	}

	.sidebar-sticky {
		position: sticky;
		top: 5rem;
	}

	.sidebar-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--docs-text-muted);
		margin-bottom: 1rem;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--docs-text-secondary);
		text-decoration: none;
		transition: all 0.15s;
	}

	.nav-link:hover {
		background: var(--docs-bg-hover);
		color: var(--docs-text-heading);
	}

	.nav-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', monospace;
	}

	.badge-interface {
		background: var(--color-interface-bg);
		color: var(--color-interface-text);
	}
	.badge-type {
		background: var(--color-type-bg);
		color: var(--color-type-text);
	}
	.badge-function {
		background: var(--color-function-bg);
		color: var(--color-function-text);
	}
	.badge-internal {
		background: var(--color-internal-bg);
		color: var(--color-internal-text);
	}

	/* Main content */
	.main-content {
		padding: 2rem 3rem;
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--docs-border);
	}

	.page-title {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--docs-text-heading);
		margin-bottom: 0.5rem;
	}

	.page-subtitle {
		font-size: 1rem;
		color: var(--docs-text-muted);
	}

	/* Sections */
	.doc-section {
		margin-bottom: 4rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 2px solid;
	}

	.section-header-interface {
		border-color: var(--color-interface);
	}
	.section-header-type {
		border-color: var(--color-type);
	}
	.section-header-function {
		border-color: var(--color-function);
	}
	.section-header-internal {
		border-color: var(--color-internal);
	}

	.section-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.section-header-interface .section-icon {
		background: var(--color-interface-bg);
		color: var(--color-interface-text);
	}
	.section-header-type .section-icon {
		background: var(--color-type-bg);
		color: var(--color-type-text);
	}
	.section-header-function .section-icon {
		background: var(--color-function-bg);
		color: var(--color-function-text);
	}
	.section-header-internal .section-icon {
		background: var(--color-internal-bg);
		color: var(--color-internal-text);
	}

	.section-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--docs-text-heading);
	}

	.section-subtitle {
		color: var(--docs-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
		margin-top: -0.5rem;
	}

	/* Cards */
	.doc-card {
		background: var(--docs-bg-secondary);
		border: 1px solid var(--docs-border);
		border-radius: 0.75rem;
		padding: 1.5rem;
		margin-bottom: 1rem;
		border-left: 3px solid;
		transition: background-color 0.2s, border-color 0.2s;
	}

	.card-interface {
		border-left-color: var(--color-interface);
	}
	.card-type {
		border-left-color: var(--color-type);
	}
	.card-function {
		border-left-color: var(--color-function);
	}
	.card-internal {
		border-left-color: var(--color-internal);
		opacity: 0.9;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.kind-badge {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		text-transform: lowercase;
	}

	.kind-interface {
		background: var(--color-interface-bg);
		color: var(--color-interface-text);
	}
	.kind-type {
		background: var(--color-type-bg);
		color: var(--color-type-text);
	}
	.kind-function {
		background: var(--color-function-bg);
		color: var(--color-function-text);
	}
	.kind-internal {
		background: var(--color-internal-bg);
		color: var(--color-internal-text);
	}

	.card-title {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--docs-text-heading);
	}

	.parens {
		color: var(--docs-text-muted);
	}

	.card-description {
		color: var(--docs-text-secondary);
		font-size: 0.9375rem;
		line-height: 1.6;
		margin-bottom: 1rem;
	}

	/* Remarks */
	.remarks {
		background: var(--docs-bg-tertiary);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-bottom: 1rem;
		border-left: 3px solid;
	}

	.remarks-interface {
		border-color: var(--color-interface);
	}
	.remarks-function {
		border-color: var(--color-function);
	}
	.remarks-internal {
		border-color: var(--color-internal);
	}

	.remarks-label {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--docs-text-muted);
		margin-bottom: 0.5rem;
	}

	.remarks p {
		color: var(--docs-text-secondary);
		font-size: 0.875rem;
		line-height: 1.6;
		margin: 0;
	}

	.remarks-pre {
		color: var(--docs-text-secondary);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		line-height: 1.8;
		margin: 0;
		white-space: pre-wrap;
	}

	/* Properties table */
	.properties-table {
		background: var(--docs-bg-tertiary);
		border-radius: 0.5rem;
		overflow: hidden;
		font-size: 0.875rem;
	}

	.table-header {
		display: grid;
		grid-template-columns: 200px 200px 1fr;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--docs-bg-secondary);
		border-bottom: 1px solid var(--docs-border);
		font-weight: 600;
		color: var(--docs-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.table-row {
		display: grid;
		grid-template-columns: 200px 200px 1fr;
		gap: 1rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--docs-border);
		align-items: baseline;
	}

	.table-row:last-child {
		border-bottom: none;
	}

	.table-row:hover {
		background: var(--docs-bg-secondary);
	}

	.prop-name {
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-prop);
		font-weight: 500;
	}

	.optional-mark {
		color: var(--docs-text-muted);
		margin-left: 1px;
	}

	.type-signature {
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-type-text);
		font-size: 0.8rem;
		background: var(--color-type-bg);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.prop-desc {
		color: var(--docs-text-secondary);
		line-height: 1.5;
	}

	.default-value {
		display: inline-block;
		margin-left: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		background: var(--color-function-bg);
		color: var(--color-function-text);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	/* Parameters section */
	.params-section,
	.returns-section {
		margin-top: 1rem;
	}

	.subsection-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--docs-text-muted);
		margin-bottom: 0.75rem;
	}

	.params-list {
		background: var(--docs-bg-tertiary);
		border-radius: 0.5rem;
		padding: 0.5rem 0;
	}

	.param-item {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		flex-wrap: wrap;
	}

	.param-name {
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-param);
		font-weight: 500;
	}

	.param-type {
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-type-text);
		font-size: 0.8rem;
		background: var(--color-type-bg);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.param-desc {
		color: var(--docs-text-muted);
		font-size: 0.875rem;
	}

	.return-type {
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-function-text);
		font-size: 0.875rem;
		background: var(--color-function-bg);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
	}

	/* Footer */
	.page-footer {
		margin-top: 4rem;
		padding-top: 2rem;
		border-top: 1px solid var(--docs-border);
		text-align: center;
		color: var(--docs-text-muted);
		font-size: 0.875rem;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.docs-container {
			grid-template-columns: 1fr;
		}

		.sidebar {
			display: none;
		}

		.main-content {
			padding: 1.5rem;
		}

		.table-header,
		.table-row {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}

		.col-type,
		.col-desc {
			padding-left: 0;
		}
	}
</style>
