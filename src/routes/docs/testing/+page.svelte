<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme';
	import { get } from 'svelte/store';

	let mermaidReady = false;
	let currentTheme = get(theme);

	async function initializeMermaid(selectedTheme: 'dark' | 'light') {
		const mermaid = await import('mermaid');
		mermaid.default.initialize({
			startOnLoad: false,
			theme: selectedTheme === 'dark' ? 'dark' : 'default',
			themeVariables: {
				darkMode: selectedTheme === 'dark',
				primaryColor: selectedTheme === 'dark' ? '#7c3aed' : '#2563eb',
				primaryTextColor: selectedTheme === 'dark' ? '#fafafa' : '#111827',
				primaryBorderColor: selectedTheme === 'dark' ? '#a78bfa' : '#dbeafe',
				lineColor: selectedTheme === 'dark' ? '#71717a' : '#4b5563',
				secondaryColor: selectedTheme === 'dark' ? '#18181b' : '#f9fafb',
				tertiaryColor: selectedTheme === 'dark' ? '#27272a' : '#f3f4f6',
				background: selectedTheme === 'dark' ? '#0f0f10' : '#ffffff',
				mainBkg: selectedTheme === 'dark' ? '#18181b' : '#ffffff',
				nodeBorder: selectedTheme === 'dark' ? '#3f3f46' : '#e5e7eb',
				clusterBkg: selectedTheme === 'dark' ? '#27272a' : '#f3f4f6',
				clusterBorder: selectedTheme === 'dark' ? '#3f3f46' : '#d1d5db',
				titleColor: selectedTheme === 'dark' ? '#fafafa' : '#111827',
				edgeLabelBackground: selectedTheme === 'dark' ? '#18181b' : '#ffffff'
			},
			flowchart: {
				curve: 'basis',
				padding: 20
			}
		});

		await mermaid.default.run({
			querySelector: '.mermaid'
		});
		mermaidReady = true;
	}

	onMount(async () => {
		const unsubscribe = theme.subscribe(async (value) => {
			currentTheme = value;
			mermaidReady = false;
			await initializeMermaid(currentTheme);
		});

		await initializeMermaid(currentTheme);
		return unsubscribe;
	});
</script>

<svelte:head>
	<title>Testing Guide - Polaroid Digital Processor</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="docs-inner">
	<!-- Secondary Sidebar -->
	<aside class="secondary-sidebar">
		<div class="secondary-sidebar-sticky">
			<h2 class="secondary-sidebar-title">On This Page</h2>
			<nav class="secondary-sidebar-nav">
				<a href="#overview" class="nav-link"><span class="nav-icon">📋</span> Overview</a>
				<a href="#running-tests" class="nav-link"><span class="nav-icon">▶️</span> Running Tests</a>
				<a href="#fixtures" class="nav-link"><span class="nav-icon">📁</span> Test Fixtures</a>
				<a href="#baselines" class="nav-link"><span class="nav-icon">🎯</span> Baseline Hashes</a>
				<a href="#phash" class="nav-link"><span class="nav-icon">🔍</span> Visual Comparison</a>
				<a href="#adding-tests" class="nav-link"><span class="nav-icon">➕</span> Adding Tests</a>
			</nav>

			<h2 class="secondary-sidebar-title related-title">Related</h2>
			<nav class="secondary-sidebar-nav">
				<a href="/docs#interfaces" class="nav-link">
					<span class="nav-badge badge-interface">I</span> ProcessImageParams
				</a>
				<a href="/docs/how-it-works" class="nav-link">
					<span class="nav-icon">📖</span> How It Works
				</a>
			</nav>
		</div>
	</aside>

	<!-- Main Content -->
	<main class="main-content">
		<header class="page-header">
			<h1 class="page-title">Testing Guide</h1>
			<p class="page-subtitle">
				How to run, configure, and extend the polaroid extraction test suite.
			</p>
		</header>

		<section id="overview" class="doc-section">
			<div class="section-header">
				<span class="section-icon">📋</span>
				<h2 class="section-title">Overview</h2>
			</div>
			<p class="section-description">
				The test suite validates that the image processing pipeline correctly extracts polaroids
				from scanned images. Tests run in a real browser using Playwright to ensure accurate
				results with OpenCV.js.
			</p>
			<div class="mermaid">
				flowchart LR
				subgraph TestSuite[Test Suite]
					Playwright[Playwright] --> Browser[Chromium]
					Browser --> App[Dev Server]
					App --> Worker[OpenCV Worker]
				end
				subgraph Validation[Validation]
					Worker --> Count[Count Check]
					Worker --> PHash[Visual Hash]
					PHash --> Compare[Baseline Compare]
				end
			</div>
		</section>

		<section id="running-tests" class="doc-section">
			<div class="section-header">
				<span class="section-icon">▶️</span>
				<h2 class="section-title">Running Tests</h2>
			</div>

			<div class="code-block">
				<div class="code-header">Run extraction tests</div>
				<pre><code>pnpm run test:browser</code></pre>
			</div>

			<p class="section-description">This command will:</p>
			<ol class="numbered-list">
				<li>Start the Vite dev server automatically</li>
				<li>Launch a headless Chromium browser</li>
				<li>Upload each test image to the application</li>
				<li>Wait for processing to complete</li>
				<li>Verify the extracted count matches expectations</li>
				<li>Compare visual hashes if baselines exist</li>
			</ol>

			<div class="code-block">
				<div class="code-header">Example output</div>
				<pre><code>Running 5 tests using 1 worker

