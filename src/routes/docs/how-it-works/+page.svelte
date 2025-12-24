<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme';

	let mermaidReady = false;
	let mermaidModule: typeof import('mermaid') | null = null;

	const darkThemeVariables = {
		primaryColor: '#7c3aed',
		primaryTextColor: '#fafafa',
		primaryBorderColor: '#a78bfa',
		lineColor: '#71717a',
		secondaryColor: '#18181b',
		tertiaryColor: '#27272a',
		background: '#0f0f10',
		mainBkg: '#18181b',
		nodeBorder: '#3f3f46',
		clusterBkg: '#27272a',
		clusterBorder: '#3f3f46',
		titleColor: '#fafafa',
		edgeLabelBackground: '#18181b'
	};

	const lightThemeVariables = {
		primaryColor: '#7c3aed',
		primaryTextColor: '#0f172a',
		primaryBorderColor: '#6d28d9',
		lineColor: '#94a3b8',
		secondaryColor: '#f1f5f9',
		tertiaryColor: '#e2e8f0',
		background: '#ffffff',
		mainBkg: '#f8fafc',
		nodeBorder: '#cbd5e1',
		clusterBkg: '#f1f5f9',
		clusterBorder: '#cbd5e1',
		titleColor: '#0f172a',
		edgeLabelBackground: '#f8fafc'
	};

	async function renderMermaid(isDark: boolean) {
		if (!mermaidModule) return;

		mermaidModule.default.initialize({
			startOnLoad: false,
			theme: isDark ? 'dark' : 'default',
			themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
			flowchart: {
				curve: 'basis',
				padding: 20
			}
		});

		await mermaidModule.default.run({
			querySelector: '.mermaid'
		});
	}

	onMount(async () => {
		mermaidModule = await import('mermaid');
		await renderMermaid($theme === 'dark');
		mermaidReady = true;
	});

	$: if (mermaidReady && mermaidModule) {
		renderMermaid($theme === 'dark');
	}

	// Table of contents
	const sections = [
		{ id: 'overview', label: 'System Overview', icon: '🏗️' },
		{ id: 'pipeline', label: 'Processing Pipeline', icon: '⚡' },
		{ id: 'steps', label: 'Step-by-Step', icon: '📋' },
		{ id: 'data-flow', label: 'Data Flow', icon: '🔄' },
		{ id: 'parameters', label: 'Parameters', icon: '🎛️' },
		{ id: 'tech-stack', label: 'Technology Stack', icon: '🛠️' }
	];
</script>

<svelte:head>
	<title>How It Works - Polaroid Digital Processor</title>
</svelte:head>

