// Define TS types for worker events

interface BaseWorkerEvent {
    type: string;
}

type ReadyWorkerEvent = BaseWorkerEvent & {
    type: 'WORKER READY';
};

export interface ProcessImageParams {
    medianBlurKernel?: number;
    thresholdValue?: number;
    structuringElementSize?: number;
    distanceTransformThreshold?: number;
    surfaceAreaToleranceLow?: number;
    surfaceAreaToleranceHigh?: number;
    showMedianBlurHelp?: boolean;
    showThresholdHelp?: boolean;
    showStructuringHelp?: boolean;
    showDistanceHelp?: boolean;
    showAreaLowHelp?: boolean;
    showAreaHighHelp?: boolean;
}

type ProcessImage = BaseWorkerEvent & {
    type: 'PROCESS IMAGE';
    imageData: ArrayBuffer;
    params: ProcessImageParams;
};

type ExtractedPolaroids = BaseWorkerEvent & {
    type: 'EXTRACTED POLAROIDS';
    extracted: Blob[];
};

type UpdatePreview = BaseWorkerEvent & {
    type: 'UPDATE PREVIEW';
    preview: ArrayBuffer;
    transferable?: boolean;
};

export type WorkerMessageEvent = ReadyWorkerEvent | ProcessImage | ExtractedPolaroids | UpdatePreview;