/// <reference lib="webworker" /> 

import type { WorkerMessageEvent, ProcessImageParams } from "./workerTypes";
import type { OpenCV } from "@opencvjs/types";

interface WorkerGlobalScope {
    cv: typeof OpenCV;
}

/** We need to trick opencv in thinking we're in a normal web env. */
// @ts-ignore
self.HTMLImageElement = ImageBitmap;
// @ts-ignore
self.HTMLCanvasElement = OffscreenCanvas;
self.document = {
    // @ts-ignore
    createElement() {
        return new OffscreenCanvas(300, 150);
    }
};


// Data for extracted polaroids
let extractedPolaroids: ArrayBuffer[] = [];

// Configure the matrix of how polaroids are arranged in image
let polaroidsWide = 2;

const POLAROID_DETECTION_WIDTH = 500;
const EXPECTED_POLAROID_SURFACE_AREA = POLAROID_DETECTION_WIDTH * 440;

// Import our vendor script
importScripts("/vendor/opencv.js");

addEventListener("message", (event: MessageEvent<WorkerMessageEvent>) => {
    console.log("RECEIVED MESSAGE FROM MAIN", event);
    switch (event.data.type) {
        case "PROCESS IMAGE":
            // Reset the extracted polaroids array before processing new image
            extractedPolaroids = [];
            processImage(
                event.data.imageData,
                event.data.width,
                event.data.height,
                event.data.params
            );
            break;
    }
});

function postStructuredMessage(message: WorkerMessageEvent, transferList?: Transferable[]) {
    self.postMessage(message, transferList || []);
}

self.cv.onRuntimeInitialized = () => {
    postStructuredMessage({ type: "WORKER READY" });
};

async function sendPreviewImageToMainThread(canvas: OffscreenCanvas) {
    const blob = await canvas.convertToBlob();
    const arrayBuffer = await blob.arrayBuffer();
    postStructuredMessage({ type: "UPDATE PREVIEW", preview: arrayBuffer, transferable: true }, [arrayBuffer]);
}

function createMatFromTextureData(arrayBuffer: ArrayBuffer, width: number, height: number): any {
    // Create ImageData from the texture data (RGBA format)
    const uint8Array = new Uint8ClampedArray(arrayBuffer);
    const imageData = new ImageData(uint8Array, width, height);
    
    // Create cv.Mat directly from ImageData (zero-copy)
    return self.cv.matFromImageData(imageData);
}

async function processImage(
    imageData: ArrayBuffer, 
    width: number,
    height: number,
    params: ProcessImageParams = {}
) {
    // Force garbage collection of any previous cv.Mat objects that might still be in memory
    self.cv.deleteAllMemoryInstances?.();  // Only if this method exists in your OpenCV build
    
    // Default values
    const {
        medianBlurKernel = 7,
        thresholdValue = 100,
        structuringElementSize = 10,
        distanceTransformThreshold = 0.9,
        surfaceAreaToleranceLow = 0.8,
        surfaceAreaToleranceHigh = 1.2
    } = params;

    // Create a canvas element to draw the image on
    let canvasOutput = new OffscreenCanvas(300, 150);

    let cv: typeof OpenCV = self.cv;

    // Create cv.Mat directly from texture data (zero-copy)
    let src = createMatFromTextureData(imageData, width, height);
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
    cv.medianBlur(src, src, medianBlurKernel);

    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // Thresholding to isolate Polaroids
    cv.threshold(gray, gray, thresholdValue, 255, cv.THRESH_BINARY);

    // Erosion and Dilation to remove noise and get background

    // Tweak the structuring element values!!
    let M = cv.Mat.ones(structuringElementSize, structuringElementSize, cv.CV_8U); // Increase the size of the structuring element
    cv.erode(gray, gray, M);
    cv.dilate(gray, opening, M);

    // Distance Transform
    cv.distanceTransform(opening, distTrans, cv.DIST_L2, 5);
    cv.normalize(distTrans, distTrans, 1, 0, cv.NORM_INF);

    // Get foreground
    cv.threshold(distTrans, polaroidsFg, distanceTransformThreshold * 1, 255, cv.THRESH_BINARY);
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
    cv.imshow(canvasOutput as any, src);
    sendPreviewImageToMainThread(canvasOutput);

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
        // 20% tolerance
        if (
            area > EXPECTED_POLAROID_SURFACE_AREA * surfaceAreaToleranceLow &&
            area < EXPECTED_POLAROID_SURFACE_AREA * surfaceAreaToleranceHigh
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
            // @ts-ignore
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
    cv.imshow(canvasOutput as any, src);
    sendPreviewImageToMainThread(canvasOutput);

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

        // Create a new cv Mat of the original input image (zero-copy)
        let originalImage = createMatFromTextureData(imageData, width, height);
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
        let sharpenFilter: OpenCV.Mat = new cv.Mat.zeros(3, 3, cv.CV_32F);
        sharpenFilter.floatPtr(1, 1)[0] = 5.0;
        sharpenFilter.floatPtr(0, 1)[0] = -1.0;
        sharpenFilter.floatPtr(2, 1)[0] = -1.0;
        sharpenFilter.floatPtr(1, 0)[0] = -1.0;
        sharpenFilter.floatPtr(1, 2)[0] = -1.0;

        // Apply the sharpen filter to the polaroid
        cv.filter2D(extractedPolaroid, extractedPolaroid, -1, sharpenFilter);

        // Draw the extracted polaroid with the warp applied to the canvas
        let fileOutputCanvas = new OffscreenCanvas(extractedPolaroidWidth, extractedPolaroidHeight);
        cv.imshow(fileOutputCanvas as any, extractedPolaroid);

        // let dataURL = fileOutputCanvas.toDataURL('image/png');
        let dataBlob = await fileOutputCanvas.convertToBlob({ type: 'image/png' });
        let arrayBuffer = await dataBlob.arrayBuffer();
        extractedPolaroids.push(arrayBuffer);

        // Memory cleanup
        originalImage.delete();
        extractedPolaroid.delete();
        extractedPolaroidPoints.delete();
        extractedPolaroidPoints2.delete();
        M.delete();
        sharpenFilter.delete();
    }

    // Send the extracted polaroids to the main thread after all are processed
    postStructuredMessage({ type: 'EXTRACTED POLAROIDS', extracted: extractedPolaroids, transferable: true }, extractedPolaroids);
}