✓ lux_snacks_1.png should extract 4 polaroids (4.2s)
✓ lux_snacks_1 1.png should extract 4 polaroids (4.1s)
✓ lux_snacks_1 2.png should extract 4 polaroids (4.1s)
✓ lux_snacks_1 3.png should extract 4 polaroids (4.1s)
✓ Test Summary (64ms)

5 passed (18.6s)</code></pre>
			</div>
		</section>

		<section id="fixtures" class="doc-section">
			<div class="section-header">
				<span class="section-icon">📁</span>
				<h2 class="section-title">Test Fixtures</h2>
			</div>
			<p class="section-description">
				Test images are configured in <code class="inline-code">src/tests/fixtures.ts</code>. Each
				fixture defines a folder containing test images and the expected extraction results.
			</p>

			<div class="code-block">
				<div class="code-header">src/tests/fixtures.ts</div>
				<pre><code class="language-typescript">export const testFixtures: TestFixture[] = [
  {'{'}
    folder: '/path/to/your/test/images',
    images: [
      {'{'} filename: 'scan1.png', expectedCount: 4 {'}'},
      {'{'} filename: 'scan2.png', expectedCount: 6 {'}'},
      {'{'} 
        filename: 'scan3.png', 
        expectedCount: 4,
        baselineHashes: ['abc123...', 'def456...', ...]
      {'}'},
    ]
  {'}'}
];</code></pre>
			</div>

			<div class="callout callout-warning">
				<strong>Important:</strong> Test image paths are absolute and should NOT be committed to git.
				Each developer should configure their own local test images.
			</div>
		</section>

		<section id="baselines" class="doc-section">
			<div class="section-header">
				<span class="section-icon">🎯</span>
				<h2 class="section-title">Baseline Hashes</h2>
			</div>
			<p class="section-description">
				When you're confident the extraction algorithm is working correctly, generate baseline
				hashes to enable visual regression testing:
			</p>

			<div class="code-block">
				<div class="code-header">Generate baselines</div>
				<pre><code>pnpm run test:baselines</code></pre>
			</div>

			<p class="section-description">This script will:</p>
			<ol class="numbered-list">
				<li>Process all configured test images</li>
				<li>Calculate perceptual hash for each extracted polaroid</li>
				<li>Output a new fixtures file with baseline hashes</li>
			</ol>

			<div class="code-block">
				<div class="code-header">Example output</div>
				<pre><code>📸 Polaroid Baseline Hash Generator

📁 Processing folder: /Users/you/Pictures/scans
   📷 Processing: scan1.png
      Extracted 4 polaroids
      Polaroid 1: bf0507478700ffff
      Polaroid 2: ffe3e3c3c180ddff
      Polaroid 3: 9d30e1e92000ffff
      Polaroid 4: ff81c1008080ffff

