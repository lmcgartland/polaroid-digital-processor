<script lang="ts">
	// @ts-ignore
	import JSZip from 'jszip';
	import { onMount } from 'svelte';
	import type { ProcessImageParams, WorkerMessageEvent } from '$lib/workerTypes';

	let isReady: boolean = false;
	let input: HTMLInputElement;
	let previewImage: HTMLImageElement;
	let previewImageData: string | undefined;
	let originalImageData: string | undefined;
	let originalImageArrayBuffer: ArrayBuffer | undefined;
	let originalImageWidth: number | undefined;
	let originalImageHeight: number | undefined;
	let worker: Worker;

	let fileOutputCanvas: HTMLCanvasElement;

	// Data for extracted polaroids
	let extractedPolaroids: Blob[] = [];

	// Add parameter controls with default values
	let params: ProcessImageParams = {
		medianBlurKernel: 5,
		thresholdValue: 132,
		structuringElementSize: 12,
		distanceTransformThreshold: 0.9,
		surfaceAreaToleranceLow: 0.8,
		surfaceAreaToleranceHigh: 1.2
	};

	onMount(async() => {
		// const MyWorker = await import('$lib/worker.ts?worker', {type: 'classic'});
		worker =  await new Worker(new URL('$lib/worker.ts?worker', import.meta.url), {type: 'classic'}) 
		// worker = new MyWorker.default(); 
		worker.onmessage = (event: MessageEvent<WorkerMessageEvent>) => {
			// console.log('WORKER MESSAGE', event);
			switch (event.data.type) {
				case 'WORKER READY':
					isReady = true;
					break;
				case 'EXTRACTED POLAROIDS':
					// Convert ArrayBuffer[] back to Blob[]
					extractedPolaroids = event.data.extracted.map(arrayBuffer => new Blob([arrayBuffer], { type: 'image/png' }));
					break;
				case 'UPDATE PREVIEW':
					const arrayBuffer = event.data.preview;
					const blob = new Blob([arrayBuffer], { type: 'image/png' });
					previewImageData = URL.createObjectURL(blob);
					// ArrayBuffer is transferred, so we don't need to clean it up
					break;
			}
		};
	});

	function onChange() {
		if (input && input.files) {
			const file = input.files[0];

			if (file) {
				// Read as DataURL for preview
				const dataURLReader = new FileReader();
				dataURLReader.addEventListener('load', function () {
					originalImageData = dataURLReader.result as string;
					previewImageData = originalImageData;

					// Create a new image element and wait for it to load
					const image = new Image();
					image.onload = () => {
						processImage(image);
					};
					image.onerror = () => {
						console.error('Failed to load image');
					};
					image.src = originalImageData;
				});

				dataURLReader.readAsDataURL(file);
				return;
			}
		}
	}

	// This is the fastest way to extract the image texture from the preview image
	// WebGL is 2x slower in testing
	async function extractImageTextureFromPreview(image: HTMLImageElement) {
		
		// Ensure the image is fully loaded
		if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
			throw new Error('Image is not fully loaded');
		}
		
		// Store dimensions from the already loaded image
		originalImageWidth = image.naturalWidth;
		originalImageHeight = image.naturalHeight;

		// Fastest approach: Use ImageBitmap with OffscreenCanvas
		// This avoids DOM canvas creation and uses the most efficient path
		const imageBitmap = await createImageBitmap(image);
		
		// Use OffscreenCanvas for maximum performance
		const offscreenCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
		const ctx = offscreenCanvas.getContext('2d');
		
		if (ctx) {
			// Draw the ImageBitmap to the offscreen canvas
			ctx.drawImage(imageBitmap, 0, 0);
			
			// Get ImageData (RGBA format) - this is the decoded texture data
			const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
			
			// Convert ImageData to ArrayBuffer
			originalImageArrayBuffer = imageData.data.buffer.slice(imageData.data.byteOffset, imageData.data.byteOffset + imageData.data.byteLength);
		}
		
		// Clean up the ImageBitmap
		imageBitmap.close();
	}

	async function processImage(image: HTMLImageElement) {
		try {
			await extractImageTextureFromPreview(image);

			if (originalImageArrayBuffer && originalImageWidth && originalImageHeight) {
				worker.postMessage({ 
					type: 'PROCESS IMAGE', 
					imageData: originalImageArrayBuffer,
					width: originalImageWidth,
					height: originalImageHeight,
					params
				}, [originalImageArrayBuffer]);
			}
		} catch (error) {
			console.error('Error processing image:', error);
			// You might want to show a user-friendly error message here
		}
	}

	function downloadImages() {
		// ZIP the images and download
		const zip = new JSZip();
		const folder = zip.folder('polaroids');
		// console.log('EXTRACTED POLAROIDS', extractedPolaroids);
		for (let i = 0; i < extractedPolaroids.length; i++) {
			const blob = extractedPolaroids[i];

			// Create file safe date time string
			const date = new Date();
			const dateString = date.toISOString().replace(/:/g, '-').replace(/\./g, '-');

			folder?.file(`polaroid-${i}-${dateString}.png`, blob, { binary: true });
		}

		// Download the zip by clicking a link
		zip.generateAsync({ type: 'blob' }).then(function (content: Blob) {
			const link = document.createElement('a');
			link.href = URL.createObjectURL(content);
			link.download = 'polaroids.zip';
			link.click();
		});
	}

	function resetState() {
		previewImageData = undefined;
		originalImageData = undefined;
		originalImageArrayBuffer = undefined;
		originalImageWidth = undefined;
		originalImageHeight = undefined;
		extractedPolaroids = [];
		// Note: previewImage will be automatically updated when previewImageData changes
	}
