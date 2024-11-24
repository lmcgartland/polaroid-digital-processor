import type { OpenCV } from "@opencvjs/types";

// TODO: Move Extractor to own reusable class

class Extractor {
    canvasOutput: OffscreenCanvas;
    cv: typeof OpenCV;
    src: OpenCV.Mat | undefined;

    constructor({ cv }: { cv: typeof OpenCV }) {
        this.canvasOutput = new OffscreenCanvas(300, 150);
        this.cv = cv;
    }

}
