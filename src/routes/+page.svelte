<script lang="ts">
	import JSZip from 'jszip';
	import { onMount } from 'svelte';
	import type { WorkerMessageEvent } from '$lib/workerTypes';

	let isReady: boolean = false;
	let input: HTMLInputElement;
	let previewImageData: string | undefined;
	let srcImage: string | ArrayBuffer | null;
	let worker: Worker;

	let fileOutputCanvas: HTMLCanvasElement;

	// Data for extracted polaroids
	let extractedPolaroids: Blob[] = [];

	onMount(async() => {
		const MyWorker = await import('$lib/worker.ts?worker');
		worker = new MyWorker.default(); 
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
					const blob = event.data.preview;
					previewImageData = URL.createObjectURL(blob);
					break;
			}
		};
	});

	function onChange() {
		if (input && input.files) {
			const file = input.files[0];

			if (file) {
				const reader = new FileReader();
				reader.addEventListener('load', function () {
					previewImageData = reader.result as string;

					worker.postMessage({ type: 'PROCESS IMAGE', base64ImageData: reader.result as string });
				});

				// NOTE - data url will not work with TIF files
				reader.readAsDataURL(file);

				return;
			}
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
		zip.generateAsync({ type: 'blob' }).then(function (content) {
			const link = document.createElement('a');
			link.href = URL.createObjectURL(content);
			link.download = 'polaroids.zip';
			link.click();
		});
	}
</script>

{#if isReady}
	<div class="w-full h-screen flex flex-col items-center justify-center">
		<section>
			{#if previewImageData}
				<div class="flex flex-row">
					<img id="preview" src={previewImageData} alt="Uploaded Image" />
					<!-- <canvas id="canvasOutput" /> -->
				</div>
			{:else}
				<h1 class="text-2xl text-center">Upload an image to get started</h1>
				<br />
				<input bind:this={input} on:change={onChange} type="file" accept="image/*" />
			{/if}
		</section>

		<section>
			{#if extractedPolaroids.length > 0}
				<div class="flex flex-row">
					{#each extractedPolaroids as polaroid, i}
						{@const polaroidURL = URL.createObjectURL(polaroid)}
						<img class="w-12 h-auto m-2" src={polaroidURL} alt="Polaroid" />
					{/each}
				</div>
				<button on:click={downloadImages}>Download images</button>
			{/if}
		</section>
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
	#preview,
	#canvasOutput {
		max-width: 400px;
		max-height: 400px;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	#inputImage {
		display: none;
	}
	#fileOutputCanvas {
		display: none;
	}
</style>
