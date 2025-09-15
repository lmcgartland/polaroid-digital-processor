<script lang="ts">
	// @ts-ignore
	import JSZip from 'jszip';
	import { onMount } from 'svelte';
	import type { ProcessImageParams, WorkerMessageEvent } from '$lib/workerTypes';

	let isReady: boolean = false;
	let input: HTMLInputElement;
	let previewImageData: string | undefined;
	let originalImageData: string | undefined;
	let originalImageArrayBuffer: ArrayBuffer | undefined;
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
					extractedPolaroids = event.data.extracted;
					break;
				case 'UPDATE PREVIEW':
					const arrayBuffer = event.data.preview;
					const blob = new Blob([arrayBuffer], { type: 'image/png' });
					previewImageData = URL.createObjectURL(blob);
					break;
			}
		};
	});

	function onChange() {
		if (input && input.files) {
			const file = input.files[0];

			if (file) {
				// Read as ArrayBuffer for worker
				const arrayBufferReader = new FileReader();
				arrayBufferReader.addEventListener('load', function () {
					originalImageArrayBuffer = arrayBufferReader.result as ArrayBuffer;
				});

				// Read as DataURL for preview
				const dataURLReader = new FileReader();
				dataURLReader.addEventListener('load', function () {
					originalImageData = dataURLReader.result as string;
					previewImageData = originalImageData;
					processImage();
				});

				arrayBufferReader.readAsArrayBuffer(file);
				dataURLReader.readAsDataURL(file);
				return;
			}
		}
	}

	function processImage() {
		if (originalImageArrayBuffer) {
			worker.postMessage({ 
				type: 'PROCESS IMAGE', 
				imageData: originalImageArrayBuffer,
				params
			}, [originalImageArrayBuffer]);
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
		extractedPolaroids = [];
	}
</script>

{#if isReady}
	<div class="w-full h-screen flex">
		<!-- Left Column - Image Input/Output -->
		<div class="w-1/2 h-screen p-4 flex flex-col">
			<!-- Preview section with flex-grow -->
			<section class="flex-grow min-h-0 overflow-auto">
				{#if previewImageData}
					<div class="h-full flex flex-col gap-4">
						<img id="preview" src={previewImageData} alt="Uploaded Image" class="max-h-full object-contain" />
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center h-full">
						<h1 class="text-2xl text-center">Upload an image to get started</h1>
						<br />
						<input bind:this={input} on:change={onChange} type="file" accept="image/*" />
					</div>
				{/if}
			</section>

			<!-- Fixed height thumbnails section -->
				<section class="h-[100px] mt-4 overflow-auto">
					<div class="flex flex-row flex-wrap gap-2">
						{#each extractedPolaroids as polaroid, i}
							{@const polaroidURL = URL.createObjectURL(polaroid)}
							<img class="w-24 h-auto" src={polaroidURL} alt="Polaroid" />
						{/each}
					</div>
				</section>
				<button 
					on:click={downloadImages}
					class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Download images
				</button>
		</div>

		<!-- Right Column - Controls -->
		<div class="w-1/2 h-full p-4 overflow-y-auto bg-gray-50">
			<section class="mb-4 p-4 border rounded bg-white">
				<h2 class="text-lg font-bold mb-2">Processing Parameters</h2>
				<div class="grid grid-cols-1 gap-6">
					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showMedianBlurHelp = !params.showMedianBlurHelp}
							>
								{params.showMedianBlurHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Median Blur Kernel:</span>
								<span class="w-12 text-right">{params.medianBlurKernel}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="number" 
										bind:value={params.medianBlurKernel}
										min="3" 
										max="15"
										step="2"
										class="w-32 border rounded px-2 py-1"
									/>
								</div>
							</label>
						</div>
						{#if params.showMedianBlurHelp}
							<p class="text-sm text-gray-600 ml-6">
								Controls initial image smoothing. Higher values (must be odd) reduce noise but blur details. 
								Try increasing if detecting false edges, or decreasing if missing polaroid edges.
							</p>
						{/if}
					</div>
					
					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showThresholdHelp = !params.showThresholdHelp}
							>
								{params.showThresholdHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Threshold Value:</span>
								<span class="w-12 text-right">{params.thresholdValue}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="range" 
										bind:value={params.thresholdValue}
										min="0" 
										max="255"
										class="w-32"
									/>
								</div>
							</label>
						</div>
						{#if params.showThresholdHelp}
							<p class="text-sm text-gray-600 ml-6">
								Determines how aggressively to separate light and dark areas. Higher values create stronger 
								contrast between polaroids and background. Adjust based on scan brightness and contrast.
							</p>
						{/if}
					</div>

					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showStructuringHelp = !params.showStructuringHelp}
							>
								{params.showStructuringHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Structuring Element Size:</span>
								<span class="w-12 text-right">{params.structuringElementSize}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="number" 
										bind:value={params.structuringElementSize}
										min="3" 
										max="20"
										class="w-32 border rounded px-2 py-1"
									/>
								</div>
							</label>
						</div>
						{#if params.showStructuringHelp}
							<p class="text-sm text-gray-600 ml-6">
								Controls noise removal strength. Larger values help merge broken edges but might connect 
								nearby polaroids. Increase if polaroids have gaps, decrease if they're merging together.
							</p>
						{/if}
					</div>

					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showDistanceHelp = !params.showDistanceHelp}
							>
								{params.showDistanceHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Distance Transform:</span>
								<span class="w-12 text-right">{(params.distanceTransformThreshold ?? 0.9).toFixed(2)}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="range" 
										bind:value={params.distanceTransformThreshold}
										min="0" 
										max="1"
										step="0.05"
										class="w-32"
									/>
								</div>
							</label>
						</div>
						{#if params.showDistanceHelp}
							<p class="text-sm text-gray-600 ml-6">
								Affects how polaroids are separated from background. Higher values create stricter separation, 
								lower values are more lenient. Adjust if polaroids are being cut off or including background.
							</p>
						{/if}
					</div>

					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showAreaLowHelp = !params.showAreaLowHelp}
							>
								{params.showAreaLowHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Surface Area (Low):</span>
								<span class="w-12 text-right">{(params.surfaceAreaToleranceLow ?? 0.8).toFixed(2)}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="range" 
										bind:value={params.surfaceAreaToleranceLow}
										min="0.5" 
										max="1"
										step="0.05"
										class="w-32"
									/>
								</div>
							</label>
						</div>
						{#if params.showAreaLowHelp}
							<p class="text-sm text-gray-600 ml-6">
								Minimum size multiplier for detected polaroids. Lower values allow smaller detections. 
								Decrease if missing partial polaroids, but may increase false positives.
							</p>
						{/if}
					</div>

					<div>
						<div class="flex items-start gap-2 mb-1">
							<button 
								class="text-gray-500 hover:text-gray-700" 
								on:click={() => params.showAreaHighHelp = !params.showAreaHighHelp}
							>
								{params.showAreaHighHelp ? '▼' : '▶'}
							</button>
							<label class="flex items-center gap-2 w-full">
								<span class="font-medium w-48">Surface Area (High):</span>
								<span class="w-12 text-right">{(params.surfaceAreaToleranceHigh ?? 1.2).toFixed(2)}</span>
								<div class="flex-1 flex justify-end">
									<input 
										type="range" 
										bind:value={params.surfaceAreaToleranceHigh}
										min="1" 
										max="1.5"
										step="0.05"
										class="w-32"
									/>
								</div>
							</label>
						</div>
						{#if params.showAreaHighHelp}
							<p class="text-sm text-gray-600 ml-6">
								Maximum size multiplier for detected polaroids. Higher values allow larger detections. 
								Increase if missing merged polaroids, but may detect non-polaroid areas.
							</p>
						{/if}
					</div>
				</div>

				<div class="flex gap-2 mt-6">
					<button 
						on:click={processImage}
						class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						Process Image
					</button>
					<button 
						on:click={resetState}
						class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
					>
						Reset
					</button>
				</div>
			</section>
		</div>
	</div>
{:else}
	<div class="w-full h-screen flex items-center justify-center">OpenCV is loading...</div>
{/if}

<!-- HIDDEN ELEMENTS -->
<!-- svelte-ignore a11y-missing-attribute -->
<img id="inputImage" src={previewImageData ? previewImageData : ''} />
<canvas bind:this={fileOutputCanvas} id="fileOutputCanvas" />

<!-- END HIDDEN ELEMENTS -->

<style>
	#preview {
		max-width: 100%;
		height: auto;
		object-fit: contain;
	}

	#inputImage {
		display: none;
	}
	#fileOutputCanvas {
		display: none;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
	}

	input[type="range"] {
		accent-color: #3b82f6;
	}
</style>