</script>

{#if isReady}
	<div class="app-container">
		<!-- Left Column - Image Input/Output -->
		<div class="preview-column">
			<!-- Preview section with flex-grow -->
			<section class="preview-section">
				{#if previewImageData}
					<div class="preview-wrapper">
						<img bind:this={previewImage} id="preview" src={previewImageData} alt="Uploaded Image" class="preview-image"/>
					</div>
				{:else}
					<div class="upload-prompt">
						<h1 class="upload-title">Upload an image to get started</h1>
						<input bind:this={input} on:change={onChange} type="file" accept="image/*" class="file-input" />
					</div>
				{/if}
			</section>

			<!-- Fixed height thumbnails section -->
			<section class="thumbnails-section">
				<div class="thumbnails-grid">
					{#each extractedPolaroids as polaroid, i}
						{@const polaroidURL = URL.createObjectURL(polaroid)}
						<img class="thumbnail" src={polaroidURL} alt="Polaroid {i + 1}" />
					{/each}
				</div>
			</section>
			<button on:click={downloadImages} class="btn btn-primary download-btn">
				Download images
			</button>
		</div>

		<!-- Right Column - Controls -->
		<div class="controls-column">
			<section class="controls-card">
				<h2 class="controls-title">Processing Parameters</h2>
				<div class="params-grid">
					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showMedianBlurHelp = !params.showMedianBlurHelp}
							>
								{params.showMedianBlurHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Median Blur Kernel:</span>
								<span class="param-value">{params.medianBlurKernel}</span>
								<div class="param-input-wrapper">
									<input 
										type="number" 
										bind:value={params.medianBlurKernel}
										min="3" 
										max="15"
										step="2"
										class="input-number"
									/>
								</div>
							</label>
						</div>
						{#if params.showMedianBlurHelp}
							<p class="param-help">
								Controls initial image smoothing. Higher values (must be odd) reduce noise but blur details. 
								Try increasing if detecting false edges, or decreasing if missing polaroid edges.
							</p>
						{/if}
					</div>
					
					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showThresholdHelp = !params.showThresholdHelp}
							>
								{params.showThresholdHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Threshold Value:</span>
								<span class="param-value">{params.thresholdValue}</span>
								<div class="param-input-wrapper">
									<input 
										type="range" 
										bind:value={params.thresholdValue}
										min="0" 
										max="255"
										class="input-range"
									/>
								</div>
							</label>
						</div>
						{#if params.showThresholdHelp}
							<p class="param-help">
								Determines how aggressively to separate light and dark areas. Higher values create stronger 
								contrast between polaroids and background. Adjust based on scan brightness and contrast.
							</p>
						{/if}
					</div>

					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showStructuringHelp = !params.showStructuringHelp}
							>
								{params.showStructuringHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Structuring Element Size:</span>
								<span class="param-value">{params.structuringElementSize}</span>
								<div class="param-input-wrapper">
									<input 
										type="number" 
										bind:value={params.structuringElementSize}
										min="3" 
										max="20"
										class="input-number"
									/>
								</div>
							</label>
						</div>
						{#if params.showStructuringHelp}
							<p class="param-help">
								Controls noise removal strength. Larger values help merge broken edges but might connect 
								nearby polaroids. Increase if polaroids have gaps, decrease if they're merging together.
							</p>
						{/if}
					</div>

					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showDistanceHelp = !params.showDistanceHelp}
							>
								{params.showDistanceHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Distance Transform:</span>
								<span class="param-value">{(params.distanceTransformThreshold ?? 0.9).toFixed(2)}</span>
								<div class="param-input-wrapper">
									<input 
										type="range" 
										bind:value={params.distanceTransformThreshold}
										min="0" 
										max="1"
										step="0.05"
										class="input-range"
									/>
								</div>
							</label>
						</div>
						{#if params.showDistanceHelp}
							<p class="param-help">
								Affects how polaroids are separated from background. Higher values create stricter separation, 
								lower values are more lenient. Adjust if polaroids are being cut off or including background.
							</p>
						{/if}
					</div>

					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showAreaLowHelp = !params.showAreaLowHelp}
							>
								{params.showAreaLowHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Surface Area (Low):</span>
								<span class="param-value">{(params.surfaceAreaToleranceLow ?? 0.8).toFixed(2)}</span>
								<div class="param-input-wrapper">
									<input 
										type="range" 
										bind:value={params.surfaceAreaToleranceLow}
										min="0.5" 
										max="1"
										step="0.05"
										class="input-range"
									/>
								</div>
							</label>
						</div>
						{#if params.showAreaLowHelp}
							<p class="param-help">
								Minimum size multiplier for detected polaroids. Lower values allow smaller detections. 
								Decrease if missing partial polaroids, but may increase false positives.
							</p>
						{/if}
					</div>

					<div class="param-group">
						<div class="param-header">
							<button 
								class="expand-btn" 
								on:click={() => params.showAreaHighHelp = !params.showAreaHighHelp}
							>
								{params.showAreaHighHelp ? '▼' : '▶'}
							</button>
							<label class="param-label">
								<span class="param-name">Surface Area (High):</span>
								<span class="param-value">{(params.surfaceAreaToleranceHigh ?? 1.2).toFixed(2)}</span>
								<div class="param-input-wrapper">
									<input 
										type="range" 
										bind:value={params.surfaceAreaToleranceHigh}
										min="1" 
										max="1.5"
										step="0.05"
										class="input-range"
									/>
								</div>
							</label>
						</div>
						{#if params.showAreaHighHelp}
							<p class="param-help">
								Maximum size multiplier for detected polaroids. Higher values allow larger detections. 
								Increase if missing merged polaroids, but may detect non-polaroid areas.
							</p>
						{/if}
					</div>
				</div>

				<div class="actions-row">
					<button on:click={() => processImage(previewImage)} class="btn btn-primary flex-1">
						Process Image
					</button>
					<button on:click={resetState} class="btn btn-secondary">
						Reset
					</button>
				</div>
			</section>
		</div>
	</div>
{:else}
	<div class="loading-container">
		<div class="loading-spinner"></div>
		<span class="loading-text">Loading OpenCV...</span>
	</div>
{/if}

<!-- HIDDEN ELEMENTS -->
<!-- svelte-ignore a11y-missing-attribute -->
<img id="inputImage" src={previewImageData ? previewImageData : ''} />
<canvas bind:this={fileOutputCanvas} id="fileOutputCanvas" />

<!-- END HIDDEN ELEMENTS -->

<style>
	/* Layout */
	.app-container {
		display: flex;
		width: 100%;
		min-height: calc(100vh - 57px);
	}

	.preview-column {
		width: 50%;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
		border-right: 1px solid var(--border-primary);
	}

	.controls-column {
		width: 50%;
		padding: 1.5rem;
		overflow-y: auto;
		background: var(--bg-secondary);
	}

	/* Preview Section */
	.preview-section {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-wrapper {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.preview-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 0.5rem;
	}

	.upload-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1.5rem;
		padding: 2rem;
		border: 2px dashed var(--border-secondary);
		border-radius: 1rem;
		background: var(--bg-secondary);
	}

	.upload-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-primary);
		text-align: center;
	}

	.file-input {
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.file-input::file-selector-button {
		padding: 0.5rem 1rem;
		margin-right: 1rem;
		border: 1px solid var(--border-primary);
		border-radius: 0.375rem;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.file-input::file-selector-button:hover {
		background: var(--bg-hover);
		border-color: var(--border-secondary);
	}

	/* Thumbnails */
	.thumbnails-section {
		height: 100px;
		margin-top: 1rem;
		overflow: auto;
		background: var(--bg-secondary);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}

	.thumbnails-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.thumbnail {
		width: 5rem;
		height: auto;
		border-radius: 0.25rem;
		border: 1px solid var(--border-primary);
	}

	/* Controls Card */
	.controls-card {
		background: var(--bg-card);
		border: 1px solid var(--border-primary);
		border-radius: 0.75rem;
		padding: 1.5rem;
	}

	.controls-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border-primary);
	}

	/* Parameter Groups */
	.params-grid {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.param-group {
		padding-bottom: 1.25rem;
		border-bottom: 1px solid var(--border-primary);
	}

	.param-group:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.param-header {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.expand-btn {
		padding: 0.25rem;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
		transition: color 0.15s;
	}

	.expand-btn:hover {
		color: var(--text-primary);
	}

	.param-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.param-name {
		font-weight: 500;
		color: var(--text-primary);
		width: 12rem;
		flex-shrink: 0;
	}

	.param-value {
		width: 3rem;
		text-align: right;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
	}

	.param-input-wrapper {
		flex: 1;
		display: flex;
		justify-content: flex-end;
	}

	.param-help {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin-left: 1.75rem;
		margin-top: 0.5rem;
		line-height: 1.5;
		padding: 0.75rem;
		background: var(--bg-tertiary);
		border-radius: 0.375rem;
		border-left: 3px solid var(--accent-blue);
	}

	/* Inputs */
	.input-number {
		width: 5rem;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--border-primary);
		border-radius: 0.375rem;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.875rem;
		transition: border-color 0.15s;
	}

	.input-number:focus {
		outline: none;
		border-color: var(--accent-blue);
	}

	.input-range {
		width: 8rem;
		accent-color: var(--accent-blue);
	}

	/* Buttons */
	.btn {
		padding: 0.625rem 1.25rem;
		border-radius: 0.5rem;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s;
		border: none;
	}

	.btn-primary {
		background: var(--accent-blue);
		color: white;
	}

	.btn-primary:hover {
		filter: brightness(1.1);
	}

	.btn-secondary {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-primary);
	}

	.btn-secondary:hover {
		background: var(--bg-hover);
	}

	.download-btn {
		margin-top: 0.75rem;
		width: 100%;
	}

	.actions-row {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.flex-1 {
		flex: 1;
	}

	/* Loading State */
	.loading-container {
		width: 100%;
		min-height: calc(100vh - 57px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: var(--bg-primary);
	}

	.loading-spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid var(--border-primary);
		border-top-color: var(--accent-blue);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-text {
		color: var(--text-secondary);
		font-size: 1rem;
	}

	/* Hidden elements */
	#inputImage,
	#fileOutputCanvas {
		display: none;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.app-container {
			flex-direction: column;
		}

		.preview-column,
		.controls-column {
			width: 100%;
		}

		.preview-column {
			border-right: none;
			border-bottom: 1px solid var(--border-primary);
			min-height: 50vh;
		}

		.param-label {
			flex-wrap: wrap;
		}

		.param-name {
			width: 100%;
		}
	}
</style>
