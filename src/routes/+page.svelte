<script lang="ts">
	// @ts-ignore
	import JSZip from 'jszip';
	import { onMount } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import type {
		ProcessImageParams,
		ProcessingTimings,
		SavedPolaroid,
		UpdatePreview,
		WorkerMessageEvent
	} from '$lib/workerTypes';

	let isReady: boolean = false;
	let input: HTMLInputElement;
	let previewImage: HTMLImageElement;
	let previewImageData: string | undefined;
	let originalImageData: string | undefined;
	let worker: Worker;

	let fileOutputCanvas: HTMLCanvasElement;

	// Data for extracted polaroids
	let extractedPolaroids: ImageBitmap[] = [];
	// PNG encoding is the slowest step, so it's deferred until download and then cached
	let encodedPolaroids: Promise<Blob[]> | undefined;
	let isDownloading = false;
	let timings: ProcessingTimings | undefined;
	let isProcessing = false;
	let isDraggingOver = false;

	// The scan is only revealed once it has been fully decoded, so it never paints in strips
	let previewReady = false;
	// Shape of the placeholder shown until the scan's own size is known (a letter-size flatbed)
	const DEFAULT_PREVIEW_ASPECT = 8.5 / 11;
	let previewAspect = DEFAULT_PREVIEW_ASPECT;
	// What the worker detected in the current scan, drawn over it
	let detection: UpdatePreview | undefined;
	const display = { outlines: true, contours: false };
	const displayOptions: { key: keyof typeof display; label: string }[] = [
		{ key: 'outlines', label: 'Outlines' },
		{ key: 'contours', label: 'Contours' }
	];

	// The controls in the inspector, grouped the way the pipeline uses them
	type NumericParam = {
		[K in keyof ProcessImageParams]-?: ProcessImageParams[K] extends number | undefined ? K : never;
	}[keyof ProcessImageParams];
	type HelpFlag = Exclude<keyof ProcessImageParams, NumericParam>;
	interface ParamControl {
		key: NumericParam;
		helpFlag: HelpFlag;
		label: string;
		help: string;
		control: 'stepper' | 'slider';
		min: number;
		max: number;
		step: number;
		decimals: number;
	}
	const paramGroups: { title: string; controls: ParamControl[] }[] = [
		{
			title: 'Clean up',
			controls: [
				{
					key: 'medianBlurKernel',
					helpFlag: 'showMedianBlurHelp',
					label: 'Blur',
					help: 'Softens the scan first. Turn it up if it’s seeing edges that aren’t there.',
					control: 'stepper',
					min: 3,
					max: 15,
					step: 2,
					decimals: 0
				},
				{
					key: 'thresholdValue',
					helpFlag: 'showThresholdHelp',
					label: 'Threshold',
					help: 'How bright counts as a Polaroid. Darker scan? Bring it down.',
					control: 'slider',
					min: 0,
					max: 255,
					step: 1,
					decimals: 0
				},
				{
					key: 'structuringElementSize',
					helpFlag: 'showStructuringHelp',
					label: 'Edge cleanup',
					help: 'Fills gaps along the edges. Turn it down if neighbours start to merge.',
					control: 'stepper',
					min: 3,
					max: 20,
					step: 1,
					decimals: 0
				}
			]
		},
		{
			title: 'Size & spacing',
			controls: [
				{
					key: 'distanceTransformThreshold',
					helpFlag: 'showDistanceHelp',
					label: 'Separation',
					help: 'How firmly touching Polaroids get split apart.',
					control: 'slider',
					min: 0,
					max: 1,
					step: 0.05,
					decimals: 2
				},
				{
					key: 'surfaceAreaToleranceLow',
					helpFlag: 'showAreaLowHelp',
					label: 'Smallest size',
					help: 'Anything smaller than this gets ignored.',
					control: 'slider',
					min: 0.5,
					max: 1,
					step: 0.05,
					decimals: 2
				},
				{
					key: 'surfaceAreaToleranceHigh',
					helpFlag: 'showAreaHighHelp',
					label: 'Largest size',
					help: 'Anything bigger than this gets ignored.',
					control: 'slider',
					min: 1,
					max: 1.5,
					step: 0.05,
					decimals: 2
				}
			]
		}
	];

	function stepParam(control: ParamControl, direction: 1 | -1) {
		const value = (params[control.key] ?? control.min) + direction * control.step;
		params[control.key] = Math.min(Math.max(value, control.min), control.max);
	}

	// Batch mode: the worker reads a folder of scans and saves the extracted polaroids to disk
	interface BatchScan {
		file: string;
		/** Undefined until the scan has been processed */
		saved?: SavedPolaroid[];
		error?: string;
	}
	interface Batch {
		/** Nothing is read or written until the user has confirmed where the results go */
		state: 'confirm' | 'running' | 'finished';
		folder: FileSystemDirectoryHandle;
		handles: FileSystemFileHandle[];
		scans: BatchScan[];
		/** Where to save, if not the default subfolder of `folder` */
		customOutput?: FileSystemDirectoryHandle;
		/** Why the batch couldn't start */
		problem?: string;
		cancelled: boolean;
		totalMs: number;
	}
	let batch: Batch | undefined;

	/** Subfolder of the scans folder that polaroids are saved to by default */
	const BATCH_OUTPUT_FOLDER = 'extracted';
	/** Files treated as scans: the image formats browsers can decode */
	const BATCH_IMAGE_PATTERN = /\.(png|jpe?g|webp|avif|bmp|gif)$/i;

	// The File System Access API is what lets the worker read and write a folder directly
	const supportsBatch = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
	$: batchOutputLabel = batch
		? batch.customOutput
			? batch.customOutput.name
			: `${batch.folder.name}/${BATCH_OUTPUT_FOLDER}`
		: '';
	$: batchDone = batch ? batch.scans.filter((scan) => scan.saved !== undefined).length : 0;
	$: batchProblems = batch
		? batch.scans.filter((scan) => scan.error || scan.saved?.length === 0).length
		: 0;
	$: batchPolaroids = batch ? batch.scans.reduce((sum, scan) => sum + (scan.saved?.length ?? 0), 0) : 0;

	/** Longest edge of the thumbnail canvases, in pixels */
	const THUMBNAIL_SIZE = 320;

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
					setExtractedPolaroids(event.data.extracted);
					isProcessing = false;
					break;
				case 'UPDATE PREVIEW':
					setDetection(event.data);
					break;
				case 'TIMINGS':
					if (!batch) timings = event.data;
					break;
				case 'BATCH PROGRESS':
					if (batch) {
						const { index, saved, error } = event.data;
						batch.scans[index] = { ...batch.scans[index], saved, error };
					}
					break;
				case 'BATCH FINISHED':
					if (batch) {
						batch.state = 'finished';
						batch.cancelled = event.data.cancelled;
						batch.totalMs = event.data.totalMs;
					}
					break;
			}
		};
	});

	function setPreview(url: string | undefined) {
		previewImageData = url;
		previewReady = false;
		previewAspect = DEFAULT_PREVIEW_ASPECT;
	}

	function setDetection(next: UpdatePreview | undefined) {
		detection?.contours.close();
		detection = next;
	}

	async function onPreviewLoad(event: Event) {
		const image = event.currentTarget as HTMLImageElement;
		const url = image.src;
		previewAspect = image.naturalWidth / image.naturalHeight;
		try {
			// `load` only means the file has arrived; wait for the pixels too
			await image.decode();
		} catch {
			// Shown as-is if the browser won't decode it ahead of time
		}
		if (image.src === url) previewReady = true;
	}

	function setExtractedPolaroids(polaroids: ImageBitmap[]) {
		extractedPolaroids.forEach((polaroid) => polaroid.close());
		extractedPolaroids = polaroids;
		encodedPolaroids = undefined;
	}

	function onChange() {
		const file = input?.files?.[0];
		if (file) loadFile(file);
	}

	function onDrop(event: DragEvent) {
		isDraggingOver = false;
		const file = Array.from(event.dataTransfer?.files ?? []).find((file) =>
			file.type.startsWith('image/')
		);
		// A new scan can be dropped at any time, except in the middle of a batch
		if (file && batch?.state !== 'running') {
			resetState();
			loadFile(file);
		}
	}

	async function loadFile(file: File) {
		originalImageData = URL.createObjectURL(file);
		setPreview(originalImageData);

		try {
			// Decoded off the main thread and handed to the worker without copying; the pixels
			// go straight to the GPU from there
			isProcessing = true;
			const image = await createImageBitmap(file);
			worker.postMessage({ type: 'PROCESS IMAGE', image, params }, [image]);
		} catch (error) {
			isProcessing = false;
			console.error('Error processing image:', error);
			// You might want to show a user-friendly error message here
		}
	}

	async function chooseBatchFolder() {
		let folder: FileSystemDirectoryHandle;
		try {
			folder = await window.showDirectoryPicker({ mode: 'read' });
		} catch {
			// The picker was dismissed
			return;
		}

		const handles: FileSystemFileHandle[] = [];
		for await (const entry of folder.values()) {
			if (entry.kind === 'file' && BATCH_IMAGE_PATTERN.test(entry.name)) {
				handles.push(entry as FileSystemFileHandle);
			}
		}
		handles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

		closeBatch();
		batch = {
			state: 'confirm',
			folder,
			handles,
			scans: handles.map((handle) => ({ file: handle.name })),
			cancelled: false,
			totalMs: 0
		};
	}

	async function chooseBatchOutput() {
		if (!batch) return;
		let output: FileSystemDirectoryHandle;
		try {
			output = await window.showDirectoryPicker({ mode: 'readwrite' });
		} catch {
			return;
		}
		if (await output.isSameEntry(batch.folder)) {
			// The saved polaroids would be picked up as scans the next time the folder is processed
			batch.customOutput = undefined;
			batch.problem = 'Pick somewhere other than the scans folder.';
			return;
		}
		batch.customOutput = output;
		batch.problem = undefined;
	}

	async function startBatch() {
		if (!batch) return;
		let output = batch.customOutput;
		if (!output) {
			// Saving inside the scans folder needs write access to it, which is only asked for now
			if ((await batch.folder.requestPermission({ mode: 'readwrite' })) !== 'granted') {
				batch.problem = 'We need permission to save there. Allow it, or pick another folder.';
				return;
			}
			output = await batch.folder.getDirectoryHandle(BATCH_OUTPUT_FOLDER, { create: true });
		}
		batch.problem = undefined;
		batch.state = 'running';
		worker.postMessage({ type: 'PROCESS FOLDER', scans: batch.handles, output, params });
	}

	function closeBatch() {
		batch?.scans.forEach((scan) => scan.saved?.forEach((polaroid) => polaroid.thumbnail.close()));
		batch = undefined;
	}

	function cancelBatch() {
		worker.postMessage({ type: 'CANCEL BATCH' });
	}

	function reprocessImage() {
		// The worker still holds the image, so only the parameters need to be sent
		isProcessing = true;
		worker.postMessage({ type: 'PROCESS IMAGE', params });
	}

	/** Svelte action: draw an overlay onto a canvas at its own resolution */
	function overlay(canvas: HTMLCanvasElement, image: ImageBitmap) {
		function draw(image: ImageBitmap) {
			canvas.width = image.width;
			canvas.height = image.height;
			canvas.getContext('2d')?.drawImage(image, 0, 0);
		}
		draw(image);
		return { update: draw };
	}

	/** Svelte action: draw a downsized copy of an extracted polaroid onto a canvas */
	function thumbnail(canvas: HTMLCanvasElement, polaroid: ImageBitmap) {
		function draw(polaroid: ImageBitmap) {
			const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(polaroid.width, polaroid.height));
			canvas.width = Math.round(polaroid.width * scale);
			canvas.height = Math.round(polaroid.height * scale);
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(polaroid, 0, 0, canvas.width, canvas.height);
			}
		}
		draw(polaroid);
		return { update: draw };
	}

	function encodePolaroid(polaroid: ImageBitmap): Promise<Blob> {
		const canvas = new OffscreenCanvas(polaroid.width, polaroid.height);
		canvas.getContext('2d')?.drawImage(polaroid, 0, 0);
		return canvas.convertToBlob({ type: 'image/png' });
	}

	async function downloadImages() {
		isDownloading = true;
		try {
			encodedPolaroids ??= Promise.all(extractedPolaroids.map(encodePolaroid));
			const blobs = await encodedPolaroids;

			// ZIP the images and download
			const zip = new JSZip();
			const folder = zip.folder('polaroids');
			for (let i = 0; i < blobs.length; i++) {
				// Create file safe date time string
				const date = new Date();
				const dateString = date.toISOString().replace(/:/g, '-').replace(/\./g, '-');

				folder?.file(`polaroid-${i}-${dateString}.png`, blobs[i], { binary: true });
			}

			// Download the zip by clicking a link
			const content: Blob = await zip.generateAsync({ type: 'blob' });
			const link = document.createElement('a');
			link.href = URL.createObjectURL(content);
			link.download = 'polaroids.zip';
			link.click();
		} finally {
			isDownloading = false;
		}
	}

	function resetState() {
		setPreview(undefined);
		if (originalImageData) URL.revokeObjectURL(originalImageData);
		originalImageData = undefined;
		setExtractedPolaroids([]);
		setDetection(undefined);
		timings = undefined;
		isProcessing = false;
		closeBatch();
		worker.postMessage({ type: 'RELEASE IMAGE' });
		// Note: previewImage will be automatically updated when previewImageData changes
	}
