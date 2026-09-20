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
 * Event sent to request processing of an image.
 */
type ProcessImage = BaseWorkerEvent & {
	type: 'PROCESS IMAGE';
	/**
	 * The decoded scan (transferred to the worker). Omit to re-process the previously
	 * sent image with new parameters.
	 */
	image?: ImageBitmap;
	params: ProcessImageParams;
};

/**
 * Event sent to process a folder of scans (batch mode). The extracted polaroids are saved
 * as PNGs straight into `output`, named `<scan name>-<n>.png`.
 */
type ProcessFolder = BaseWorkerEvent & {
	type: 'PROCESS FOLDER';
	/** The scans to process, in order */
	scans: FileSystemFileHandle[];
	/** Folder to save into; needs `readwrite` permission */
	output: FileSystemDirectoryHandle;
	params: ProcessImageParams;
};

/**
 * Event sent to stop a batch before it starts its next scan.
 */
type CancelBatch = BaseWorkerEvent & {
	type: 'CANCEL BATCH';
};

/**
 * A polaroid that batch mode has saved.
 */
export interface SavedPolaroid {
	/** File name within the output folder */
	name: string;
	/** Downsized copy for display (the full-size image only exists on disk) */
	thumbnail: ImageBitmap;
}

/**
 * Event sent when a batch has finished (or failed) one scan.
 */
type BatchProgress = BaseWorkerEvent & {
	type: 'BATCH PROGRESS';
	/** Index into the `scans` of PROCESS FOLDER */
	index: number;
	/** The polaroids extracted from the scan and saved */
	saved: SavedPolaroid[];
	/** Set if the scan could not be processed */
	error?: string;
};

/**
 * Event sent when a batch ends.
 */
type BatchFinished = BaseWorkerEvent & {
	type: 'BATCH FINISHED';
	/** Whether the batch stopped before processing every scan */
	cancelled: boolean;
	totalMs: number;
};

/**
 * Event sent to free the image the worker is holding on to.
 */
type ReleaseImage = BaseWorkerEvent & {
	type: 'RELEASE IMAGE';
};

/**
 * Event containing the extracted polaroid images.
 *
 * @remarks
 * The images are sent as ImageBitmaps so they can be displayed immediately; encoding
 * them to PNG is left to the receiver (it is the slowest step and only needed on download).
 */
type ExtractedPolaroids = BaseWorkerEvent & {
	type: 'EXTRACTED POLAROIDS';
	extracted: ImageBitmap[];
	transferable?: boolean;
};

/**
 * Which implementation ran the full-resolution stages (downsample, warp and sharpen).
 * Detection always runs in OpenCV.
 */
export type ProcessingBackend = 'webgpu' | 'opencv';

/**
 * Event reporting how long each stage of the last run took.
 */
export type ProcessingTimings = BaseWorkerEvent & {
	type: 'TIMINGS';
	backend: ProcessingBackend;
	/** Wall-clock duration of each pipeline stage, in milliseconds */
	stages: { name: string; ms: number }[];
	totalMs: number;
};

/**
 * The outline of one detected polaroid, in full-resolution scan coordinates.
 */
export type PolaroidOutline = {
	/** The four corners, in order around the rectangle */
	corners: { x: number; y: number }[];
	/** Whether all four edges were re-located in the full-resolution scan */
	refined: boolean;
};

/**
 * Event describing what was detected, for drawing over the scan.
 *
 * @remarks
 * Nothing is baked into an image: the outlines are coordinates and the watershed contours
 * are a transparent overlay, so the receiver can show either on top of the original scan.
 */
export type UpdatePreview = BaseWorkerEvent & {
	type: 'UPDATE PREVIEW';
	/** Size of the scan the outlines refer to */
	width: number;
	height: number;
	outlines: PolaroidOutline[];
	/** Watershed barriers on a transparent background, at detection resolution */
	contours: ImageBitmap;
	transferable?: boolean;
};

/**
 * Union type of all possible worker message events.
 */
export type WorkerMessageEvent =
	| ReadyWorkerEvent
	| ProcessImage
	| ReleaseImage
	| ProcessFolder
	| CancelBatch
	| BatchProgress
	| BatchFinished
	| ExtractedPolaroids
	| UpdatePreview
	| ProcessingTimings;