✅ Generated baselines saved to: src/tests/fixtures.generated.ts</code></pre>
			</div>

			<p class="section-description">
				Copy the generated file to <code class="inline-code">fixtures.ts</code> to enable visual
				comparison in future test runs.
			</p>
		</section>

		<section id="phash" class="doc-section">
			<div class="section-header">
				<span class="section-icon">🔍</span>
				<h2 class="section-title">Visual Comparison (pHash)</h2>
			</div>
			<p class="section-description">
				The test suite uses <strong>perceptual hashing</strong> to compare extracted polaroids. This
				allows tests to pass even when minor changes (sharpening, compression) alter the exact
				bytes.
			</p>

			<div class="mermaid">
				flowchart LR
				subgraph Hash[Hash Generation]
					Image[Original Image] --> Resize[Resize to 8x8]
					Resize --> Gray[Grayscale]
					Gray --> Avg[Calculate Average]
					Avg --> Bits[Generate 64 bits]
				end
				subgraph Compare[Comparison]
					Bits --> Hamming[Hamming Distance]
					Baseline[Baseline Hash] --> Hamming
					Hamming --> Check{'{'}Dist 10 or less{'}'}
					Check -->|Yes| Pass[PASS]
					Check -->|No| Fail[FAIL]
				end
			</div>

			<div class="info-grid">
				<div class="info-card">
					<div class="info-value">0</div>
					<div class="info-label">Identical images</div>
				</div>
				<div class="info-card">
					<div class="info-value">1-10</div>
					<div class="info-label">Minor differences (OK)</div>
				</div>
				<div class="info-card">
					<div class="info-value">10-20</div>
					<div class="info-label">Noticeable changes</div>
				</div>
				<div class="info-card">
					<div class="info-value">&gt;20</div>
					<div class="info-label">Major regression</div>
				</div>
			</div>

			<p class="section-description">
				The default threshold is <strong>10 bits</strong>. You can adjust this in
				<code class="inline-code">fixtures.ts</code> via the
				<code class="inline-code">PHASH_SIMILARITY_THRESHOLD</code> constant.
			</p>
		</section>

		<section id="adding-tests" class="doc-section">
			<div class="section-header">
				<span class="section-icon">➕</span>
				<h2 class="section-title">Adding New Tests</h2>
			</div>

			<div class="step-list">
				<div class="step-item">
					<span class="step-number">1</span>
					<div class="step-content">
						<h3>Add images to a folder</h3>
						<p>Place your scanned polaroid images in a local folder.</p>
					</div>
				</div>

				<div class="step-item">
					<span class="step-number">2</span>
					<div class="step-content">
						<h3>Update fixtures.ts</h3>
						<p>Add a new entry with the folder path and expected counts:</p>
						<div class="code-block mini">
							<pre><code>{'{'}
  folder: '/path/to/new/folder',
  images: [
    {'{'} filename: 'image1.png', expectedCount: 4 {'}'},
  ]
{'}'}</code></pre>
						</div>
					</div>
				</div>

				<div class="step-item">
					<span class="step-number">3</span>
					<div class="step-content">
						<h3>Run tests</h3>
						<p>
							Verify the count is correct: <code class="inline-code">pnpm run test:browser</code>
						</p>
					</div>
				</div>

				<div class="step-item">
					<span class="step-number">4</span>
					<div class="step-content">
						<h3>Generate baselines</h3>
						<p>
							Lock in visual hashes: <code class="inline-code">pnpm run test:baselines</code>
						</p>
					</div>
				</div>
			</div>
		</section>

		<footer class="page-footer">
			<p>
				See also: <a href="/docs/how-it-works" class="footer-link">How It Works</a> |
				<a href="/docs" class="footer-link">API Reference</a>
			</p>
		</footer>
	</main>
</div>

