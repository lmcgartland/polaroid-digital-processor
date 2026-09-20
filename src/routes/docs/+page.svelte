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
	<title>API Reference - Polaroid Digital Processor</title>
</svelte:head>

<div class="docs-page">
	<!-- Table of contents -->
	<aside class="sidebar">
		<h2 class="sidebar-title">On This Page</h2>
		<nav class="sidebar-nav">
			{#if interfaces.length > 0}
				<a href="#interfaces" class="nav-link kind-interface">
					<span class="nav-dot" />
					Interfaces
					<span class="nav-count">{interfaces.length}</span>
				</a>
			{/if}
			{#if types.length > 0}
				<a href="#types" class="nav-link kind-type">
					<span class="nav-dot" />
					Types
					<span class="nav-count">{types.length}</span>
				</a>
			{/if}
			{#if functions.length > 0}
				<a href="#functions" class="nav-link kind-function">
					<span class="nav-dot" />
					Functions
					<span class="nav-count">{functions.length}</span>
				</a>
			{/if}
			{#if internalFunctions.length > 0}
				<a href="#internal" class="nav-link kind-internal">
					<span class="nav-dot" />
					Internal
					<span class="nav-count">{internalFunctions.length}</span>
				</a>
			{/if}
		</nav>
	</aside>

	<!-- Main Content -->
	<main class="main-content">
		<header class="page-header">
			<p class="page-eyebrow">Reference</p>
			<h1 class="page-title">API Reference</h1>
			<p class="page-subtitle">
				Generated from the JSDoc comments in the source. Edit the code to update this page.
			</p>
		</header>

		<!-- Interfaces Section -->
		{#if interfaces.length > 0}
			<section id="interfaces" class="doc-section">
				<h2 class="section-title">Interfaces</h2>

				{#each interfaces as iface}
					<article class="doc-card kind-interface">
						<div class="card-header">
							<span class="kind-badge">interface</span>
							<h3 class="card-title">{iface.name}</h3>
						</div>

						{#if iface.description}
							<p class="card-description">{iface.description}</p>
						{/if}

						{#if iface.remarks}
							<div class="remarks">
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
				<h2 class="section-title">Types</h2>

				{#each types as type}
					<article class="doc-card kind-type">
						<div class="card-header">
							<span class="kind-badge">type</span>
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
				<h2 class="section-title">Exported Functions</h2>

				{#each functions as func}
					<article class="doc-card kind-function">
						<div class="card-header">
							<span class="kind-badge">function</span>
							<h3 class="card-title">
								{func.name}<span class="parens">()</span>
							</h3>
						</div>

						{#if func.description}
							<p class="card-description">{func.description}</p>
						{/if}

						{#if func.remarks}
							<div class="remarks">
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
				<h2 class="section-title">Internal Functions</h2>
				<p class="section-desc">
					Private functions used internally by the worker. Not part of the public API.
				</p>

				{#each internalFunctions as func}
					<article class="doc-card kind-internal">
						<div class="card-header">
							<span class="kind-badge">internal</span>
							<h3 class="card-title">
								{func.name}<span class="parens">()</span>
							</h3>
						</div>

						{#if func.description}
							<p class="card-description">{func.description}</p>
						{/if}

						{#if func.remarks}
							<div class="remarks">
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
			<p>Generated from the source code with ts-morph.</p>
		</footer>
	</main>
</div>

<style>
	/* Shared docs styles live in ./docs.css; these are the API reference's own */
	.kind-interface {
		--kind: var(--kind-interface);
	}
	.kind-type {
		--kind: var(--kind-type);
	}
	.kind-function {
		--kind: var(--kind-function);
	}
	.kind-internal {
		--kind: var(--kind-internal);
	}

	/* Cards */
	.doc-card {
		margin-bottom: 1rem;
		padding: 1.5rem 1.75rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin-bottom: 0.5rem;
	}

	.card-title {
		font-family: var(--font-mono);
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}

	.kind-badge {
		order: 1;
		padding: 0.1875rem 0.5625rem;
		border-radius: 980px;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: var(--kind);
		background: color-mix(in srgb, var(--kind) 14%, transparent);
	}

	.parens {
		color: var(--text-muted);
	}

	.card-description {
		max-width: 46rem;
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	/* Remarks */
	.remarks {
		margin-top: 1rem;
		padding: 0.875rem 1.125rem;
		border-radius: 0.875rem;
		background: var(--fill);
	}

	.remarks-label,
	.subsection-title,
	.table-header {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.remarks-label {
		display: block;
		margin-bottom: 0.375rem;
	}

	.remarks p {
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.remarks-pre {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.7;
		white-space: pre-wrap;
		color: var(--text-secondary);
	}

	/* Properties: an inset grouped list */
	.properties-table,
	.params-list {
		margin-top: 1.125rem;
		border-radius: 0.875rem;
		background: var(--fill);
		font-size: 0.875rem;
	}

	.table-header,
	.table-row {
		display: grid;
		grid-template-columns: minmax(0, 15rem) minmax(0, 13rem) minmax(0, 1fr);
		gap: 1rem;
		padding: 0.75rem 1.125rem;
	}

	.table-header {
		padding-bottom: 0.25rem;
	}

	.table-row {
		position: relative;
		align-items: baseline;
	}

	.table-row + .table-row::before,
	.param-item + .param-item::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1.125rem;
		right: 0;
		height: 1px;
		background: var(--border-primary);
	}

	.col-name,
	.col-type {
		overflow-wrap: anywhere;
	}

	.prop-name,
	.param-name {
		font-weight: 600;
		color: var(--text-primary);
	}

	.optional-mark {
		color: var(--text-muted);
	}

	.type-signature,
	.param-type,
	.return-type {
		font-size: 0.8125rem;
		color: var(--kind-type);
	}

	.prop-desc {
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.default-value {
		display: inline-block;
		margin-left: 0.375rem;
		padding: 0.0625rem 0.4375rem;
		border-radius: 980px;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: var(--fill-strong);
	}

	/* Parameters */
	.params-section,
	.returns-section {
		margin-top: 1.25rem;
	}

	.params-list {
		margin-top: 0.5rem;
	}

	.param-item {
		position: relative;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		padding: 0.625rem 1.125rem;
	}

	.param-desc {
		flex-basis: 100%;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.return-type {
		display: inline-block;
		margin-top: 0.5rem;
		padding: 0.25rem 0.625rem;
		border-radius: 0.5rem;
		background: var(--fill);
	}

	@media (max-width: 900px) {
		.table-header {
			display: none;
		}

		.table-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.25rem;
		}
	}
</style>