</script>

<svelte:window
	on:dragover|preventDefault={() => (isDraggingOver = true)}
	on:dragleave={(event) => {
		if (!event.relatedTarget) isDraggingOver = false;
	}}
	on:drop|preventDefault={onDrop}
/>

{#if isReady}
	<div class="app-container" in:fade={{ duration: 300 }}>
		<!-- Stage: the scan, its results, or a batch -->
		<div class="stage" class:stage-dragging={isDraggingOver}>
			{#if batch}
				<section class="batch-view">
					{#if batch.state === 'confirm'}
						<div class="batch-card" in:scale={{ start: 0.96, duration: 350 }}>
							<div class="batch-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.4c.7 0 1.4.3 1.8.8l1 1.2h6.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
									/>
								</svg>
							</div>
							<h1 class="batch-title">The whole folder, then.</h1>
							<dl class="batch-summary">
								<div class="batch-summary-row">
									<dt>Scans</dt>
									<dd>
										<code>{batch.folder.name}</code>
										<span class="batch-muted">
											{batch.scans.length}
											{batch.scans.length === 1 ? 'image' : 'images'}
										</span>
									</dd>
								</div>
								<div class="batch-summary-row">
									<dt>Save to</dt>
									<dd>
										<code>{batchOutputLabel}</code>
										<button on:click={chooseBatchOutput} class="batch-link">Change…</button>
									</dd>
								</div>
							</dl>
							<p class="batch-hint">
								{#if batch.scans.length === 0}
									No scans in here.
								{:else}
									Each Polaroid is saved as a PNG, named after its scan. Same name already there? It
									gets replaced.
								{/if}
							</p>
							{#if batch.problem}
								<p class="batch-problem" transition:fade={{ duration: 150 }}>{batch.problem}</p>
							{/if}
							<div class="batch-actions">
								<button
									on:click={startBatch}
									disabled={batch.scans.length === 0}
									class="btn btn-primary btn-large flex-1"
								>
									{batch.scans.length === 1 ? 'Process It' : `Process All ${batch.scans.length}`}
								</button>
								<button on:click={chooseBatchFolder} class="btn btn-secondary btn-large">
									Pick Another
								</button>
								<button on:click={closeBatch} class="btn btn-secondary btn-large">Cancel</button>
							</div>
						</div>
					{:else}
						<div class="batch-banner" class:batch-banner-done={batch.state === 'finished'}>
							{#if batch.state === 'running'}
								<div class="batch-banner-row">
									<h1 class="batch-title">
										Working on {Math.min(batchDone + 1, batch.scans.length)} of {batch.scans.length}
									</h1>
									<button on:click={cancelBatch} class="btn btn-secondary">Stop</button>
								</div>
								<div
									class="progress-track"
									role="progressbar"
									aria-valuenow={batchDone}
									aria-valuemax={batch.scans.length}
								>
									<div
										class="progress-fill"
										style="width: {(batchDone / Math.max(batch.scans.length, 1)) * 100}%"
									/>
								</div>
								<p class="batch-hint">
									{batchPolaroids} saved to <code>{batchOutputLabel}</code>
								</p>
							{:else}
								<div class="batch-banner-row">
									<h1 class="batch-title">
										<svg class="batch-check" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
											<path
												d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.4 6a1 1 0 0 1-1.45.04l-2.6-2.6a1 1 0 1 1 1.42-1.42l1.85 1.86 4.7-5.22a1 1 0 1 1 1.48 1.34Z"
											/>
										</svg>
										{batchPolaroids}
										{batchPolaroids === 1 ? 'Polaroid' : 'Polaroids'}, saved.
									</h1>
								</div>
								<p class="batch-saved-to">
									They’re in <code>{batchOutputLabel}</code> on your computer.
								</p>
								<p class="batch-hint">
									{batch.cancelled ? `Stopped after ${batchDone} of ${batch.scans.length} scans` : `${batchDone} ${batchDone === 1 ? 'scan' : 'scans'}`}
									&middot; {(batch.totalMs / 1000).toFixed(1)} s
									{#if batchProblems > 0}
										<span class="batch-warning">
											&middot; {batchProblems} {batchProblems === 1 ? 'needs' : 'need'} a look
										</span>
									{/if}
								</p>
								<div class="batch-actions">
									<button on:click={chooseBatchFolder} class="btn btn-primary">
										Do Another Folder
									</button>
									<button on:click={closeBatch} class="btn btn-secondary">Done</button>
								</div>
							{/if}
						</div>

						<div class="batch-gallery">
							{#each batch.scans as scan}
								<div class="batch-scan" class:batch-pending={scan.saved === undefined}>
									<div class="batch-scan-header">
										<span class="batch-file">{scan.file}</span>
										{#if scan.error}
											<span class="batch-warning" title={scan.error}>Couldn’t open this one</span>
										{:else if scan.saved?.length === 0}
											<span class="batch-warning">None found</span>
										{:else if scan.saved}
											<span class="batch-muted">{scan.saved.length}</span>
										{/if}
									</div>
									{#if scan.saved?.length}
										<div class="thumbnails-grid">
											{#each scan.saved as polaroid, i}
												<canvas
													class="thumbnail"
													use:thumbnail={polaroid.thumbnail}
													title={polaroid.name}
													aria-label={polaroid.name}
													in:fly={{ y: 12, duration: 400, delay: i * 50 }}
												/>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{:else if previewImageData}
				<section class="preview-section">
					<div class="preview-wrapper">
						<div
							class="preview-frame"
							class:preview-frame-ready={previewReady}
							style="--preview-aspect: {previewAspect}"
							in:scale={{ start: 0.97, duration: 400 }}
						>
							<img
								bind:this={previewImage}
								id="preview"
								src={previewImageData}
								alt="Uploaded scan"
								class="preview-image"
								decoding="async"
								on:load={onPreviewLoad}
							/>
							{#if detection && previewReady}
								{#if display.contours}
									<canvas
										class="preview-overlay contour-overlay"
										use:overlay={detection.contours}
										transition:fade={{ duration: 250 }}
										aria-hidden="true"
									/>
								{/if}
								{#if display.outlines}
									<svg
										class="preview-overlay outline-overlay"
										viewBox="0 0 {detection.width} {detection.height}"
										preserveAspectRatio="none"
										transition:fade={{ duration: 250 }}
										aria-hidden="true"
									>
										{#each detection.outlines as outline, i}
											<polygon
												points={outline.corners.map(({ x, y }) => `${x},${y}`).join(' ')}
												class:outline-unrefined={!outline.refined}
												style="animation-delay: {i * 60}ms"
											/>
										{/each}
									</svg>
								{/if}
							{/if}
							{#if isProcessing}
								<div class="processing-pill" transition:fade={{ duration: 200 }}>
									<span class="spinner" />
									Looking for Polaroids…
								</div>
							{/if}
						</div>
					</div>
				</section>

				<!-- Results tray -->
				{#if extractedPolaroids.length > 0}
					<section class="tray" in:fly={{ y: 24, duration: 450 }}>
						<div class="tray-header">
							<h2 class="tray-title">
								{extractedPolaroids.length}
								{extractedPolaroids.length === 1 ? 'Polaroid' : 'Polaroids'}
							</h2>
							<button
								on:click={downloadImages}
								disabled={isDownloading}
								class="btn btn-primary download-btn"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
								</svg>
								{isDownloading ? 'Getting Them Ready…' : 'Download'}
							</button>
						</div>
						<div class="thumbnails-section">
							<div class="thumbnails-grid">
								{#each extractedPolaroids as polaroid, i (polaroid)}
									<canvas
										class="thumbnail"
										use:thumbnail={polaroid}
										aria-label="Polaroid {i + 1}"
										in:fly={{ y: 16, duration: 450, delay: i * 60 }}
									/>
								{/each}
							</div>
						</div>
					</section>
				{:else if timings && !isProcessing}
					<section class="tray tray-empty" in:fade={{ duration: 250 }}>
						<h2 class="tray-title">Couldn’t find any.</h2>
						<p class="batch-hint">
							Nudge Threshold or the size limits, then go again.
						</p>
					</section>
				{/if}
			{:else}
				<section class="preview-section">
					<div class="upload-prompt" class:upload-prompt-dragging={isDraggingOver}>
						<div class="polaroid-stack" aria-hidden="true">
							<div class="mini-polaroid mini-polaroid-left"><span /></div>
							<div class="mini-polaroid mini-polaroid-right"><span /></div>
							<div class="mini-polaroid mini-polaroid-front"><span /></div>
						</div>
						<div class="upload-text">
							<h1 class="upload-title">
								{isDraggingOver ? 'Drop it' : 'Drop a scan here'}
							</h1>
							<p class="upload-subtitle">
								All image processing happens locally on your computer.
							</p>
						</div>
						<div class="upload-actions">
							<label class="btn btn-primary btn-large file-button">
								Choose File
								<input
									bind:this={input}
									on:change={onChange}
									type="file"
									accept="image/*"
									class="file-input"
								/>
							</label>
							<button
								on:click={chooseBatchFolder}
								disabled={!supportsBatch}
								class="btn btn-secondary btn-large"
							>
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path
										d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.4c.7 0 1.4.3 1.8.8l1 1.2h6.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
									/>
								</svg>
								Choose Folder
							</button>
						</div>
						{#if !supportsBatch}
							<p class="batch-hint upload-hint">Folders need Chrome or Edge.</p>
						{/if}
					</div>
				</section>
			{/if}
		</div>

		<!-- Inspector -->
		<aside class="inspector">
			<div class="inspector-header">
				<h2 class="controls-title">Fine-tune</h2>
				<p class="controls-subtitle">Missing one? Two stuck together? Adjust and go again.</p>
			</div>

			{#each paramGroups as group}
				<section class="param-section">
					<h3 class="param-section-title">{group.title}</h3>
					<div class="controls-card">
						{#each group.controls as control}
							<div class="param-group">
								<div class="param-header">
									<span class="param-name">{control.label}</span>
									<button
										class="expand-btn"
										class:expand-btn-active={params[control.helpFlag]}
										on:click={() => (params[control.helpFlag] = !params[control.helpFlag])}
										aria-label="About {control.label}"
										aria-expanded={!!params[control.helpFlag]}
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
											<circle cx="12" cy="12" r="9.25" />
											<path d="M12 11v5.5" />
											<circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
										</svg>
									</button>
									<span class="param-value">
										{(params[control.key] ?? 0).toFixed(control.decimals)}
									</span>
									{#if control.control === 'stepper'}
										<div class="stepper">
											<button
												on:click={() => stepParam(control, -1)}
												disabled={(params[control.key] ?? 0) <= control.min}
												aria-label="Decrease {control.label}"
											>
												−
											</button>
											<button
												on:click={() => stepParam(control, 1)}
												disabled={(params[control.key] ?? 0) >= control.max}
												aria-label="Increase {control.label}"
											>
												+
											</button>
										</div>
									{/if}
								</div>
								{#if control.control === 'slider'}
									<input
										type="range"
										bind:value={params[control.key]}
										min={control.min}
										max={control.max}
										step={control.step}
										class="input-range"
										aria-label={control.label}
										style="--fill: {(((params[control.key] ?? control.min) - control.min) /
											(control.max - control.min)) *
											100}%"
									/>
								{/if}
								{#if params[control.helpFlag]}
									<p class="param-help" transition:fade={{ duration: 150 }}>{control.help}</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}

			<section class="param-section">
				<h3 class="param-section-title">Display</h3>
				<div class="controls-card">
					{#each displayOptions as option}
						<label class="param-group switch-row">
							<span class="param-name">{option.label}</span>
							<input
								type="checkbox"
								role="switch"
								class="switch"
								bind:checked={display[option.key]}
							/>
						</label>
					{/each}
				</div>
			</section>

			<div class="inspector-footer">
			<div class="actions-row">
				<button
					on:click={reprocessImage}
					disabled={!originalImageData || isProcessing}
					class="btn btn-primary btn-large flex-1"
				>
					Process
				</button>
				<button
					on:click={resetState}
					disabled={batch?.state === 'running'}
					class="btn btn-secondary btn-large"
				>
					Reset
				</button>
			</div>
			{#if timings}
				<p class="timings" in:fade={{ duration: 200 }}>
					<span class="timings-dot" class:timings-dot-fallback={timings.backend !== 'webgpu'} />
					{Math.round(timings.totalMs)} ms &middot; {timings.backend === 'webgpu' ? 'WebGPU' : 'OpenCV'}
				</p>
			{/if}
			</div>
		</aside>
	</div>
{:else}
	<div class="loading-container">
		<span class="spinner spinner-large" />
		<span class="loading-text">Warming up…</span>
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
		height: calc(100vh - var(--nav-height));
	}

	.stage {
		flex: 1;
		min-width: 0;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.inspector {
		width: 25rem;
		flex-shrink: 0;
		padding: 1.5rem 1.25rem 0;
		overflow-y: auto;
		background: var(--bg-secondary);
		border-left: 1px solid var(--border-primary);
	}

	:global([data-theme='dark']) .inspector {
		background: #0d0d0f;
	}

	/* Preview */
	.preview-section {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-wrapper {
		container-type: size;
		/* Stretched by the section rather than sized in percentages, which don't resolve when
		   the stage's height comes from its content (the stacked layout) */
		flex: 1;
		align-self: stretch;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* The largest box of the scan's shape that fits the stage, so overlays line up with it */
	.preview-frame {
		position: relative;
		flex-shrink: 0;
		width: min(100cqw, 100cqh * var(--preview-aspect));
		aspect-ratio: var(--preview-aspect);
		overflow: hidden;
		border-radius: 1rem;
		background: var(--fill);
		box-shadow: var(--shadow-card);
		transition:
			box-shadow 0.9s var(--ease-out),
			width 0.4s var(--ease-out);
	}

	.preview-frame-ready {
		box-shadow: var(--shadow-raised);
	}

	/* Placeholder shimmer while the scan decodes */
	.preview-frame::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(100deg, transparent 30%, var(--fill-strong) 50%, transparent 70%);
		background-size: 250% 100%;
		animation: preview-shimmer 1.6s linear infinite;
		transition: opacity 0.5s;
	}

	.preview-frame-ready::before {
		opacity: 0;
		animation-play-state: paused;
	}

	@keyframes preview-shimmer {
		from {
			background-position: 120% 0;
		}
		to {
			background-position: -80% 0;
		}
	}

	.preview-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		transform: scale(1.03);
		filter: blur(16px);
		transition:
			opacity 0.7s var(--ease-out),
			transform 0.9s var(--ease-out),
			filter 0.9s var(--ease-out);
	}

	.preview-frame-ready .preview-image {
		opacity: 1;
		transform: none;
		filter: none;
	}

	.preview-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.outline-overlay polygon {
		fill: none;
		stroke: var(--accent-green);
		stroke-width: 1.5px;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.45));
		animation: outline-in 0.5s var(--ease-out) backwards;
	}

	.outline-overlay polygon.outline-unrefined {
		stroke: var(--accent-orange);
		stroke-dasharray: 6 4;
	}

	@keyframes outline-in {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.preview-image {
			transform: none;
			filter: none;
			transition: opacity 0.3s;
		}

		.preview-frame::before {
			animation: none;
		}
	}

	.processing-pill {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 1.125rem;
		border-radius: 980px;
		font-size: 0.875rem;
		font-weight: 500;
		color: #ffffff;
		white-space: nowrap;
		background: rgba(30, 30, 32, 0.72);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		backdrop-filter: saturate(180%) blur(20px);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
	}

	/* Drop zone */
	.upload-prompt {
		width: 100%;
		max-width: 44rem;
		height: 100%;
		max-height: 38rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		padding: 2.5rem;
		border-radius: 2rem;
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
		outline: 2px dashed transparent;
		outline-offset: -10px;
		transition:
			outline-color 0.25s,
			transform 0.4s var(--ease-out),
			box-shadow 0.4s;
	}

	.upload-prompt-dragging {
		outline-color: var(--accent-blue);
		transform: scale(1.015);
		box-shadow: var(--shadow-raised);
	}

	.polaroid-stack {
		position: relative;
		width: 9rem;
		height: 8.5rem;
		margin-bottom: 0.25rem;
	}

	.mini-polaroid {
		position: absolute;
		left: 50%;
		top: 0.5rem;
		width: 5.5rem;
		height: 6.7rem;
		margin-left: -2.75rem;
		padding: 0.4rem 0.4rem 0;
		border-radius: 0.3rem;
		background: linear-gradient(#ffffff, #f4f3ee);
		box-shadow:
			0 0 0 0.5px rgba(0, 0, 0, 0.1),
			0 2px 4px rgba(0, 0, 0, 0.1),
			0 12px 28px rgba(0, 0, 0, 0.18);
		transition: transform 0.6s var(--ease-out);
	}

	.mini-polaroid span {
		display: block;
		height: 4.7rem;
		border-radius: 0.12rem;
		box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
	}

	.mini-polaroid-left {
		transform: translateX(-2.4rem) rotate(-11deg);
	}

	.mini-polaroid-left span {
		background: linear-gradient(160deg, #64d2ff, #0a84ff 60%, #5e5ce6);
	}

	.mini-polaroid-right {
		transform: translateX(2.4rem) rotate(10deg);
	}

	.mini-polaroid-right span {
		background: linear-gradient(200deg, #ffd60a, #ff9f0a 50%, #ff375f);
	}

	.mini-polaroid-front {
		transform: translateY(0.35rem) rotate(-2deg);
	}

	.mini-polaroid-front span {
		background:
			radial-gradient(circle at 70% 28%, #fff4c2 0 9%, transparent 10%),
			linear-gradient(180deg, #ff9a8b 0%, #ff6a88 45%, #2d1b69 46%, #1a1147 100%);
	}

	.upload-prompt:hover .mini-polaroid-left,
	.upload-prompt-dragging .mini-polaroid-left {
		transform: translateX(-3.6rem) translateY(-0.2rem) rotate(-17deg);
	}

	.upload-prompt:hover .mini-polaroid-right,
	.upload-prompt-dragging .mini-polaroid-right {
		transform: translateX(3.6rem) translateY(-0.2rem) rotate(16deg);
	}

	.upload-prompt:hover .mini-polaroid-front,
	.upload-prompt-dragging .mini-polaroid-front {
		transform: translateY(-0.2rem) rotate(0deg) scale(1.04);
	}

	.upload-text {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
	}

	.upload-title {
		font-size: 1.875rem;
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--text-primary);
		text-align: center;
	}

	.upload-subtitle {
		max-width: 30rem;
		font-size: 1.0625rem;
		line-height: 1.45;
		letter-spacing: -0.01em;
		color: var(--text-secondary);
		text-align: center;
	}

	.upload-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
	}

	.upload-hint {
		max-width: 26rem;
		text-align: center;
	}

	/* The native input stays in the DOM (and focusable) underneath its label */
	.file-button {
		position: relative;
		overflow: hidden;
	}

	.file-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.file-button:focus-within {
		outline: 3px solid color-mix(in srgb, var(--accent-blue) 50%, transparent);
		outline-offset: 2px;
	}

	/* Results tray */
	.tray {
		flex-shrink: 0;
		padding: 1rem 1.25rem 1.25rem;
		border-radius: 1.5rem;
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
	}

	.tray-empty {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.tray-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.875rem;
	}

	.tray-title {
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--text-primary);
	}

	.thumbnails-section {
		overflow-x: auto;
		margin: 0 -1.25rem -0.5rem;
		padding: 0.5rem 1.25rem 1rem;
	}

	.thumbnails-grid {
		display: flex;
		gap: 1rem;
	}

	.batch-gallery .thumbnails-grid {
		flex-wrap: wrap;
	}

	/* Each result looks like the print it came from */
	.thumbnail {
		width: 5.75rem;
		height: auto;
		flex-shrink: 0;
		border-radius: 0.2rem;
		box-shadow:
			0 0 0 0.5px rgba(0, 0, 0, 0.14),
			0 1px 3px rgba(0, 0, 0, 0.12),
			0 8px 20px rgba(0, 0, 0, 0.16);
		transition:
			transform 0.4s var(--ease-out),
			box-shadow 0.4s;
	}

	.thumbnail:hover {
		transform: translateY(-4px) scale(1.04) rotate(-1deg);
		box-shadow:
			0 0 0 0.5px rgba(0, 0, 0, 0.14),
			0 4px 8px rgba(0, 0, 0, 0.12),
			0 18px 36px rgba(0, 0, 0, 0.24);
	}

	/* Inspector */
	.inspector-header {
		padding: 0 0.5rem;
		margin-bottom: 1.25rem;
	}

	.controls-title {
		font-size: 1.375rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text-primary);
	}

	.controls-subtitle {
		margin-top: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.param-section {
		margin-bottom: 1.5rem;
	}

	.param-section-title {
		padding: 0 1rem;
		margin-bottom: 0.4rem;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	/* Grouped inset list */
	.controls-card {
		border-radius: 0.875rem;
		background: var(--bg-primary);
	}

	:global([data-theme='dark']) .controls-card {
		background: var(--bg-card);
	}

	.param-group {
		position: relative;
		padding: 0.75rem 1rem;
	}

	.param-group + .param-group::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1rem;
		right: 0;
		height: 1px;
		background: var(--border-primary);
	}

	.param-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 1.875rem;
	}

	.param-name {
		font-size: 0.9375rem;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}

	.expand-btn {
		width: 1.375rem;
		height: 1.375rem;
		flex-shrink: 0;
		border-radius: 50%;
		color: var(--text-muted);
		cursor: pointer;
		transition: color 0.2s;
	}

	.expand-btn:hover,
	.expand-btn-active {
		color: var(--accent-blue);
	}

	.expand-btn svg {
		width: 100%;
		height: 100%;
	}

	.param-value {
		margin-left: auto;
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}

	.param-help {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	/* Switch */
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 1.875rem;
		box-sizing: content-box;
		cursor: pointer;
	}

	.switch {
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		flex-shrink: 0;
		width: 2.625rem;
		height: 1.625rem;
		border-radius: 980px;
		background: var(--fill-strong);
		cursor: pointer;
		transition: background 0.25s var(--ease-out);
	}

	.switch::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.625rem - 4px);
		height: calc(1.625rem - 4px);
		border-radius: 50%;
		background: var(--knob);
		box-shadow: var(--shadow-knob);
		transition: transform 0.25s var(--ease-out);
	}

	.switch:checked {
		background: var(--accent-green);
	}

	.switch:checked::after {
		transform: translateX(1rem);
	}

	/* Stepper */
	.stepper {
		display: flex;
		margin-left: 0.5rem;
		border-radius: 0.5rem;
		background: var(--fill);
	}

	.stepper button {
		position: relative;
		width: 2.375rem;
		height: 1.875rem;
		font-size: 1.125rem;
		line-height: 1;
		color: var(--text-primary);
		cursor: pointer;
		border-radius: 0.5rem;
		transition: background-color 0.15s;
	}

	.stepper button + button::before {
		content: '';
		position: absolute;
		left: 0;
		top: 25%;
		height: 50%;
		width: 1px;
		background: var(--border-secondary);
	}

	.stepper button:active:not(:disabled) {
		background: var(--fill-strong);
	}

	.stepper button:disabled {
		color: var(--text-muted);
		opacity: 0.5;
		cursor: default;
	}

	/* Slider */
	.input-range {
		-webkit-appearance: none;
		appearance: none;
		display: block;
		width: 100%;
		height: 1.75rem;
		margin-top: 0.25rem;
		background: transparent;
		cursor: pointer;
	}

	.input-range::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(
			to right,
			var(--accent-blue) var(--fill),
			var(--fill-strong) var(--fill)
		);
	}

	.input-range::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(
			to right,
			var(--accent-blue) var(--fill),
			var(--fill-strong) var(--fill)
		);
	}

	.input-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 1.5rem;
		height: 1.5rem;
		margin-top: calc(2px - 0.75rem);
		border-radius: 50%;
		background: var(--knob);
		box-shadow: var(--shadow-knob);
		transition: transform 0.2s var(--ease-out);
	}

	.input-range::-moz-range-thumb {
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 50%;
		background: var(--knob);
		box-shadow: var(--shadow-knob);
	}

	.input-range:active::-webkit-slider-thumb {
		transform: scale(1.12);
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1.125rem;
		border-radius: 980px;
		font-size: 0.875rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 0.2s,
			transform 0.2s var(--ease-out),
			opacity 0.2s;
	}

	.btn svg {
		width: 1.05em;
		height: 1.05em;
		flex-shrink: 0;
	}

	.btn-large {
		padding: 0.6875rem 1.375rem;
		font-size: 0.9375rem;
	}

	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--accent-blue);
		color: #ffffff;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-blue-hover);
	}

	.btn-secondary {
		background: var(--fill);
		color: var(--text-primary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--fill-strong);
	}

	/* Stays in reach however far the settings above it scroll */
	.inspector-footer {
		position: sticky;
		bottom: 0;
		margin: 0 -1.25rem;
		padding: 0.875rem 1.25rem 1.25rem;
		background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		backdrop-filter: saturate(180%) blur(20px);
		border-top: 1px solid var(--border-primary);
	}

	:global([data-theme='dark']) .inspector-footer {
		background: rgba(13, 13, 15, 0.78);
	}

	.actions-row {
		display: flex;
		gap: 0.625rem;
	}

	.flex-1 {
		flex: 1;
	}

	.timings {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.875rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.timings-dot {
		width: 0.4375rem;
		height: 0.4375rem;
		border-radius: 50%;
		background: var(--accent-green);
	}

	.timings-dot-fallback {
		background: var(--accent-orange);
	}

	/* Batch mode */
	.batch-hint {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.55;
	}

	.batch-hint code,
	.batch-saved-to code,
	.batch-summary code {
		padding: 0.1em 0.4em;
		border-radius: 0.3rem;
		font-size: 0.92em;
		background: var(--fill);
		color: var(--text-primary);
	}

	.batch-muted {
		color: var(--text-muted);
	}

	.batch-view {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.batch-card,
	.batch-banner {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 1.5rem;
		border-radius: 1.5rem;
		background: var(--bg-card);
		box-shadow: var(--shadow-card);
	}

	.batch-card {
		margin: auto;
		width: 100%;
		max-width: 33rem;
		padding: 2rem;
		box-shadow: var(--shadow-raised);
	}

	.batch-icon {
		width: 3.25rem;
		height: 3.25rem;
		padding: 0.75rem;
		border-radius: 0.875rem;
		color: #ffffff;
		background: linear-gradient(180deg, #4aa8ff, var(--accent-blue));
	}

	.batch-banner-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.batch-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text-primary);
	}

	.batch-check {
		width: 1.75rem;
		height: 1.75rem;
		color: var(--accent-green);
	}

	.batch-summary {
		border-radius: 0.875rem;
		background: var(--bg-primary);
		font-size: 0.9375rem;
	}

	:global([data-theme='dark']) .batch-summary {
		background: var(--bg-tertiary);
	}

	.batch-summary-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
	}

	.batch-summary-row + .batch-summary-row {
		border-top: 1px solid var(--border-primary);
	}

	.batch-summary dt {
		color: var(--text-primary);
	}

	.batch-summary dd {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: flex-end;
		gap: 0.5rem;
		color: var(--text-secondary);
	}

	.batch-link {
		font-size: 0.875rem;
		color: var(--accent-blue);
		cursor: pointer;
	}

	.batch-link:hover {
		text-decoration: underline;
	}

	.batch-saved-to {
		font-size: 1rem;
		color: var(--text-primary);
		line-height: 1.5;
	}

	.batch-problem {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--accent-orange);
	}

	.batch-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin-top: 0.25rem;
	}

	.progress-track {
		height: 6px;
		border-radius: 3px;
		overflow: hidden;
		background: var(--fill-strong);
	}

	.progress-fill {
		height: 100%;
		border-radius: 3px;
		background: var(--accent-blue);
		transition: width 0.5s var(--ease-out);
	}

	.batch-gallery {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 0 0.5rem 1rem;
	}

	.batch-scan {
		transition: opacity 0.4s;
	}

	.batch-scan-header {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.batch-scan-header .batch-muted,
	.batch-scan-header .batch-warning {
		font-weight: 400;
	}

	.batch-pending {
		opacity: 0.4;
	}

	.batch-file {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.batch-warning {
		color: var(--accent-orange);
		font-weight: 500;
	}

	/* Loading */
	.loading-container {
		height: calc(100vh - var(--nav-height));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.loading-text {
		font-size: 0.9375rem;
		color: var(--text-muted);
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		animation: spin 0.8s linear infinite;
	}

	.spinner-large {
		width: 1.75rem;
		height: 1.75rem;
		border-width: 2.5px;
		border-color: var(--fill-strong);
		border-top-color: var(--text-secondary);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Hidden elements */
	#inputImage,
	#fileOutputCanvas {
		display: none;
	}

	/* Responsive */
	@media (max-width: 900px) {
		.app-container {
			flex-direction: column;
			height: auto;
		}

		.stage {
			min-height: 70vh;
		}

		.inspector {
			width: 100%;
			border-left: none;
			border-top: 1px solid var(--border-primary);
		}

		.inspector-footer {
			position: static;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mini-polaroid,
		.thumbnail,
		.btn,
		.upload-prompt {
			transition: none;
		}
	}
</style>
