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
}

type ProcessImage = BaseWorkerEvent & {
    type: 'PROCESS IMAGE';
    base64ImageData: string;
    params: ProcessImageParams;
};

type ExtractedPolaroids = BaseWorkerEvent & {
    type: 'EXTRACTED POLAROIDS';
    extracted: Blob[];
};

type UpdatePreview = BaseWorkerEvent & {
    type: 'UPDATE PREVIEW';
    preview: Blob;
};

export type WorkerMessageEvent = ReadyWorkerEvent | ProcessImage | ExtractedPolaroids | UpdatePreview;