<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let isReady = false;
	let input: HTMLInputElement;
	let image: string | ArrayBuffer | null;
	let srcImage: string | ArrayBuffer | null;

	// Configure the matrix of how polaroids are arranged in image
	let polaroidsWide = 2;

	let polaroidDetectionWidth = 500;

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
		// Assumes using 600px polaroid

		// Opencv reads from the DOM element with the id "preview"
		let cv = window.cv;
		let src = cv.imread('inputImage');
		let dst = new cv.Mat();
		let gray = new cv.Mat();
		let opening = new cv.Mat();
		let polaroidsBg = new cv.Mat();
		let polaroidsFg = new cv.Mat();
		let distTrans = new cv.Mat();
		let unknown = new cv.Mat();
		let markers = new cv.Mat();

		// Image pre-processing
		// Resize the image based on how many polaroids are in the image
		let newWidth = polaroidDetectionWidth * polaroidsWide;
		let newHeight = (newWidth / src.cols) * src.rows;
		cv.resize(src, src, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);
		// Blur the image
		cv.medianBlur(src, src, 7);

		// Convert to grayscale
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

		// Thresholding to isolate Polaroids
		cv.threshold(gray, gray, 180, 255, cv.THRESH_BINARY);

		// Erosion and Dilation to remove noise and get background
		let M = cv.Mat.ones(12, 12, cv.CV_8U); // Increase the size of the structuring element
		cv.erode(gray, gray, M);
		cv.dilate(gray, opening, M);

		// Distance Transform
		cv.distanceTransform(opening, distTrans, cv.DIST_L2, 5);
		cv.normalize(distTrans, distTrans, 1, 0, cv.NORM_INF);

		// Get foreground
		cv.threshold(distTrans, polaroidsFg, 0.7 * 1, 255, cv.THRESH_BINARY);
		polaroidsFg.convertTo(polaroidsFg, cv.CV_8U, 1, 0);
		cv.subtract(opening, polaroidsFg, unknown); // Use 'opening' instead of 'polaroidsBg'

		// Get connected components markers
		cv.connectedComponents(polaroidsFg, markers);
		for (let i = 0; i < markers.rows; i++) {
			for (let j = 0; j < markers.cols; j++) {
				markers.intPtr(i, j)[0] = markers.ucharPtr(i, j)[0] + 1;
				if (unknown.ucharPtr(i, j)[0] == 255) {
					markers.intPtr(i, j)[0] = 0;
				}
			}
		}

		// Watershed Algorithm
		cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
		cv.watershed(src, markers);

		// Draw barriers
		for (let i = 0; i < markers.rows; i++) {
			for (let j = 0; j < markers.cols; j++) {
				if (markers.intPtr(i, j)[0] == -1) {
					src.ucharPtr(i, j)[0] = 255; // R
					src.ucharPtr(i, j)[1] = 0; // G
					src.ucharPtr(i, j)[2] = 0; // B
				}
			}
		}

		// Display the result
		cv.imshow('canvasOutput', src);

		// Find the rectangles in the barriers
		let contours = new cv.MatVector();
		let hierarchy = new cv.Mat();
		cv.findContours(markers, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

		// Loop through the contours and find the bounding rectangles
		for (let i = 0; i < contours.size(); ++i) {
			let cnt = contours.get(i);
			let rect = cv.boundingRect(cnt);

			// Discard small rectangles
			if (rect.width < 100 || rect.height < 100) {
				continue;
			}
			// Discard large rectangles
			if (rect.width > 800 || rect.height > 800) {
				continue;
			}

			let x = rect.x;
			let y = rect.y;
			let w = rect.width;
			let h = rect.height;
			cv.rectangle(src, new cv.Point(x, y), new cv.Point(x + w, y + h), [0, 255, 0, 255], 2);

			// Draw the rectangles
			cv.imshow('canvasOutput', src);
		}

		// let cnt = contours.get(0);
		// let rect = cv.boundingRect(cnt);
		// let x = rect.x;
		// let y = rect.y;
		// let w = rect.width;
		// let h = rect.height;

		// // Crop the image
		// let cropped = src.roi(new cv.Rect(x, y, w, h));
		// cv.imshow('canvasOutput', cropped);

		// // Extract the cropped image from the original, unblurred image
		// let img = document.getElementById('preview') as HTMLImageElement;
		// let canvas = document.createElement('canvas');
		// canvas.width = w;
		// canvas.height = h;
		// let ctx = canvas.getContext('2d');
		// ctx?.drawImage(img, x, y, w, h, 0, 0, w, h);
		// let dataURL = canvas.toDataURL('image/png');
		// image = dataURL;

		// Memory cleanup
		src.delete();
		dst.delete();
		gray.delete();
		opening.delete();
		polaroidsBg.delete();
		polaroidsFg.delete();
		distTrans.delete();
		unknown.delete();
		markers.delete();
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
