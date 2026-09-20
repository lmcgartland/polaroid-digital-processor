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

	// Table of contents
	const sections = [
		{ id: 'overview', label: 'System Overview' },
		{ id: 'pipeline', label: 'Processing Pipeline' },
		{ id: 'steps', label: 'Step-by-Step' },
		{ id: 'data-flow', label: 'Data Flow' },
		{ id: 'parameters', label: 'Parameters' },
		{ id: 'tech-stack', label: 'Technology Stack' }
	];
</script>

<svelte:head>
	<title>How It Works - Polaroid Digital Processor</title>
</svelte:head>

<div class="docs-page">
	<!-- Table of contents -->
	<aside class="sidebar">
		<h2 class="sidebar-title">On This Page</h2>
		<nav class="sidebar-nav">
			{#each sections as section}
				<a href="#{section.id}" class="nav-link">{section.label}</a>
			{/each}
		</nav>

		<h2 class="sidebar-title">Related</h2>
		<nav class="sidebar-nav">
			<a href="/docs#interfaces" class="nav-link" style="--kind: var(--kind-interface)">
				<span class="nav-dot" />
				ProcessImageParams
			</a>
			<a href="/docs#types" class="nav-link" style="--kind: var(--kind-type)">
				<span class="nav-dot" />
				WorkerMessageEvent
			</a>
			<a href="/docs#internal" class="nav-link" style="--kind: var(--kind-internal)">
				<span class="nav-dot" />
				processImage()
			</a>
		</nav>
	</aside>

	<!-- Main Content -->
	<main class="main-content">
		<header class="page-header">
			<p class="page-eyebrow">Getting Started</p>
			<h1 class="page-title">How It Works</h1>
			<p class="page-subtitle">
				An in-depth look at how the Polaroid Digital Processor detects and extracts individual
				photos from scanned images using computer vision.
			</p>
		</header>

		<!-- Overview Section -->
		<section id="overview" class="doc-section">
			<h2 class="section-title">System Overview</h2>

			<p class="section-desc">
				The application runs entirely in your browser with no server required. When you upload an
				image, it's processed in a Web Worker to keep the UI responsive: WebGPU handles the
				full-resolution pixel work and OpenCV.js finds the polaroids in a downsized copy. Browsers
				without WebGPU fall back to OpenCV.js for everything.
			</p>

			<div class="diagram-container">
				<pre class="mermaid">
flowchart LR
    subgraph Browser["Browser (Client-Side)"]
        A[("Image Upload")] --> B["Main Thread<br />Svelte UI"]
        B --> C["Web Worker<br />WebGPU + OpenCV.js"]
        C --> D[("Extracted<br />Polaroids")]
        C -.->|Outlines| B
        D --> E["ZIP Download"]
    end

    style A fill:#0a84ff,stroke:#0a84ff,color:#fff
    style D fill:#28a745,stroke:#28a745,color:#fff
					</pre>
			</div>

			<div class="callout callout-info">
				<strong>No data leaves your browser.</strong> All processing happens locally using WebAssembly,
				ensuring your photos remain private.
			</div>
		</section>

		<!-- Processing Pipeline -->
		<section id="pipeline" class="doc-section">
			<h2 class="section-title">Processing Pipeline</h2>

			<p class="section-desc">
				The core algorithm uses a multi-stage computer vision pipeline. See the
				<a href="/docs#internal" class="inline-link">processImage()</a> function for implementation details.
			</p>

			<div class="diagram-container">
				<pre class="mermaid">
flowchart TB
    subgraph Input["1. Input"]
        A["Raw Scanned Image<br />(Multiple Polaroids)"]
    end

    subgraph Preprocess["2. Preprocessing"]
        B["Resize Image<br />(WebGPU)"] --> C["Median Blur<br />(Noise Reduction, WebGPU)"]
        C --> D["Grayscale Conversion"]
    end

    subgraph Segment["3. Segmentation"]
        E["Binary Threshold"] --> F["Morphological Ops<br />(Erosion + Dilation)"]
        F --> G["Distance Transform"]
        G --> H["Watershed Algorithm"]
    end

    subgraph Detect["4. Detection"]
        I["Find Contours"] --> J["Filter by Area<br />+ Rectangularity"]
        J --> K["Extract Bounding Rects"]
        K --> R["Refine Edges<br />(Full Resolution)"]
    end

    subgraph Extract["5. Extraction"]
        L["Perspective Transform<br />(WebGPU)"] --> M["Sharpen Filter<br />(WebGPU)"]
        M --> N["Display, then export<br />as PNG on download"]
    end

    A --> B
    D --> E
    H --> I
    R --> L

    style A fill:#0a84ff,stroke:#0a84ff,color:#fff
    style N fill:#28a745,stroke:#28a745,color:#fff
					</pre>
			</div>
		</section>

		<!-- Step-by-Step -->
		<section id="steps" class="doc-section">
			<h2 class="section-title">Step-by-Step Breakdown</h2>

			<div class="steps-grid">
				<div class="step-card">
					<div class="step-number">1</div>
					<h3>Image Upload & Transfer</h3>
					<p>
						The uploaded image is decoded into an <code>ImageBitmap</code> and transferred to the
						Web Worker using
						<a href="/docs#types" class="inline-link">WorkerMessageEvent</a>. The worker uploads it
						to a GPU texture once; the full-resolution pixels never pass through JavaScript.
					</p>
				</div>

				<div class="step-card">
					<div class="step-number">2</div>
					<h3>Preprocessing</h3>
					<p>
						The image is resized, then a <strong>median blur</strong> is applied (<a
							href="/docs#interfaces"
							class="inline-link">medianBlurKernel</a
						>) to reduce noise while preserving edges. Both run as WebGPU shaders, and only this
						small detection image is read back for OpenCV.
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
						<a href="/docs#interfaces" class="inline-link">surfaceAreaToleranceHigh</a>, and discard
						regions that don't fill their bounding rectangle (such as the background between
						polaroids). Because detection runs on a downsized image, these rectangles are only
						accurate to a few pixels, so each edge is then
						<strong>re-located in the full-resolution scan</strong>: short profiles are sampled
						across it, the point where they leave the frame's colour is found, and a rectangle is
						fitted robustly to the results.
					</p>
				</div>

				<div class="step-card">
					<div class="step-number">8</div>
					<h3>Perspective Correction</h3>
					<p>
						Each detected polaroid is extracted using a <strong>perspective transform</strong>,
						correcting for rotation or skew in the scan. On WebGPU this samples the full-resolution
						texture directly.
					</p>
				</div>

				<div class="step-card">
					<div class="step-number">9</div>
					<h3>Sharpening & Export</h3>
					<p>
						A sharpening filter enhances detail (in the same shader pass as the transform) and the
						results are shown immediately. PNG encoding is the slowest step, so it only happens when
						you download, where the polaroids are bundled into a ZIP file.
					</p>
				</div>
			</div>
		</section>

		<!-- Data Flow -->
		<section id="data-flow" class="doc-section">
			<h2 class="section-title">Data Flow Between Threads</h2>

			<p class="section-desc">
				Communication uses the <a href="/docs#types" class="inline-link">WorkerMessageEvent</a>
				type with transferable objects for zero-copy efficiency.
			</p>

			<div class="diagram-container">
				<pre class="mermaid">
