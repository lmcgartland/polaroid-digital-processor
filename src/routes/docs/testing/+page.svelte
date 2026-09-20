<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme';
	import { renderDiagrams } from '../mermaid';

	let mounted = false;
	onMount(() => {
		mounted = true;
	});

	// Diagrams are re-rendered whenever the theme changes
	$: if (mounted) renderDiagrams($theme === 'dark');
</script>

<svelte:head>
	<title>Testing Guide - Polaroid Digital Processor</title>
</svelte:head>

<div class="docs-page">
	<!-- Table of contents -->
	<aside class="sidebar">
		<h2 class="sidebar-title">On This Page</h2>
		<nav class="sidebar-nav">
			<a href="#overview" class="nav-link">Overview</a>
			<a href="#running-tests" class="nav-link">Running Tests</a>
			<a href="#fixtures" class="nav-link">Test Fixtures</a>
			<a href="#baselines" class="nav-link">Baseline Hashes</a>
			<a href="#phash" class="nav-link">Visual Comparison</a>
			<a href="#adding-tests" class="nav-link">Adding Tests</a>
		</nav>

		<h2 class="sidebar-title">Related</h2>
		<nav class="sidebar-nav">
			<a href="/docs#interfaces" class="nav-link" style="--kind: var(--kind-interface)">
				<span class="nav-dot" />
				ProcessImageParams
			</a>
			<a href="/docs/how-it-works" class="nav-link">How It Works</a>
		</nav>
	</aside>

	<!-- Main Content -->
	<main class="main-content">
		<header class="page-header">
			<p class="page-eyebrow">Getting Started</p>
			<h1 class="page-title">Testing Guide</h1>
			<p class="page-subtitle">
				How to run, configure, and extend the polaroid extraction test suite.
			</p>
		</header>

		<section id="overview" class="doc-section">
			<h2 class="section-title">Overview</h2>
			<p class="section-desc">
				The test suite validates that the image processing pipeline correctly extracts polaroids
				from scanned images. Tests run in a real browser using Playwright to ensure accurate results
				with OpenCV.js.
			</p>
			<div class="diagram-container">
				<pre class="mermaid">
flowchart LR
    subgraph TestSuite[Test Suite]
        Playwright[Playwright] --> Browser[Chromium]
        Browser --> App[Dev Server]
        App --> Worker[WebGPU + OpenCV Worker]
    end
    subgraph Validation[Validation]
        Worker --> Count[Count Check]
        Worker --> PHash[Visual Hash]
        PHash --> Compare[Baseline Compare]
    end
				</pre>
			</div>
		</section>

		<section id="running-tests" class="doc-section">
			<h2 class="section-title">Running Tests</h2>

			<div class="code-block">
				<div class="code-header">Run extraction tests</div>
				<pre><code>pnpm run test:browser</code></pre>
			</div>

			<p class="section-desc">This command will:</p>
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
				<pre><code
						>Running 5 tests using 1 worker

✓ lux_snacks_1.png should extract 4 polaroids (4.2s)
✓ lux_snacks_1 1.png should extract 4 polaroids (4.1s)
✓ lux_snacks_1 2.png should extract 4 polaroids (4.1s)
✓ lux_snacks_1 3.png should extract 4 polaroids (4.1s)
✓ Test Summary (64ms)

5 passed (18.6s)</code
					></pre>
			</div>
		</section>

		<section id="fixtures" class="doc-section">
			<h2 class="section-title">Test Fixtures</h2>
			<p class="section-desc">
				Test images are configured in <code class="inline-code">src/tests/fixtures.ts</code>. Each
				fixture defines a folder containing test images and the expected extraction results.
			</p>

			<div class="code-block">
				<div class="code-header">src/tests/fixtures.ts</div>
				<pre><code class="language-typescript"
						>export const testFixtures: TestFixture[] = [
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
];</code
					></pre>
			</div>

			<div class="callout callout-warning">
				<strong>Important:</strong> Test image paths are absolute and should NOT be committed to git.
				Each developer should configure their own local test images.
			</div>
		</section>

		<section id="baselines" class="doc-section">
			<h2 class="section-title">Baseline Hashes</h2>
			<p class="section-desc">
				When you're confident the extraction algorithm is working correctly, generate baseline
				hashes to enable visual regression testing:
			</p>

			<div class="code-block">
				<div class="code-header">Generate baselines</div>
				<pre><code>pnpm run test:baselines</code></pre>
			</div>

			<p class="section-desc">This script will:</p>
			<ol class="numbered-list">
				<li>Process all configured test images</li>
				<li>Calculate perceptual hash for each extracted polaroid</li>
				<li>Output a new fixtures file with baseline hashes</li>
			</ol>

			<div class="code-block">
				<div class="code-header">Example output</div>
				<pre><code
						>📸 Polaroid Baseline Hash Generator

📁 Processing folder: /Users/you/Pictures/scans
   📷 Processing: scan1.png
      Extracted 4 polaroids
      Polaroid 1: bf0507478700ffff
      Polaroid 2: ffe3e3c3c180ddff
      Polaroid 3: 9d30e1e92000ffff
      Polaroid 4: ff81c1008080ffff

✅ Generated baselines saved to: src/tests/fixtures.generated.ts</code
					></pre>
			</div>

			<p class="section-desc">
				Copy the generated file to <code class="inline-code">fixtures.ts</code> to enable visual comparison
				in future test runs.
			</p>
		</section>

		<section id="phash" class="doc-section">
			<h2 class="section-title">Visual Comparison (pHash)</h2>
			<p class="section-desc">
				The test suite uses <strong>perceptual hashing</strong> to compare extracted polaroids. This allows
				tests to pass even when minor changes (sharpening, compression) alter the exact bytes.
			</p>

			<div class="diagram-container">
				<pre class="mermaid">
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
				</pre>
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

			<p class="section-desc">
				The default threshold is <strong>10 bits</strong>. You can adjust this in
				<code class="inline-code">fixtures.ts</code> via the
				<code class="inline-code">PHASH_SIMILARITY_THRESHOLD</code> constant.
			</p>
		</section>

		<section id="adding-tests" class="doc-section">
			<h2 class="section-title">Adding New Tests</h2>

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
							<pre><code
									>{'{'}
  folder: '/path/to/new/folder',
  images: [
    {'{'} filename: 'image1.png', expectedCount: 4 {'}'},
  ]
{'}'}</code
								></pre>
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
				See also: <a href="/docs/how-it-works">How It Works</a> ·
				<a href="/docs">API Reference</a>
			</p>
		</footer>
	</main>
</div>

<style>
	/* Shared docs styles live in ../docs.css; these are this page's own */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin: 1.5rem 0;
	}

	.info-card {
		padding: 1.25rem 1rem;
		text-align: center;
	}

	.info-value {
		margin-bottom: 0.25rem;
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}

	.info-label {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	/* Step list */
	.step-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 44rem;
	}

	.step-item {
		display: flex;
		gap: 1rem;
	}

	.step-number {
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.step-content {
		flex: 1;
		min-width: 0;
	}

	.step-content h3 {
		margin-bottom: 0.25rem;
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-primary);
	}

	.step-content p {
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	@media (max-width: 900px) {
		.info-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
