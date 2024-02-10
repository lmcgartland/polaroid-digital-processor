<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let isReady = false;
	let input: HTMLInputElement;
	let image: string | ArrayBuffer | null;
	let srcImage: string | ArrayBuffer | null;

	onMount(() => {
		if (browser && 'cv' in window) {
			isReady = true;
		} else {
			window.addEventListener('opencv-ready', function (e) {
				isReady = true;
			});
		}
	});

	function processImage() {
		// Opencv reads from the DOM element with the id "preview"
		let cv = window.cv;
		// window.cv.imread('inputImage');
		let src = cv.imread('inputImage');
		let dst = new cv.Mat();
		let gray = new cv.Mat();
		let opening = new cv.Mat();
		let coinsBg = new cv.Mat();
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
		cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

		// get background
		let M = cv.Mat.ones(3, 3, cv.CV_8U);
		cv.erode(gray, gray, M);
		cv.dilate(gray, opening, M);
		cv.dilate(opening, coinsBg, M, new cv.Point(-1, -1), 3);

		cv.imshow('canvasOutput', coinsBg);
		src.delete();
		dst.delete();
		gray.delete();
		opening.delete();
		coinsBg.delete();
		M.delete();
	}

	function onChange() {
		if (input && input.files) {
			const file = input.files[0];

			if (file) {
				const reader = new FileReader();
				reader.addEventListener('load', function () {
					image = reader.result;

					// Create a new Image object
					const img = new Image();
					img.src = reader.result as string;

					// Load the image into a canvas
					img.onload = function () {
						processImage();
					};
				});
				reader.readAsDataURL(file);

				return;
			}
		}
	}
</script>

{#if isReady}
	<div class="w-full h-screen flex items-center justify-center">
		<div>
			{#if image}
				<div class="flex flex-row">
					<img id="preview" src={image} alt="Uploaded Image" />
					<canvas id="canvasOutput" />
				</div>
			{:else}
				<h1 class="text-2xl text-center">Upload an image to get started</h1>
				<br />
				<input bind:this={input} on:change={onChange} type="file" accept="image/*" />
			{/if}
		</div>
	</div>
{:else}
	<div class="w-full h-screen flex items-center justify-center">OpenCV is loading...</div>
{/if}

<!-- svelte-ignore a11y-missing-attribute -->
<img id="inputImage" src={image ? image : ''} />

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
</style>
