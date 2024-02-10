<script lang="ts">
	import { browser } from '$app/environment';
	import JSZip from 'jszip';
	import { onMount } from 'svelte';

	// Is OpenCV ready?
	let isReady = false;

	let input: HTMLInputElement;
	let image: string | ArrayBuffer | null;
	let srcImage: string | ArrayBuffer | null;

	let fileOutputCanvas: HTMLCanvasElement;

	// Data for extracted polaroids
	let extractedPolaroids: string[] = [];

	// Configure the matrix of how polaroids are arranged in image
	let polaroidsWide = 2;

	const POLAROID_DETECTION_WIDTH = 500;
	const EXPECTED_POLAROID_SURFACE_AREA = POLAROID_DETECTION_WIDTH * 440;

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
		let newWidth = POLAROID_DETECTION_WIDTH * polaroidsWide;
		let newHeight = (newWidth / src.cols) * src.rows;

		// Save the ratio the image was resized by on each axis
		const resizeWidthRatio = newWidth / src.cols;
		const resizeHeightRatio = newHeight / src.rows;

		console.log('Original Image Size: ', src.cols, src.rows);
		console.log('Resized Image Size: ', newWidth, newHeight);
		console.log('Resize Ratios: ', resizeWidthRatio, resizeHeightRatio);
		// Check that when resize ratios are applied to new image size, the original values are obtained
		console.log(
			'Original Image Size: ',
			newWidth / resizeWidthRatio,
			newHeight / resizeHeightRatio
		);

		cv.resize(src, src, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);
		// Blur the image
		cv.medianBlur(src, src, 7);

		// Convert to grayscale
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

		// Thresholding to isolate Polaroids
		cv.threshold(gray, gray, 150, 255, cv.THRESH_BINARY);

		// Erosion and Dilation to remove noise and get background
		let M = cv.Mat.ones(14, 14, cv.CV_8U); // Increase the size of the structuring element
		cv.erode(gray, gray, M);
		cv.dilate(gray, opening, M);

		// Distance Transform
		cv.distanceTransform(opening, distTrans, cv.DIST_L2, 5);
		cv.normalize(distTrans, distTrans, 1, 0, cv.NORM_INF);

		// Get foreground
		cv.threshold(distTrans, polaroidsFg, 0.8 * 1, 255, cv.THRESH_BINARY);
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

		let polaroids = [];

		// Loop through the contours and find the bounding rectangles
		for (let i = 0; i < contours.size(); ++i) {
			let cnt = contours.get(i);
			let area = cv.contourArea(cnt);

			// Discard the large and small contours based on area being larger or smaller than the expected polaroid size
			// 10% tolerance
			if (
				area > EXPECTED_POLAROID_SURFACE_AREA * 0.9 &&
				area < EXPECTED_POLAROID_SURFACE_AREA * 1.1
			) {
				let rect = cv.minAreaRect(cnt);
				// Make sure the rect is the right way up
				if (rect.size.width < rect.size.height) {
					rect.angle += 90;
					let temp = rect.size.width;
					rect.size.width = rect.size.height;
					rect.size.height = temp;
				}

				// Get the four corner points of the rectangle
				let points = cv.RotatedRect.points(rect);

				// Check that the center of the rectangle is not inside any of the previous rectangles
				let center = rect.center;
				let isInside = false;
				for (let j = 0; j < polaroids.length; j++) {
					let polaroid = polaroids[j];
					let rect = polaroid.rect;
					if (
						center.x > rect.center.x - rect.size.width / 2 &&
						center.x < rect.center.x + rect.size.width / 2 &&
						center.y > rect.center.y - rect.size.height / 2 &&
						center.y < rect.center.y + rect.size.height / 2
					) {
						isInside = true;
						break;
					}
				}

				if (!isInside) {
					let polaroid = {
						rect: rect,
						points: points
					};

					// Clone the data
					polaroid = JSON.parse(JSON.stringify(polaroid));

					polaroids.push(polaroid);

					// Draw the rectangle
					for (let j = 0; j < 4; j++) {
						cv.line(src, points[j], points[(j + 1) % 4], [0, 255, 0, 255], 2, cv.LINE_AA, 0);
					}
				}
			}
		}

		// Draw the rectangles on the image
		cv.imshow('canvasOutput', src);

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

		// Extract each polaroid from the original image
		for (let i = 0; i < polaroids.length; i++) {
			let polaroid = polaroids[i];

			// Apply the resize ratios to the polaroid rect and points to get the original image coordinates
			polaroid.rect.size.width /= resizeWidthRatio;
			polaroid.rect.size.height /= resizeHeightRatio;
			polaroid.rect.center.x /= resizeWidthRatio;
			polaroid.rect.center.y /= resizeHeightRatio;

			for (let j = 0; j < 4; j++) {
				polaroid.points[j].x /= resizeWidthRatio;
				polaroid.points[j].y /= resizeHeightRatio;
			}

			// Create a new cv Mat of the original input image
			let originalImage = cv.imread('inputImage');
			// Extract the polaroid from the original image using the points as the four corners of the polaroid
			let extractedPolaroid = new cv.Mat();
			let extractedPolaroidPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
				polaroid.points[0].x,
				polaroid.points[0].y,
				polaroid.points[1].x,
				polaroid.points[1].y,
				polaroid.points[2].x,
				polaroid.points[2].y,
				polaroid.points[3].x,
				polaroid.points[3].y
			]);

			// Create a cv Rotated Rect from the points
			let extractedPolaroidRect = cv.minAreaRect(extractedPolaroidPoints);

			// if the rect is not the right way up, rotate it
			if (extractedPolaroidRect.size.width > extractedPolaroidRect.size.height) {
				extractedPolaroidRect.angle += 90;
				let temp = extractedPolaroidRect.size.width;
				extractedPolaroidRect.size.width = extractedPolaroidRect.size.height;
				extractedPolaroidRect.size.height = temp;
			}

			// Get the width and height of this rect
			let extractedPolaroidWidth = extractedPolaroidRect.size.width;
			let extractedPolaroidHeight = extractedPolaroidRect.size.height;

			console.log('Extracted Polaroid Width: ', extractedPolaroidWidth);

			// Create new points for the extracted polaroid using the width and height, subtracting 1% of the width or height from each edge to remove any border
			const edgeBuffer = 0.01;
			const widthEdgeBuffer = extractedPolaroidWidth * edgeBuffer;
			const heightEdgeBuffer = extractedPolaroidHeight * edgeBuffer;
			let extractedPolaroidPoints2 = cv.matFromArray(4, 1, cv.CV_32FC2, [
				0 - widthEdgeBuffer,
				0 - heightEdgeBuffer,
				extractedPolaroidWidth + widthEdgeBuffer,
				0 - heightEdgeBuffer,
				extractedPolaroidWidth + widthEdgeBuffer,
				extractedPolaroidHeight + heightEdgeBuffer,
				0 - widthEdgeBuffer,
				extractedPolaroidHeight + heightEdgeBuffer
			]);

			// Create a transformation matrix to transform the extracted polaroid points to the new points
			let M = cv.getPerspectiveTransform(extractedPolaroidPoints, extractedPolaroidPoints2);
			// Warp the original image using the transformation matrix
			cv.warpPerspective(
				originalImage,
				extractedPolaroid,
				M,
				new cv.Size(extractedPolaroidWidth, extractedPolaroidHeight)
			);

			// Sharpen the polaroid
			// Create a sharpen filter
			let sharpenFilter = new cv.Mat.zeros(3, 3, cv.CV_32F);
			sharpenFilter.floatPtr(1, 1)[0] = 5.0;
			sharpenFilter.floatPtr(0, 1)[0] = -1.0;
			sharpenFilter.floatPtr(2, 1)[0] = -1.0;
			sharpenFilter.floatPtr(1, 0)[0] = -1.0;
			sharpenFilter.floatPtr(1, 2)[0] = -1.0;

			// Apply the sharpen filter to the polaroid
			cv.filter2D(extractedPolaroid, extractedPolaroid, -1, sharpenFilter);

			// Draw the extracted polaroid with the warp applied to the canvas
			fileOutputCanvas.width = extractedPolaroidWidth;
			fileOutputCanvas.height = extractedPolaroidHeight;
			cv.imshow('fileOutputCanvas', extractedPolaroid);

			let dataURL = fileOutputCanvas.toDataURL('image/png');
			extractedPolaroids.push(dataURL);

			extractedPolaroids = extractedPolaroids;

			// Memory cleanup
			originalImage.delete();
			extractedPolaroid.delete();
			extractedPolaroidPoints.delete();
			extractedPolaroidPoints2.delete();
			M.delete();
		}
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

	function downloadImages() {
		// ZIP the images and download
		const zip = new JSZip();
		const folder = zip.folder('polaroids');
		for (let i = 0; i < extractedPolaroids.length; i++) {
			const dataURL = extractedPolaroids[i];
			const base64 = dataURL.split(',')[1];

			// Create file safe date time string
			const date = new Date();
			const dateString = date.toISOString().replace(/:/g, '-').replace(/\./g, '-');

			folder?.file(`polaroid-${dateString}.png`, base64, { base64: true });
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
		</section>

		<section>
			{#if extractedPolaroids.length > 0}
				<div class="flex flex-row">
					{#each extractedPolaroids as polaroid, i}
						<img class="w-12 h-auto m-2" src={polaroid} alt="Polaroid" />
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
<img id="inputImage" src={image ? image : ''} />
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