sequenceDiagram
    participant UI as Main Thread (UI)
    participant Worker as Web Worker (WebGPU + OpenCV)

    Note over UI,Worker: Initialization
    Worker->>UI: WORKER READY

    Note over UI,Worker: Image Processing
    UI->>Worker: PROCESS IMAGE (ImageBitmap)
    Worker-->>UI: UPDATE PREVIEW (outlines + contour overlay)
    Worker->>UI: TIMINGS (per-stage durations)
    Worker->>UI: EXTRACTED POLAROIDS (ImageBitmap[])

    Note over UI,Worker: Re-processing with new parameters
    UI->>Worker: PROCESS IMAGE (parameters only)
    Note over Worker: Reuses the image already on the GPU

    Note over UI: Encode PNGs, ZIP and download
    UI->>Worker: RELEASE IMAGE (on reset)
					</pre>
			</div>
		</section>

		<!-- Parameters -->
		<section id="parameters" class="doc-section">
			<h2 class="section-title">Tunable Parameters</h2>

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
			<h2 class="section-title">Technology Stack</h2>

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
        W["WebGPU"] --> E
    end

    subgraph Output["Output"]
        G["Canvas API"] --> H["ImageBitmap/Blob"]
        H --> I["JSZip"]
    end

    Frontend --> Processing
    Processing --> Output

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

<style>
	/* Shared docs styles live in ../docs.css; these are this page's own */
	.steps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 1rem;
	}

	.step-card {
		padding: 1.5rem;
	}

	.step-card h3 {
		margin: 0.875rem 0 0.375rem;
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-primary);
	}

	.step-card p {
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.step-card strong {
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