<div class="docs-page">
	<div class="docs-container">
		<!-- Secondary Sidebar - Page TOC -->
		<aside class="sidebar">
			<div class="sidebar-sticky">
				<h2 class="sidebar-title">On This Page</h2>
				<nav class="sidebar-nav">
					{#each sections as section}
						<a href="#{section.id}" class="nav-link">
							<span class="nav-icon">{section.icon}</span>
							{section.label}
						</a>
					{/each}
				</nav>

				<div class="sidebar-divider"></div>

				<h2 class="sidebar-title">Related</h2>
				<nav class="sidebar-nav">
					<a href="/docs#interfaces" class="nav-link nav-link-ref">
						<span class="nav-badge badge-interface">I</span>
						ProcessImageParams
					</a>
					<a href="/docs#types" class="nav-link nav-link-ref">
						<span class="nav-badge badge-type">T</span>
						WorkerMessageEvent
					</a>
					<a href="/docs#internal" class="nav-link nav-link-ref">
						<span class="nav-badge badge-internal">⚙</span>
						processImage()
					</a>
				</nav>
			</div>
		</aside>

		<!-- Main Content -->
		<main class="main-content">
			<header class="page-header">
				<h1 class="page-title">How It Works</h1>
				<p class="page-subtitle">
					An in-depth look at how the Polaroid Digital Processor detects and extracts individual
					photos from scanned images using computer vision.
				</p>
			</header>

			<!-- Overview Section -->
			<section id="overview" class="doc-section">
				<div class="section-header section-header-info">
					<span class="section-icon">🏗️</span>
					<h2 class="section-title">System Overview</h2>
				</div>

				<p class="section-desc">
					The application runs entirely in your browser with no server required. When you upload an
					image, it's processed using OpenCV.js in a Web Worker to keep the UI responsive.
				</p>

				<div class="diagram-container">
					<pre class="mermaid">
flowchart LR
    subgraph Browser["Browser (Client-Side)"]
        A[("📷 Image Upload")] --> B["Main Thread<br/>Svelte UI"]
        B --> C["Web Worker<br/>OpenCV.js"]
        C --> D[("🖼️ Extracted<br/>Polaroids")]
        C -.->|Preview| B
        D --> E["📦 ZIP Download"]
    end

    style A fill:#7c3aed,stroke:#a78bfa,color:#fff
    style D fill:#10b981,stroke:#34d399,color:#fff
    style E fill:#0891b2,stroke:#22d3ee,color:#fff
					</pre>
				</div>

				<div class="callout callout-info">
					<strong>No data leaves your browser.</strong> All processing happens locally using WebAssembly,
					ensuring your photos remain private.
				</div>
			</section>

			<!-- Processing Pipeline -->
			<section id="pipeline" class="doc-section">
				<div class="section-header section-header-function">
					<span class="section-icon">⚡</span>
					<h2 class="section-title">Processing Pipeline</h2>
				</div>

				<p class="section-desc">
					The core algorithm uses a multi-stage computer vision pipeline. See the
					<a href="/docs#internal" class="inline-link">processImage()</a> function for implementation
					details.
				</p>

				<div class="diagram-container">
					<pre class="mermaid">
flowchart TB
    subgraph Input["1. Input"]
        A["Raw Scanned Image<br/>(Multiple Polaroids)"]
    end

    subgraph Preprocess["2. Preprocessing"]
        B["Resize Image"] --> C["Median Blur<br/>(Noise Reduction)"]
        C --> D["Grayscale Conversion"]
    end

    subgraph Segment["3. Segmentation"]
        E["Binary Threshold"] --> F["Morphological Ops<br/>(Erosion + Dilation)"]
        F --> G["Distance Transform"]
        G --> H["Watershed Algorithm"]
    end

    subgraph Detect["4. Detection"]
        I["Find Contours"] --> J["Filter by Area"]
        J --> K["Extract Bounding Rects"]
    end

    subgraph Extract["5. Extraction"]
        L["Perspective Transform"] --> M["Sharpen Filter"]
        M --> N["Export as PNG"]
    end

    A --> B
    D --> E
    H --> I
    K --> L

    style A fill:#f97316,stroke:#fb923c
    style N fill:#10b981,stroke:#34d399
					</pre>
				</div>
			</section>

			<!-- Step-by-Step -->
			<section id="steps" class="doc-section">
				<div class="section-header section-header-type">
					<span class="section-icon">📋</span>
					<h2 class="section-title">Step-by-Step Breakdown</h2>
				</div>

				<div class="steps-grid">
					<div class="step-card">
						<div class="step-number">1</div>
						<h3>Image Upload & Transfer</h3>
						<p>
							The uploaded image is read as an <code>ArrayBuffer</code> and transferred to the Web
							Worker using
							<a href="/docs#types" class="inline-link">WorkerMessageEvent</a>.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">2</div>
						<h3>Preprocessing</h3>
						<p>
							The image is resized, then a <strong>median blur</strong> is applied
							(<a href="/docs#interfaces" class="inline-link">medianBlurKernel</a>) to reduce noise
							while preserving edges.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">3</div>
						<h3>Binary Thresholding</h3>
						<p>
							A <a href="/docs#interfaces" class="inline-link">thresholdValue</a> separates white polaroid
							borders from the background, creating a binary image.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">4</div>
						<h3>Morphological Operations</h3>
						<p>
							<strong>Erosion</strong> removes noise, then <strong>dilation</strong> restores shapes.
							Controlled by
							<a href="/docs#interfaces" class="inline-link">structuringElementSize</a>.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">5</div>
						<h3>Distance Transform</h3>
						<p>
							Calculates pixel distances to boundaries. The
							<a href="/docs#interfaces" class="inline-link">distanceTransformThreshold</a>
							identifies "sure foreground" regions.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">6</div>
						<h3>Watershed Segmentation</h3>
						<p>
							The <strong>watershed algorithm</strong> treats the image like a topographic map, flooding
							from markers to find boundaries between touching polaroids.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">7</div>
						<h3>Contour Detection</h3>
						<p>
							OpenCV finds contours of each region. We filter by
							<a href="/docs#interfaces" class="inline-link">surfaceAreaToleranceLow</a> and
							<a href="/docs#interfaces" class="inline-link">surfaceAreaToleranceHigh</a>.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">8</div>
						<h3>Perspective Correction</h3>
						<p>
							Each detected polaroid is extracted using a <strong>perspective transform</strong>,
							correcting for rotation or skew in the scan.
						</p>
					</div>

					<div class="step-card">
						<div class="step-number">9</div>
						<h3>Sharpening & Export</h3>
						<p>
							A sharpening filter enhances detail, then each polaroid is exported as PNG and bundled
							into a ZIP file.
						</p>
					</div>
				</div>
			</section>

			<!-- Data Flow -->
			<section id="data-flow" class="doc-section">
				<div class="section-header section-header-interface">
					<span class="section-icon">🔄</span>
					<h2 class="section-title">Data Flow Between Threads</h2>
				</div>

				<p class="section-desc">
					Communication uses the <a href="/docs#types" class="inline-link">WorkerMessageEvent</a>
					type with transferable objects for zero-copy efficiency.
				</p>

				<div class="diagram-container">
					<pre class="mermaid">
sequenceDiagram
    participant UI as Main Thread (UI)
    participant Worker as Web Worker (OpenCV)

    Note over UI,Worker: Initialization
    Worker->>UI: WORKER READY

    Note over UI,Worker: Image Processing
    UI->>Worker: PROCESS IMAGE (ArrayBuffer)
    
    loop For each processing stage
        Worker-->>UI: UPDATE PREVIEW (preview image)
    end

    Worker->>UI: EXTRACTED POLAROIDS (ArrayBuffer[])

    Note over UI: ZIP and download
					</pre>
				</div>
			</section>

			<!-- Parameters -->
			<section id="parameters" class="doc-section">
				<div class="section-header section-header-internal">
					<span class="section-icon">🎛️</span>
					<h2 class="section-title">Tunable Parameters</h2>
				</div>

				<p class="section-desc">
					All parameters are defined in the
					<a href="/docs#interfaces" class="inline-link">ProcessImageParams</a> interface.
				</p>

				<div class="diagram-container">
					<pre class="mermaid">
mindmap
  root((Parameters))
    Noise Reduction
      Median Blur Kernel
        Higher = More blur
        Must be odd number
    Segmentation
      Threshold Value
        Light/dark separation
      Structuring Element
        Morphology strength
      Distance Transform
        Foreground detection
    Filtering
      Area Tolerance Low
        Min polaroid size
      Area Tolerance High
        Max polaroid size
					</pre>
				</div>

				<div class="callout callout-tip">
					<strong>Tip:</strong> If polaroids aren't being detected, try adjusting the
					<code>thresholdValue</code>
					first. For noisy scans, increase the <code>medianBlurKernel</code>.
				</div>
			</section>

			<!-- Technology Stack -->
			<section id="tech-stack" class="doc-section">
				<div class="section-header section-header-function">
					<span class="section-icon">🛠️</span>
					<h2 class="section-title">Technology Stack</h2>
				</div>

				<div class="diagram-container">
					<pre class="mermaid">
flowchart TB
    subgraph Frontend["Frontend"]
        A["SvelteKit"] --> B["Tailwind CSS"]
        A --> C["TypeScript"]
    end

    subgraph Processing["Image Processing"]
        D["OpenCV.js"] --> E["Web Workers"]
        D --> F["Watershed Algorithm"]
    end

    subgraph Output["Output"]
        G["Canvas API"] --> H["Blob/ArrayBuffer"]
        H --> I["JSZip"]
    end

    Frontend --> Processing
    Processing --> Output

    style A fill:#ff3e00,stroke:#ff6d00
    style D fill:#5c3d8c,stroke:#8b5cf6
    style I fill:#f97316,stroke:#fb923c
					</pre>
				</div>
			</section>

			<footer class="page-footer">
				<p>
					See the <a href="/docs">API Reference</a> for detailed type definitions and function signatures.
				</p>
			</footer>
		</main>
	</div>
</div>

<style>
	/* Theme-aware CSS variables for docs */
	.docs-page {
		--docs-bg: #0f0f10;
		--docs-bg-secondary: #18181b;
		--docs-bg-tertiary: #09090b;
		--docs-bg-hover: #27272a;
		--docs-border: #27272a;
		--docs-text: #e4e4e7;
		--docs-text-secondary: #a1a1aa;
		--docs-text-muted: #71717a;
		--docs-text-heading: #fafafa;

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

		--color-info: #3b82f6;
		--color-info-bg: #1e3a5f;
	}

	:global([data-theme='light']) .docs-page {
		--docs-bg: #f8fafc;
		--docs-bg-secondary: #ffffff;
		--docs-bg-tertiary: #f1f5f9;
		--docs-bg-hover: #e2e8f0;
		--docs-border: #e2e8f0;
		--docs-text: #334155;
		--docs-text-secondary: #64748b;
		--docs-text-muted: #94a3b8;
		--docs-text-heading: #0f172a;

		--color-interface-text: #6d28d9;
		--color-interface-bg: #ede9fe;
		--color-type-text: #0e7490;
		--color-type-bg: #cffafe;
		--color-function-text: #059669;
		--color-function-bg: #d1fae5;
		--color-internal-text: #ea580c;
		--color-internal-bg: #ffedd5;
		--color-info: #2563eb;
		--color-info-bg: #dbeafe;
	}

	.docs-page {
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		background: var(--docs-bg);
		min-height: 100%;
		color: var(--docs-text);
		transition: background-color 0.2s, color 0.2s;
	}

	.docs-container {
		display: grid;
		grid-template-columns: 220px 1fr;
		min-height: 100%;
	}

	/* Sidebar */
	.sidebar {
		background: var(--docs-bg-secondary);
		border-right: 1px solid var(--docs-border);
		padding: 1.5rem 1rem;
	}

	.sidebar-sticky {
		position: sticky;
		top: 5rem;
	}

	.sidebar-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--docs-text-muted);
		margin-bottom: 0.75rem;
	}

	.sidebar-divider {
		height: 1px;
		background: var(--docs-border);
		margin: 1.5rem 0;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--docs-text-secondary);
		text-decoration: none;
		transition: all 0.15s;
	}

	.nav-link:hover {
		background: var(--docs-bg-hover);
		color: var(--docs-text-heading);
	}

	.nav-icon {
		font-size: 0.875rem;
		width: 1.125rem;
	}

	.nav-link-ref {
		font-size: 0.75rem;
	}

	.nav-badge {
		font-size: 0.625rem;
		font-weight: 600;
		width: 1.125rem;
		height: 1.125rem;
		display: flex;
		align-items: center;
		justify-content: center;
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
	.badge-internal {
		background: var(--color-internal-bg);
		color: var(--color-internal-text);
	}

	/* Main content */
	.main-content {
		padding: 2rem 3rem;
		max-width: 900px;
	}

	.page-header {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--docs-border);
	}

	.page-title {
		font-size: 2.25rem;
		font-weight: 700;
		color: var(--docs-text-heading);
		margin-bottom: 0.5rem;
	}

	.page-subtitle {
		font-size: 1rem;
		color: var(--docs-text-muted);
		line-height: 1.6;
	}

	/* Sections */
	.doc-section {
		margin-bottom: 3.5rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 1rem;
		padding-bottom: 0.625rem;
		border-bottom: 2px solid;
	}

	.section-header-info {
		border-color: var(--color-info);
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
		font-size: 1.125rem;
	}

	.section-title {
		font-size: 1.375rem;
		font-weight: 600;
		color: var(--docs-text-heading);
	}

	.section-desc {
		color: var(--docs-text-secondary);
		font-size: 0.9375rem;
		line-height: 1.7;
		margin-bottom: 1.5rem;
	}

	/* Diagram container */
	.diagram-container {
		background: var(--docs-bg-secondary);
		border: 1px solid var(--docs-border);
		border-radius: 0.625rem;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		overflow-x: auto;
	}

	.diagram-container :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.mermaid {
		display: flex;
		justify-content: center;
	}

	/* Callouts */
	.callout {
		padding: 1rem 1.25rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.6;
		margin-bottom: 1.5rem;
	}

	.callout-info {
		background: var(--color-info-bg);
		border-left: 3px solid var(--color-info);
		color: var(--docs-text);
	}

	.callout-tip {
		background: var(--color-function-bg);
		border-left: 3px solid var(--color-function);
		color: var(--docs-text);
	}

	.callout code {
		background: var(--docs-bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
	}

	/* Steps Grid */
	.steps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1rem;
	}

	.step-card {
		background: var(--docs-bg-secondary);
		border: 1px solid var(--docs-border);
		border-radius: 0.625rem;
		padding: 1.25rem;
		position: relative;
	}

	.step-number {
		position: absolute;
		top: -0.625rem;
		left: 1rem;
		background: var(--color-interface);
		color: white;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.75rem;
	}

	.step-card h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--docs-text-heading);
		margin-bottom: 0.5rem;
		margin-top: 0.375rem;
	}

	.step-card p {
		font-size: 0.8125rem;
		color: var(--docs-text-secondary);
		line-height: 1.6;
	}

	.step-card code {
		background: var(--docs-bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--color-type-text);
	}

	.step-card strong {
		color: var(--color-interface-text);
	}

	/* Inline links */
	.inline-link {
		color: var(--color-interface-text);
		text-decoration: none;
		font-weight: 500;
	}

	.inline-link:hover {
		text-decoration: underline;
	}

	/* Footer */
	.page-footer {
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--docs-border);
		text-align: center;
		color: var(--docs-text-muted);
		font-size: 0.875rem;
	}

	.page-footer a {
		color: var(--color-interface-text);
		text-decoration: none;
	}

	.page-footer a:hover {
		text-decoration: underline;
	}

	/* Responsive */
	@media (max-width: 1200px) {
		.docs-container {
			grid-template-columns: 1fr;
		}

		.sidebar {
			display: none;
		}

		.main-content {
			padding: 1.5rem;
			max-width: 100%;
		}
	}
</style>

