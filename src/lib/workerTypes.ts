// Define TS types for worker events

interface BaseWorkerEvent {
    type: string;
}

type ReadyWorkerEvent = BaseWorkerEvent & {
    type: 'WORKER READY';
};

type ProcessImage = BaseWorkerEvent & {
    type: 'PROCESS IMAGE';
    base64ImageData: string;
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