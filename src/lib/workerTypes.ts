// Define TS types for worker events

interface BaseWorkerEvent {
	type: string;
}

type ReadyWorkerEvent = BaseWorkerEvent & {
	type: 'WORKER READY';
};

/**
 * Parameters for configuring the polaroid extraction algorithm.
 *
 * @remarks
 * These parameters control the image processing pipeline used to detect and extract
 * individual polaroid photos from scanned images. Adjust them based on your scan
 * quality, lighting conditions, and the number of polaroids in the image.
 */
export interface ProcessImageParams {
	/**
	 * Kernel size for median blur filter (must be an odd number).
	 * Higher values reduce noise but may blur polaroid edges.
	 * @defaultValue 5
	 */
	medianBlurKernel?: number;

	/**
	 * Threshold value for binary conversion (0-255).
	 * Higher values create stronger contrast between polaroids and background.
	 * Adjust based on scan brightness and contrast.
	 * @defaultValue 132
	 */
	thresholdValue?: number;

	/**
	 * Size of the structuring element for morphological operations.
	 * Larger values help merge broken edges but might connect nearby polaroids.
	 * Increase if polaroids have gaps, decrease if they're merging together.
	 * @defaultValue 12
	 */
	structuringElementSize?: number;

	/**
	 * Threshold for the distance transform (0-1).
	 * Affects how polaroids are separated from the background.
	 * Higher values create stricter separation, lower values are more lenient.
	 * @defaultValue 0.9
	 */
	distanceTransformThreshold?: number;

	/**
	 * Minimum size multiplier for detected polaroids relative to expected size.
	 * Lower values allow smaller detections but may increase false positives.
	 * @defaultValue 0.8
	 */
	surfaceAreaToleranceLow?: number;

	/**
	 * Maximum size multiplier for detected polaroids relative to expected size.
	 * Higher values allow larger detections but may detect non-polaroid areas.
	 * @defaultValue 1.2
	 */
	surfaceAreaToleranceHigh?: number;

	/** UI state: whether to show help text for median blur parameter */
	showMedianBlurHelp?: boolean;
	/** UI state: whether to show help text for threshold parameter */
	showThresholdHelp?: boolean;
	/** UI state: whether to show help text for structuring element parameter */
	showStructuringHelp?: boolean;
	/** UI state: whether to show help text for distance transform parameter */
	showDistanceHelp?: boolean;
	/** UI state: whether to show help text for surface area low parameter */
	showAreaLowHelp?: boolean;
	/** UI state: whether to show help text for surface area high parameter */
	showAreaHighHelp?: boolean;
}

/**
 * Event sent when the image processing is complete.
 */
type ProcessImage = BaseWorkerEvent & {
	type: 'PROCESS IMAGE';
	imageData: ArrayBuffer;
	params: ProcessImageParams;
};

/**
 * Event containing the extracted polaroid images.
 */
type ExtractedPolaroids = BaseWorkerEvent & {
	type: 'EXTRACTED POLAROIDS';
	extracted: ArrayBuffer[];
	transferable?: boolean;
};

/**
 * Event to update the preview image display.
 */
type UpdatePreview = BaseWorkerEvent & {
	type: 'UPDATE PREVIEW';
	preview: ArrayBuffer;
	transferable?: boolean;
};

/**
 * Union type of all possible worker message events.
 */
export type WorkerMessageEvent = ReadyWorkerEvent | ProcessImage | ExtractedPolaroids | UpdatePreview;