<style>
	/* Use parent layout's container */
	.docs-inner {
		display: contents;
	}

	/* Secondary Sidebar */
	.secondary-sidebar {
		width: 240px;
		flex-shrink: 0;
		padding: 2rem 1.5rem;
		border-left: 1px solid var(--docs-border);
		background: var(--docs-bg-secondary);
		order: 1;
	}

	.secondary-sidebar-sticky {
		position: sticky;
		top: 5rem;
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
	}

	.secondary-sidebar-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--docs-text-muted);
		margin-bottom: 1rem;
	}

	.secondary-sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1.5rem;
	}

	.secondary-sidebar-nav .nav-link {
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: var(--docs-text-secondary);
		text-decoration: none;
		border-radius: 0.5rem;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.secondary-sidebar-nav .nav-link:hover {
		background: var(--docs-bg-hover);
		color: var(--docs-text-heading);
	}

	.nav-icon {
		font-size: 1rem;
		line-height: 1;
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

	.related-title {
		margin-top: 2rem;
	}

	/* Main Content */
	.main-content {
		padding: 2rem 3rem;
		max-width: 100%;
		flex: 1;
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
		border-bottom: 2px solid var(--accent-blue);
	}

	.section-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		font-size: 1rem;
		background: var(--accent-blue-bg);
		color: var(--accent-blue);
	}

	.section-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--docs-text-heading);
	}

	.section-description {
		color: var(--docs-text-secondary);
		font-size: 1rem;
		line-height: 1.7;
		margin-bottom: 1.5rem;
	}

	/* Code blocks */
	.code-block {
		background: var(--docs-bg-tertiary);
		border: 1px solid var(--docs-border);
		border-radius: 0.5rem;
		overflow: hidden;
		margin-bottom: 1.5rem;
	}

	.code-block.mini {
		margin-bottom: 0;
		margin-top: 0.75rem;
	}

	.code-header {
		background: var(--docs-bg-secondary);
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--docs-text-muted);
		border-bottom: 1px solid var(--docs-border);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.code-block pre {
		margin: 0;
		padding: 1rem;
		overflow-x: auto;
	}

	.code-block code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		color: var(--docs-text);
		line-height: 1.6;
	}

	.inline-code {
		font-family: 'JetBrains Mono', monospace;
		background: var(--docs-bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		color: var(--docs-text);
	}

	/* Lists */
	.numbered-list {
		list-style: none;
		counter-reset: step-counter;
		padding-left: 0;
		margin-bottom: 1.5rem;
	}

	.numbered-list li {
		counter-increment: step-counter;
		padding-left: 2.5rem;
		position: relative;
		margin-bottom: 0.75rem;
		color: var(--docs-text-secondary);
		line-height: 1.6;
	}

	.numbered-list li::before {
		content: counter(step-counter);
		position: absolute;
		left: 0;
		width: 1.5rem;
		height: 1.5rem;
		background: var(--accent-blue-bg);
		color: var(--accent-blue);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Callouts */
	.callout {
		padding: 1rem 1.5rem;
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
		font-size: 0.9375rem;
	}

	.callout-warning {
		background: #fef3c7;
		border-left: 4px solid #f59e0b;
		color: #92400e;
	}

	:global([data-theme='dark']) .callout-warning {
		background: #78350f20;
		border-color: #f59e0b;
		color: #fbbf24;
	}

	/* Info grid */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin: 1.5rem 0;
	}

	.info-card {
		background: var(--docs-bg-secondary);
		border: 1px solid var(--docs-border);
		border-radius: 0.5rem;
		padding: 1rem;
		text-align: center;
	}

	.info-value {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent-blue);
		margin-bottom: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem;
		color: var(--docs-text-muted);
	}

	/* Step list */
	.step-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.step-item {
		display: flex;
		gap: 1rem;
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: var(--accent-blue);
		color: white;
		border-radius: 50%;
		font-size: 1.125rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.step-content {
		flex: 1;
	}

	.step-content h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--docs-text-heading);
		margin-bottom: 0.25rem;
	}

	.step-content p {
		color: var(--docs-text-secondary);
		font-size: 0.9375rem;
		margin: 0;
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

	.footer-link {
		color: var(--accent-blue);
		text-decoration: none;
		font-weight: 500;
	}

	.footer-link:hover {
		text-decoration: underline;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.secondary-sidebar {
			display: none;
		}

		.main-content {
			padding: 1.5rem;
		}

		.info-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>

