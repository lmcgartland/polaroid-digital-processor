/// <reference lib="webworker" />
/// <reference lib="webworker.asynciterable" />
/// <reference types="@webgpu/types" />

import type { WorkerMessageEvent, ProcessImageParams, ProcessingBackend } from './workerTypes';
import type { OpenCV } from '@opencvjs/types';

interface WorkerGlobalScope {
	cv: typeof OpenCV;
}

/**
 * We need to trick OpenCV into thinking we're in a normal web environment.
 * This allows OpenCV.js to work properly in a Web Worker context.
 */
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

// NOTE: This file must not import anything at runtime. It runs as a classic worker (OpenCV.js
// needs importScripts), and Vite serves classic workers unbundled in dev.

/**
 * The scan currently being worked on. Kept between runs so the image can be re-processed
 * with different parameters without being decoded or uploaded again.
 */
let sourceImage: ImageBitmap | undefined;

/** Full-resolution copy of the scan on the WASM heap. Only created on the OpenCV-only path. */
let sourceMat: OpenCV.Mat | undefined;

/** Runs are serialized so a new image can't replace the source mid-run. */
let processingQueue: Promise<void> = Promise.resolve();

/**
 * Number of polaroids expected horizontally in the scanned image.
 * Used to calculate the resize ratio for detection.
 */
let polaroidsWide = 2;

/**
 * Target width for polaroid detection processing.
 * Images are resized to this width per polaroid for consistent detection.
 */
const POLAROID_DETECTION_WIDTH = 500;

/**
 * Expected surface area of a single polaroid at detection resolution.
 * Used to filter detected contours by size.
 */
const EXPECTED_POLAROID_SURFACE_AREA = POLAROID_DETECTION_WIDTH * 440;

/**
 * Minimum fraction of its bounding rectangle that a contour must fill to count as a polaroid.
 * Real polaroids measure ~0.99. The background between polaroids can pass the area filter
 * (on scans with a light background), but it only fills 0.2-0.3 of its bounding rectangle.
 */
const MIN_POLAROID_RECTANGULARITY = 0.9;

// Import our vendor script
importScripts('/vendor/opencv.js');

/**
 * Collects wall-clock durations for each pipeline stage.
 * Repeated marks with the same name (e.g. once per polaroid) are accumulated.
 */
function createStageTimer() {
	const stages = new Map<string, number>();
	const start = performance.now();
	let last = start;
	return {
		mark(name: string) {
			const now = performance.now();
			stages.set(name, (stages.get(name) ?? 0) + (now - last));
			last = now;
		},
		finish() {
			return {
				stages: [...stages].map(([name, ms]) => ({ name, ms })),
				totalMs: performance.now() - start
			};
		}
	};
}

/**
 * Edge refinement: re-locating each polaroid's edges in the full-resolution scan.
 *
 * Every edge is probed with EDGE_STATIONS short profiles running across it, from outside
 * the polaroid to inside. The frame colour is read from the inner end of a profile, and
 * the edge is where the profile departs from that colour. This works for every kind of
 * edge a scan produces: a dark shadow band, a bright highlight line, or just a soft step
 * between an off-white frame and a white scanner lid. A rectangle is then fitted robustly
 * to all of the located edge points.
 */

/** Number of profiles sampled along each edge */
const EDGE_STATIONS = 48;

/**
 * Each edge is located once per segment, from the median of that segment's profiles.
 * Must divide EDGE_STATIONS.
 */
const EDGE_SEGMENTS = 6;

/** Number of samples in each profile (index 0 is outside the polaroid, the last is inside) */
const EDGE_PROFILE_LENGTH = 64;

/** Profiles are sampled along this central fraction of each edge, avoiding the rounded corners */
const EDGE_SPAN = 0.8;

/**
 * How far each profile reaches to either side of the estimated edge, as a fraction of the
 * polaroid's short side (~30px on a 600dpi scan). Must exceed the error of the initial
 * estimate, while staying inside the frame and short of any neighbouring polaroid.
 */
const EDGE_SEARCH_FRACTION = 0.014;

/** Each profile sample is averaged over this many taps either side, along the edge, to suppress noise */
const EDGE_TANGENT_TAPS = 4;

/** Samples at the inner end of each profile that are taken to be the frame's colour */
const EDGE_REFERENCE_SAMPLES = 8;

/**
 * Smallest colour departure (RGB distance, 0-255 scale) that counts as leaving the frame.
 * About 3.5 grey levels, so that the faint shadow hugging a polaroid's lit edges registers.
 */
const EDGE_MIN_CONTRAST = 6;

/** A departure must last this many samples to count */
const EDGE_SUSTAIN = 4;

/** Width of the scanner's blur across a sharp edge, in profile samples */
const EDGE_BLUR_SAMPLES = 6;

/**
 * Colour change per sample below which a step is gentle (the start of a shadow ramp), and
 * above which it is sharp (a blurred hard edge). Measured on 600dpi scans: shadow ramps and
 * dips run at 5-7, the faintest hard edges at 20+.
 */
const EDGE_GENTLE_STEP = 8;
const EDGE_SHARP_STEP = 16;

/**
 * How much is trimmed from each side of an extracted polaroid, as a fraction of its size,
 * so that no sliver of background or shadow survives along the edges.
 *
 * With refined edges this only needs to cover the scanner's blur and edges that aren't
 * perfectly straight (the thick bottom of a polaroid doesn't lie flat on the glass). Without
 * them it has to cover the error of the estimate made on the downsized image, which
 * typically includes the polaroid's shadow.
 */
const REFINED_EDGE_CROP = 0.003;
const UNREFINED_EDGE_CROP = 0.01;

/** Passes of refinement; the second re-centres the profiles on the result of the first */
const EDGE_REFINE_PASSES = 2;

/** An edge needs at least this fraction of its segments to locate it, or its estimate is kept */
const EDGE_MIN_VALID_FRACTION = 0.4;

/** Largest rotation (radians) the refinement may apply; more than this means it went wrong */
const EDGE_MAX_ROTATION = 0.03;

/** Describes where to sample the profiles for one edge. All vectors are in source pixels. */
interface EdgeProfileSpec {
	/** Centre of the first profile */
	start: Point;
	/** Step between the centres of successive profiles (along the edge) */
	along: Point;
	/** Step between successive samples of a profile (across the edge, pointing inwards) */
	across: Point;
}

/**
 * Build the profile specs for the four edges of a rectangle. Edge `e` runs from
 * `corners[e]` to `corners[e + 1]`.
 */
function edgeProfileSpecs(corners: Point[]): EdgeProfileSpec[] {
	const center = {
		x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
		y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
	};
	const lengths = corners.map((a, e) => {
		const b = corners[(e + 1) % 4];
		return Math.hypot(b.x - a.x, b.y - a.y);
	});
	const reach = Math.min(...lengths) * EDGE_SEARCH_FRACTION;
	const sampleStep = (2 * reach) / (EDGE_PROFILE_LENGTH - 1);

	return corners.map((a, e) => {
		const b = corners[(e + 1) % 4];
		const tangent = { x: (b.x - a.x) / lengths[e], y: (b.y - a.y) / lengths[e] };
		// The normal that points towards the centre of the rectangle
		let normal = { x: -tangent.y, y: tangent.x };
		if ((center.x - a.x) * normal.x + (center.y - a.y) * normal.y < 0) {
			normal = { x: -normal.x, y: -normal.y };
		}
		const first = (lengths[e] * (1 - EDGE_SPAN)) / 2;
		const stationStep = (lengths[e] * EDGE_SPAN) / (EDGE_STATIONS - 1);
		return {
			start: { x: a.x + tangent.x * first, y: a.y + tangent.y * first },
			along: { x: tangent.x * stationStep, y: tangent.y * stationStep },
			across: { x: normal.x * sampleStep, y: normal.y * sampleStep }
		};
	});
}

/**
 * OpenCV-path equivalent of GpuProcessor.sampleEdgeProfiles: sample the profiles from the
 * full-resolution Mat with bilinear interpolation. Returns RGBA (0-255) per sample, ordered
 * by edge, then station, then position along the profile.
 */
function sampleEdgeProfiles(source: OpenCV.Mat, edges: EdgeProfileSpec[]): Float32Array {
	const pixels = source.data;
	const width = source.cols;
	const height = source.rows;
	const profiles = new Float32Array(edges.length * EDGE_STATIONS * EDGE_PROFILE_LENGTH * 4);
	const profileCenter = (EDGE_PROFILE_LENGTH - 1) / 2;
	const taps = 2 * EDGE_TANGENT_TAPS + 1;

	let out = 0;
	for (const edge of edges) {
		const tapScale =
			Math.hypot(edge.across.x, edge.across.y) / Math.hypot(edge.along.x, edge.along.y);
		const tapX = edge.along.x * tapScale;
		const tapY = edge.along.y * tapScale;
		for (let station = 0; station < EDGE_STATIONS; station++) {
			for (let i = 0; i < EDGE_PROFILE_LENGTH; i++, out += 4) {
				const cx = edge.start.x + edge.along.x * station + edge.across.x * (i - profileCenter);
				const cy = edge.start.y + edge.along.y * station + edge.across.y * (i - profileCenter);
				for (let tap = -EDGE_TANGENT_TAPS; tap <= EDGE_TANGENT_TAPS; tap++) {
					const x = Math.min(Math.max(cx + tapX * tap, 0), width - 1.001);
					const y = Math.min(Math.max(cy + tapY * tap, 0), height - 1.001);
					const x0 = Math.floor(x);
					const y0 = Math.floor(y);
					const fx = x - x0;
					const fy = y - y0;
					const topLeft = (y0 * width + x0) * 4;
					const bottomLeft = topLeft + width * 4;
					for (let c = 0; c < 3; c++) {
						const top = pixels[topLeft + c] * (1 - fx) + pixels[topLeft + 4 + c] * fx;
						const bottom = pixels[bottomLeft + c] * (1 - fx) + pixels[bottomLeft + 4 + c] * fx;
						profiles[out + c] += (top * (1 - fy) + bottom * fy) / taps;
					}
				}
			}
		}
	}
	return profiles;
}

/**
 * Colour distance (0-255 scale, lightly smoothed) of each profile sample from the frame's
 * colour, which is taken from the inner end of the profile.
 */
function distanceFromFrame(profile: Float32Array): Float32Array {
	const length = profile.length / 4;
	const frame = [0, 0, 0];
	for (let i = length - EDGE_REFERENCE_SAMPLES; i < length; i++) {
		for (let c = 0; c < 3; c++) frame[c] += profile[i * 4 + c] / EDGE_REFERENCE_SAMPLES;
	}

	const raw = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		raw[i] = Math.hypot(
			profile[i * 4] - frame[0],
			profile[i * 4 + 1] - frame[1],
			profile[i * 4 + 2] - frame[2]
		);
	}
	const distance = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		distance[i] = (raw[Math.max(i - 1, 0)] + 2 * raw[i] + raw[Math.min(i + 1, length - 1)]) / 4;
	}
	return distance;
}

/**
 * Find where a profile crosses the polaroid's edge.
 *
 * Walking outwards from the frame, the edge starts at the first place the colour departs
 * from the frame's by more than `threshold` and stays there. The first departure is used,
 * rather than the strongest gradient, because what lies beyond the edge varies: often a
 * shadow that ramps off over a millimetre or more, of which only the inner end is the
 * polaroid's edge.
 *
 * @param distance - Output of distanceFromFrame; index 0 is outside the polaroid
 * @returns The edge position as a fractional sample index, or NaN if no edge was found
 */
function locateEdge(distance: Float32Array, threshold: number): number {
	for (let start = distance.length - EDGE_REFERENCE_SAMPLES - 1; start >= EDGE_SUSTAIN; start--) {
		let sustained = true;
		for (let k = 0; k < EDGE_SUSTAIN && sustained; k++) {
			sustained = distance[start - k] > threshold;
		}
		if (!sustained) continue;

		// How tall and how steep is the step that starts here?
		let height = 0;
		let steepness = 0;
		for (let i = start; i >= Math.max(start - EDGE_BLUR_SAMPLES, 0); i--) {
			height = Math.max(height, distance[i]);
			steepness = Math.max(steepness, distance[i] - distance[i + 1]);
		}
		// A sharp step is an edge that the scanner has blurred, so the edge is half way up
		// it. A gentle one is the start of a shadow falling away from the edge, so the edge
		// is where it begins. In between, blend, so that similar profiles get similar answers.
		const sharpness = Math.min(
			Math.max((steepness - EDGE_GENTLE_STEP) / (EDGE_SHARP_STEP - EDGE_GENTLE_STEP), 0),
			1
		);
		const level = threshold + Math.max(height / 2 - threshold, 0) * sharpness;
		let i = start;
		while (distance[i] <= level) i--;
		return i + (distance[i] - level) / (distance[i] - distance[i + 1]);
	}
	return NaN;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Fit a rectangle to the edges located in `profiles`.
 *
 * The points located along each edge give a line, `offset = a + b * position`, relative to the
 * estimated edge. Because a polaroid is rigid and a flatbed has no perspective, all four
 * edges share one rotation `b`; it is estimated from all of them at once (as the median
 * slope between pairs of points, which shrugs off outliers such as dust or a touching
 * neighbour), and then each edge gets its own median offset `a`.
 *
 * @param corners - The estimated corners; edge `e` runs from corner `e` to corner `e + 1`
 * @param profiles - The profiles sampled for `edgeProfileSpecs(corners)`
 * @returns The refined corners, in the same order, and whether all four edges were located.
 * Edges that can't be located keep their estimate, and if the fit is implausible the
 * estimate is returned unchanged.
 */
function refineRectangle(
	corners: Point[],
	profiles: Float32Array
): { corners: Point[]; complete: boolean } {
	const specs = edgeProfileSpecs(corners);
	const profileCenter = (EDGE_PROFILE_LENGTH - 1) / 2;
	const profileSize = EDGE_PROFILE_LENGTH * 4;

	// Locate the edge once per segment: `position` along the edge (from its midpoint) and
	// `offset` of the located edge from the estimate (positive = further inside), in pixels
	const stationsPerSegment = EDGE_STATIONS / EDGE_SEGMENTS;
	const located = specs.map((spec, e) => {
		const stationStep = Math.hypot(spec.along.x, spec.along.y);
		const sampleStep = Math.hypot(spec.across.x, spec.across.y);

		const points: { position: number; offset: number }[] = [];
		for (let segment = 0; segment < EDGE_SEGMENTS; segment++) {
			// The median of the segment's profiles: the frame's texture, dust and scratches
			// drop out, leaving a clean profile that even a faint edge shadow stands out in
			const firstStation = e * EDGE_STATIONS + segment * stationsPerSegment;
			const profile = new Float32Array(profileSize);
			const values = new Array<number>(stationsPerSegment);
			for (let i = 0; i < profileSize; i++) {
				for (let station = 0; station < stationsPerSegment; station++) {
					values[station] = profiles[(firstStation + station) * profileSize + i];
				}
				profile[i] = median(values);
			}

			const distance = distanceFromFrame(profile);
			// How much the frame itself still varies sets the bar for having left it
			const frameNoise = Math.max(...distance.subarray(-EDGE_REFERENCE_SAMPLES));
			const index = locateEdge(distance, Math.max(EDGE_MIN_CONTRAST, 3 * frameNoise));
			if (Number.isNaN(index)) continue;

			const middleStation = (segment + 0.5) * stationsPerSegment - 0.5;
			points.push({
				position: (middleStation - (EDGE_STATIONS - 1) / 2) * stationStep,
				offset: (index - profileCenter) * sampleStep
			});
		}
		return points.length >= EDGE_SEGMENTS * EDGE_MIN_VALID_FRACTION ? points : [];
	});

	// Shared rotation: median slope over all pairs of points on the same edge
	const slopes: number[] = [];
	for (const points of located) {
		for (let i = 0; i < points.length; i++) {
			for (let j = i + 1; j < points.length; j++) {
				slopes.push(
					(points[j].offset - points[i].offset) / (points[j].position - points[i].position)
				);
			}
		}
	}
	if (slopes.length == 0) return { corners, complete: false };
	const slope = median(slopes);
	if (Math.abs(Math.atan(slope)) > EDGE_MAX_ROTATION) return { corners, complete: false };

	// Each edge becomes the line through `point` with direction `direction`
	const lines = specs.map((spec, e) => {
		const points = located[e];
		const offset = points.length ? median(points.map((p) => p.offset - slope * p.position)) : 0;
		const a = corners[e];
		const b = corners[(e + 1) % 4];
		const sampleStep = Math.hypot(spec.across.x, spec.across.y);
		const stationStep = Math.hypot(spec.along.x, spec.along.y);
		const normal = { x: spec.across.x / sampleStep, y: spec.across.y / sampleStep };
		const tangent = { x: spec.along.x / stationStep, y: spec.along.y / stationStep };
		return {
			point: {
				x: (a.x + b.x) / 2 + normal.x * offset,
				y: (a.y + b.y) / 2 + normal.y * offset
			},
			direction: { x: tangent.x + normal.x * slope, y: tangent.y + normal.y * slope }
		};
	});

	// Corner `e` is where edge `e - 1` meets edge `e`
	const refined = corners.map((_, e) => {
		const p = lines[(e + 3) % 4];
		const q = lines[e];
		const cross = p.direction.x * q.direction.y - p.direction.y * q.direction.x;
		const t =
			((q.point.x - p.point.x) * q.direction.y - (q.point.y - p.point.y) * q.direction.x) / cross;
		return { x: p.point.x + p.direction.x * t, y: p.point.y + p.direction.y * t };
	});
	return { corners: refined, complete: located.every((points) => points.length > 0) };
}

/**
 * WebGPU half of the processing pipeline (the rest of this section, up to GpuProcessor).
 *
 * The GPU owns the two full-resolution stages: shrinking the scan down to detection
 * size, and warping + sharpening each detected polaroid. The scan is uploaded to a
 * texture once and never read back at full resolution; only the small detection image
 * crosses back to the CPU (for OpenCV).
 */

/** A 2D point in source-image pixel coordinates (integer = pixel centre, as in OpenCV). */
interface Point {
	x: number;
	y: number;
}

/**
 * Affine mapping from output pixels to source pixels:
 * `source = origin + x * du + y * dv` for the output pixel at integer position (x, y).
 */
interface WarpMapping {
	origin: Point;
	du: Point;
	dv: Point;
}

const FULLSCREEN_VERTEX_WGSL = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	let corners = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	return vec4f(corners[i], 0.0, 1.0);
}
`;

/**
 * Area-weighted box filter, equivalent to cv.resize(..., INTER_AREA): every output pixel
 * is the coverage-weighted mean of the source texels its footprint overlaps.
 */
const DOWNSAMPLE_WGSL = /* wgsl */ `
struct Params {
	srcSize: vec2f,
	// Source texels per output pixel on each axis
	scale: vec2f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	// Enlarging (or 1:1): there is no footprint to average, so interpolate instead
	if (params.scale.x <= 1.0 || params.scale.y <= 1.0) {
		return textureSampleLevel(src, samp, pos.xy * params.scale / params.srcSize, 0.0);
	}

	let lo = floor(pos.xy) * params.scale;
	let hi = lo + params.scale;
	let first = vec2i(floor(lo));
	let last = vec2i(ceil(hi));
	let maxTexel = vec2i(params.srcSize) - vec2i(1);

	var sum = vec4f(0.0);
	for (var y = first.y; y < last.y; y++) {
		let wy = max(min(f32(y) + 1.0, hi.y) - max(f32(y), lo.y), 0.0);
		for (var x = first.x; x < last.x; x++) {
			let wx = max(min(f32(x) + 1.0, hi.x) - max(f32(x), lo.x), 0.0);
			sum += textureLoad(src, clamp(vec2i(x, y), vec2i(0), maxTexel), 0) * (wx * wy);
		}
	}
	return sum / (params.scale.x * params.scale.y);
}
`;

/**
 * Largest median kernel the GPU path handles; bigger (or invalid) sizes are left to OpenCV.
 * The shader's cost grows with the kernel area while OpenCV switches to a constant-time
 * histogram algorithm above 5x5, so OpenCV is the faster of the two from 7x7 upwards.
 */
const MAX_GPU_MEDIAN_KERNEL = 5;

/**
 * Per-channel median filter, equivalent to cv.medianBlur (exact median, replicated borders).
 *
 * The median is found with a bitwise binary search instead of a sort: for each bit from the
 * top down, keep the bit if more than half of the neighbourhood is >= the candidate value.
 * That is 8 branch-free passes over the samples, for all four channels at once.
 */
function medianShader(kernelSize: number): string {
	const radius = (kernelSize - 1) / 2;
	const count = kernelSize * kernelSize;
	return /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let center = vec2i(pos.xy);
	let maxTexel = vec2i(textureDimensions(src)) - vec2i(1);

	var samples: array<vec4u, ${count}>;
	var n = 0;
	for (var dy = -${radius}; dy <= ${radius}; dy++) {
		for (var dx = -${radius}; dx <= ${radius}; dx++) {
			let texel = clamp(center + vec2i(dx, dy), vec2i(0), maxTexel);
			samples[n] = vec4u(round(textureLoad(src, texel, 0) * 255.0));
			n++;
		}
	}

	var median = vec4u(0u);
	for (var bit = 7; bit >= 0; bit--) {
		let candidate = median | vec4u(1u << u32(bit));
		var atLeast = vec4u(0u);
		for (var i = 0; i < ${count}; i++) {
			atLeast += vec4u(samples[i] >= candidate);
		}
		median = select(median, candidate, atLeast > vec4u(${Math.floor(count / 2)}u));
	}
	return vec4f(median) / 255.0;
}
`;
}

/**
 * Warp + sharpen in a single pass. The sharpen kernel (5 at the centre, -1 on the four
 * neighbours) is evaluated in output space, so each tap is a bilinear lookup of the
 * warped image. Borders are mirrored the same way as OpenCV's BORDER_REFLECT_101.
 */
const EXTRACT_WGSL = /* wgsl */ `
struct Params {
	origin: vec2f,
	du: vec2f,
	dv: vec2f,
	srcSize: vec2f,
	dstSize: vec2f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn warped(pixel: vec2f) -> vec3f {
	let maxPixel = params.dstSize - vec2f(1.0);
	let p = maxPixel - abs(maxPixel - abs(pixel));
	let s = params.origin + p.x * params.du + p.y * params.dv;
	return textureSampleLevel(src, samp, (s + vec2f(0.5)) / params.srcSize, 0.0).rgb;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let pixel = floor(pos.xy);
	let sharpened = 5.0 * warped(pixel)
		- warped(pixel + vec2f(-1.0, 0.0))
		- warped(pixel + vec2f(1.0, 0.0))
		- warped(pixel + vec2f(0.0, -1.0))
		- warped(pixel + vec2f(0.0, 1.0));
	return vec4f(clamp(sharpened, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

/**
 * Sample the edge profiles described by EdgeProfileSpec (see "Edge refinement"). Each row of
 * the target is one profile; rows are ordered by edge, then station. Output is RGB, 0-255.
 */
const EDGE_PROFILE_WGSL = /* wgsl */ `
struct Edge {
	start: vec2f,
	along: vec2f,
	across: vec2f,
	padding: vec2f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<storage, read> edges: array<Edge>;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let row = u32(pos.y);
	let edge = edges[row / ${EDGE_STATIONS}u];
	let center = edge.start
		+ edge.along * f32(row % ${EDGE_STATIONS}u)
		+ edge.across * (floor(pos.x) - ${(EDGE_PROFILE_LENGTH - 1) / 2});
	let tap = normalize(edge.along) * length(edge.across);
	let size = vec2f(textureDimensions(src));

	var sum = vec3f(0.0);
	for (var i = -${EDGE_TANGENT_TAPS}; i <= ${EDGE_TANGENT_TAPS}; i++) {
		sum += textureSampleLevel(src, samp, (center + tap * f32(i) + vec2f(0.5)) / size, 0.0).rgb;
	}
	return vec4f(sum * (255.0 / ${2 * EDGE_TANGENT_TAPS + 1}.0), 1.0);
}
`;

const DETECTION_FORMAT: GPUTextureFormat = 'rgba8unorm';

/** Float target so the averaged profiles keep their sub-integer precision */
const EDGE_PROFILE_FORMAT: GPUTextureFormat = 'rgba32float';

/** Edges sampled per pass, keeping the target's height within every device's texture limit */
const MAX_EDGES_PER_PASS = Math.floor(8192 / EDGE_STATIONS);

/** Buffer copies require each row to be padded to a multiple of 256 bytes. */
const COPY_ROW_ALIGNMENT = 256;

class GpuProcessor {
	/** Set once the device is lost; the processor must not be used afterwards. */
	lost = false;

	private device: GPUDevice;
	private outputFormat: GPUTextureFormat;
	private sampler: GPUSampler;
	private vertex: GPUVertexState;
	private downsamplePipeline: GPURenderPipeline;
	/** Median pipelines by kernel size (the size is baked into the shader) */
	private medianPipelines = new Map<number, GPURenderPipeline>();
	private extractPipeline: GPURenderPipeline;
	private edgeProfilePipeline: GPURenderPipeline;
	private source: GPUTexture | undefined;

	private constructor(device: GPUDevice) {
		this.device = device;
		this.outputFormat = navigator.gpu.getPreferredCanvasFormat();
		this.sampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});

		const vertex = (this.vertex = {
			module: device.createShaderModule({ code: FULLSCREEN_VERTEX_WGSL }),
			entryPoint: 'vs'
		});
		this.downsamplePipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex,
			fragment: {
				module: device.createShaderModule({ code: DOWNSAMPLE_WGSL }),
				entryPoint: 'fs',
				targets: [{ format: DETECTION_FORMAT }]
			}
		});
		this.extractPipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex,
			fragment: {
				module: device.createShaderModule({ code: EXTRACT_WGSL }),
				entryPoint: 'fs',
				targets: [{ format: this.outputFormat }]
			}
		});

		this.edgeProfilePipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex,
			fragment: {
				module: device.createShaderModule({ code: EDGE_PROFILE_WGSL }),
				entryPoint: 'fs',
				targets: [{ format: EDGE_PROFILE_FORMAT }]
			}
		});

		device.lost.then((info) => {
			console.warn('WebGPU device lost:', info.message);
			this.lost = true;
		});
	}

	/**
	 * Request a device. Resolves to `undefined` when WebGPU is unavailable, in which case
	 * the caller should use the OpenCV-only path.
	 */
	static async create(): Promise<GpuProcessor | undefined> {
		try {
			if (!('gpu' in navigator)) return undefined;
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) return undefined;
			// Flatbed scans routinely exceed the default 8192px texture limit
			const device = await adapter.requestDevice({
				requiredLimits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D }
			});
			return new GpuProcessor(device);
		} catch (error) {
			console.warn('WebGPU unavailable, using OpenCV only:', error);
			return undefined;
		}
	}

	/** Whether an image of this size fits in a single texture on this device. */
	supports(width: number, height: number): boolean {
		const max = this.device.limits.maxTextureDimension2D;
		return width <= max && height <= max;
	}

	get hasSource(): boolean {
		return this.source !== undefined;
	}

	/**
	 * Upload the scan. Rejects if the GPU refuses the allocation (e.g. out of memory).
	 */
	async setSource(image: ImageBitmap): Promise<void> {
		this.releaseSource();

		this.device.pushErrorScope('out-of-memory');
		this.device.pushErrorScope('validation');
		const texture = this.device.createTexture({
			size: [image.width, image.height],
			format: 'rgba8unorm',
			// RENDER_ATTACHMENT is required by copyExternalImageToTexture
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT
		});
		this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [
			image.width,
			image.height
		]);
		const errors = await Promise.all([this.device.popErrorScope(), this.device.popErrorScope()]);
		const error = errors.find((e) => e !== null);
		if (error) {
			texture.destroy();
			throw new Error(`Failed to upload image to the GPU: ${error.message}`);
		}
		this.source = texture;
	}

	releaseSource() {
		this.source?.destroy();
		this.source = undefined;
	}

	/** Whether the median blur for this kernel size can run on the GPU. */
	supportsMedian(kernelSize: number): boolean {
		return (
			Number.isInteger(kernelSize) &&
			kernelSize % 2 === 1 &&
			kernelSize >= 3 &&
			kernelSize <= MAX_GPU_MEDIAN_KERNEL
		);
	}

	/**
	 * Build the detection image: shrink the uploaded scan to `width` x `height`, optionally
	 * median-blur it with `medianKernel`, and read the result back as RGBA.
	 */
	async createDetectionImage(
		width: number,
		height: number,
		medianKernel?: number
	): Promise<ImageData> {
		const source = this.requireSource();
		const size = [width, height];
		const downsized = this.device.createTexture({
			size,
			format: DETECTION_FORMAT,
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_SRC
		});
		const uniforms = this.createUniforms([
			source.width,
			source.height,
			source.width / width,
			source.height / height
		]);

		const encoder = this.device.createCommandEncoder();
		this.encodePass(encoder, this.downsamplePipeline, downsized.createView(), [
			source.createView(),
			this.sampler,
			{ buffer: uniforms }
		]);

		let result = downsized;
		if (medianKernel !== undefined) {
			result = this.device.createTexture({
				size,
				format: DETECTION_FORMAT,
				usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
			});
			this.encodePass(encoder, this.getMedianPipeline(medianKernel), result.createView(), [
				downsized.createView()
			]);
		}

		const pixels = new Uint8ClampedArray(await this.submitAndRead(encoder, result, 4));

		uniforms.destroy();
		downsized.destroy();
		if (result !== downsized) result.destroy();
		return new ImageData(pixels, width, height);
	}

	/**
	 * Sample the profiles used to refine each polaroid's edges from the uploaded scan.
	 * Returns RGBA (0-255) per sample, ordered by edge, then station, then position along
	 * the profile.
	 */
	async sampleEdgeProfiles(edges: EdgeProfileSpec[]): Promise<Float32Array> {
		const source = this.requireSource();
		const rowSize = EDGE_PROFILE_LENGTH * 4;
		const profiles = new Float32Array(edges.length * EDGE_STATIONS * rowSize);

		for (let first = 0; first < edges.length; first += MAX_EDGES_PER_PASS) {
			const batch = edges.slice(first, first + MAX_EDGES_PER_PASS);
			const target = this.device.createTexture({
				size: [EDGE_PROFILE_LENGTH, batch.length * EDGE_STATIONS],
				format: EDGE_PROFILE_FORMAT,
				usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
			});
			const specs = this.createBuffer(
				batch.flatMap((edge) => [
					edge.start.x,
					edge.start.y,
					edge.along.x,
					edge.along.y,
					edge.across.x,
					edge.across.y,
					0,
					0
				]),
				GPUBufferUsage.STORAGE
			);

			const encoder = this.device.createCommandEncoder();
			this.encodePass(encoder, this.edgeProfilePipeline, target.createView(), [
				source.createView(),
				this.sampler,
				{ buffer: specs }
			]);
			const bytes = await this.submitAndRead(encoder, target, 16);
			profiles.set(new Float32Array(bytes), first * EDGE_STATIONS * rowSize);

			specs.destroy();
			target.destroy();
		}
		return profiles;
	}

	/**
	 * Warp the region described by `mapping` out of the uploaded scan, sharpen it, and
	 * return it as an ImageBitmap. Nothing is read back to the CPU.
	 */
	extract(mapping: WarpMapping, width: number, height: number): ImageBitmap {
		const source = this.requireSource();
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('webgpu');
		if (!context) throw new Error('Failed to create a WebGPU canvas context');
		context.configure({ device: this.device, format: this.outputFormat, alphaMode: 'opaque' });

		const uniforms = this.createUniforms([
			mapping.origin.x,
			mapping.origin.y,
			mapping.du.x,
			mapping.du.y,
			mapping.dv.x,
			mapping.dv.y,
			source.width,
			source.height,
			width,
			height
		]);

		const encoder = this.device.createCommandEncoder();
		this.encodePass(encoder, this.extractPipeline, context.getCurrentTexture().createView(), [
			source.createView(),
			this.sampler,
			{ buffer: uniforms }
		]);
		this.device.queue.submit([encoder.finish()]);
		uniforms.destroy();

		return canvas.transferToImageBitmap();
	}

	/** Resolves once all submitted GPU work has finished executing. */
	finished(): Promise<undefined> {
		return this.device.queue.onSubmittedWorkDone();
	}

	private getMedianPipeline(kernelSize: number): GPURenderPipeline {
		let pipeline = this.medianPipelines.get(kernelSize);
		if (!pipeline) {
			pipeline = this.device.createRenderPipeline({
				layout: 'auto',
				vertex: this.vertex,
				fragment: {
					module: this.device.createShaderModule({ code: medianShader(kernelSize) }),
					entryPoint: 'fs',
					targets: [{ format: DETECTION_FORMAT }]
				}
			});
			this.medianPipelines.set(kernelSize, pipeline);
		}
		return pipeline;
	}

	private createUniforms(values: number[]): GPUBuffer {
		return this.createBuffer(values, GPUBufferUsage.UNIFORM);
	}

	private createBuffer(values: number[], usage: GPUBufferUsageFlags): GPUBuffer {
		const data = new Float32Array(values);
		const buffer = this.device.createBuffer({
			size: data.byteLength,
			usage: usage | GPUBufferUsage.COPY_DST
		});
		this.device.queue.writeBuffer(buffer, 0, data);
		return buffer;
	}

	/**
	 * Submit `encoder`, followed by a copy of `texture` back to the CPU. Resolves to the
	 * texture's contents with the row padding that buffer copies require removed.
	 */
	private async submitAndRead(
		encoder: GPUCommandEncoder,
		texture: GPUTexture,
		bytesPerPixel: number
	): Promise<ArrayBuffer> {
		const { width, height } = texture;
		const rowBytes = width * bytesPerPixel;
		const bytesPerRow = Math.ceil(rowBytes / COPY_ROW_ALIGNMENT) * COPY_ROW_ALIGNMENT;
		const readback = this.device.createBuffer({
			size: bytesPerRow * height,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});
		encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow }, [width, height]);
		this.device.queue.submit([encoder.finish()]);

		await readback.mapAsync(GPUMapMode.READ);
		const padded = new Uint8Array(readback.getMappedRange());
		const pixels = new Uint8Array(rowBytes * height);
		for (let row = 0; row < height; row++) {
			const start = row * bytesPerRow;
			pixels.set(padded.subarray(start, start + rowBytes), row * rowBytes);
		}
		readback.unmap();
		readback.destroy();
		return pixels.buffer;
	}

	/**
	 * Encode a fullscreen pass of `pipeline` into `target`. `resources` are bound in order,
	 * starting at binding 0.
	 */
	private encodePass(
		encoder: GPUCommandEncoder,
		pipeline: GPURenderPipeline,
		target: GPUTextureView,
		resources: GPUBindingResource[]
	) {
		const bindGroup = this.device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: resources.map((resource, binding) => ({ binding, resource }))
		});

		const pass = encoder.beginRenderPass({
			colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store' }]
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	}

	private requireSource(): GPUTexture {
		if (!this.source) throw new Error('No image has been uploaded to the GPU');
		return this.source;
	}
}

/** Resolves to the WebGPU processor, or undefined when WebGPU is unavailable. */
const gpuReady: Promise<GpuProcessor | undefined> = GpuProcessor.create();

addEventListener('message', (event: MessageEvent<WorkerMessageEvent>) => {
	console.log('RECEIVED MESSAGE FROM MAIN', event);
	const message = event.data;
	switch (message.type) {
		case 'PROCESS IMAGE':
			processingQueue = processingQueue
				.then(async () => {
					if (message.image) {
						await releaseSource();
						sourceImage = message.image;
					}
					const extracted = await processImage(message.params);
					// Send the extracted polaroids to the main thread after all are processed
					postStructuredMessage(
						{ type: 'EXTRACTED POLAROIDS', extracted, transferable: true },
						extracted
					);
				})
				.catch((error) => {
					console.error('Failed to process image:', error);
					// Let the main thread know the run is over
					postStructuredMessage({ type: 'EXTRACTED POLAROIDS', extracted: [] });
				});
			break;
		case 'PROCESS FOLDER':
			batchCancelled = false;
			processingQueue = processingQueue
				.then(() => processFolder(message.scans, message.output, message.params))
				.catch((error) => {
					console.error('Failed to process folder:', error);
					postStructuredMessage({ type: 'BATCH FINISHED', cancelled: true, totalMs: 0 });
				});
			break;
		case 'CANCEL BATCH':
			batchCancelled = true;
			break;
		case 'RELEASE IMAGE':
			processingQueue = processingQueue.then(releaseSource);
			break;
	}
});

/** Width of the thumbnails that batch mode reports back for each extracted polaroid */
const BATCH_THUMBNAIL_WIDTH = 320;

/** Colour (RGB) of the watershed barriers in the contour overlay */
const CONTOUR_OVERLAY_COLOR = [255, 59, 48];

/** Set by CANCEL BATCH; the batch stops before starting its next scan */
let batchCancelled = false;

/**
 * Batch mode: process every scan in `scans` and save the extracted polaroids as PNGs in
 * `output`, named after the scan they came from.
 *
 * Everything happens in the worker, so no full-size image data passes through the main
 * thread: files are read, decoded, processed, encoded and written here, and only progress
 * (with thumbnails) is reported back. The next scan is decoded while the current one is
 * being processed.
 *
 * @param scans - The scans to process, in order
 * @param output - Folder to save into; needs `readwrite` permission
 * @param params - Processing parameters applied to every scan
 */
async function processFolder(
	scans: FileSystemFileHandle[],
	output: FileSystemDirectoryHandle,
	params: ProcessImageParams
) {
	const started = performance.now();

	const decode = (scan: FileSystemFileHandle) => {
		const image = scan.getFile().then((file) => createImageBitmap(file));
		// A failure is reported when the image is awaited; don't let it surface as unhandled first
		image.catch(() => {});
		return image;
	};

	let next = scans.length > 0 ? decode(scans[0]) : undefined;
	let index = 0;
	for (; index < scans.length && !batchCancelled; index++) {
		const image = next!;
		next = index + 1 < scans.length ? decode(scans[index + 1]) : undefined;

		const scan = scans[index];
		try {
			await releaseSource();
			sourceImage = await image;
			const polaroids = await processImage(params, false);

			const baseName = scan.name.replace(/\.[^.]+$/, '');
			const saved = await Promise.all(
				polaroids.map(async (polaroid, i) => {
					const canvas = new OffscreenCanvas(polaroid.width, polaroid.height);
					canvas.getContext('2d')?.drawImage(polaroid, 0, 0);
					const png = await canvas.convertToBlob({ type: 'image/png' });

					const name = `${baseName}-${i + 1}.png`;
					const file = await output.getFileHandle(name, { create: true });
					const writable = await file.createWritable();
					await writable.write(png);
					await writable.close();

					const thumbnail = await createImageBitmap(polaroid, {
						resizeWidth: BATCH_THUMBNAIL_WIDTH,
						resizeQuality: 'high'
					});
					polaroid.close();
					return { name, thumbnail };
				})
			);

			postStructuredMessage(
				{ type: 'BATCH PROGRESS', index, saved },
				saved.map((polaroid) => polaroid.thumbnail)
			);
		} catch (error) {
			console.error(`Failed to process ${scan.name}:`, error);
			postStructuredMessage({
				type: 'BATCH PROGRESS',
				index,
				saved: [],
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	// A scan that was decoded ahead but never processed (the batch was cancelled)
	next?.then((image) => image.close()).catch(() => {});
	await releaseSource();
	postStructuredMessage({
		type: 'BATCH FINISHED',
		cancelled: index < scans.length,
		totalMs: performance.now() - started
	});
}

/** Free every copy of the current scan (decoded bitmap, GPU texture, WASM heap). */
async function releaseSource() {
	sourceImage?.close();
	sourceImage = undefined;
	sourceMat?.delete();
	sourceMat = undefined;
	(await gpuReady)?.releaseSource();
}

/**
 * Send a typed message back to the main thread.
 * @param message - The structured worker message to send
 * @param transferList - Optional list of Transferable objects to transfer ownership
 */
function postStructuredMessage(message: WorkerMessageEvent, transferList?: Transferable[]) {
	self.postMessage(message, transferList || []);
}

self.cv.onRuntimeInitialized = () => {
	postStructuredMessage({ type: 'WORKER READY' });
};

/**
 * Render the watershed barriers as a transparent overlay the size of the detection image,
 * to be stretched over the scan by the main thread.
 * @param labels - Watershed output; barrier pixels are labelled -1
 */
function createContourOverlay(labels: Int32Array, width: number, height: number): ImageBitmap {
	const pixels = new Uint8ClampedArray(width * height * 4);
	// The watershed also marks the outermost pixels of the image as barriers; leave those out
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			if (labels[y * width + x] != -1) continue;
			// Two pixels thick, so the lines survive being scaled down for display
			for (const i of [y * width + x, y * width + x + 1, (y + 1) * width + x]) {
				pixels[i * 4] = CONTOUR_OVERLAY_COLOR[0];
				pixels[i * 4 + 1] = CONTOUR_OVERLAY_COLOR[1];
				pixels[i * 4 + 2] = CONTOUR_OVERLAY_COLOR[2];
				pixels[i * 4 + 3] = 255;
			}
		}
	}

	const canvas = new OffscreenCanvas(width, height);
	canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
	return canvas.transferToImageBitmap();
}

/**
 * Copy the full-resolution scan onto the WASM heap for the OpenCV-only path.
 * The Mat is cached until the source image is released.
 */
function getSourceMat(image: ImageBitmap): OpenCV.Mat {
	if (sourceMat) return sourceMat;

	const canvas = new OffscreenCanvas(image.width, image.height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to create a 2D canvas context');
	ctx.drawImage(image, 0, 0);
	const mat = self.cv.matFromImageData(ctx.getImageData(0, 0, image.width, image.height));
	sourceMat = mat;
	return mat;
}

/**
 * Pick the backend for this run and make sure the scan is where that backend needs it.
 * Falls back to OpenCV when WebGPU is missing, lost, or can't hold the image.
 */
async function prepareBackend(image: ImageBitmap): Promise<GpuProcessor | undefined> {
	const gpu = await gpuReady;
	if (!gpu || gpu.lost || !gpu.supports(image.width, image.height)) return undefined;
	try {
		if (!gpu.hasSource) await gpu.setSource(image);
		return gpu;
	} catch (error) {
		console.warn('Falling back to OpenCV:', error);
		return undefined;
	}
}

/**
 * Main image processing function that detects and extracts polaroid photos.
 *
 * @param params - Processing parameters to control detection sensitivity
 * @returns The extracted polaroids
 *
 * @remarks
 * The two full-resolution stages (1 and 8-9) run on WebGPU when it is available; the
 * detection stages in between always run in OpenCV on the downsized image.
 *
 * The processing pipeline consists of:
 * 1. Resize image based on expected polaroid count
 * 2. Apply median blur to reduce noise
 * 3. Convert to grayscale and apply threshold
 * 4. Morphological operations (erosion/dilation) to clean up edges
 * 5. Distance transform to identify foreground regions
 * 6. Watershed algorithm to segment individual polaroids
 * 7. Contour detection to find polaroid boundaries
 * 8. Perspective transform to extract and straighten each polaroid
 * 9. Sharpen filter for final output quality
 */
async function processImage(
	params: ProcessImageParams = {},
	sendPreview = true
): Promise<ImageBitmap[]> {
	const image = sourceImage;
	if (!image) {
		console.warn('PROCESS IMAGE received before any image was provided');
		return [];
	}

	// Default values
	const {
		medianBlurKernel = 7,
		thresholdValue = 100,
		structuringElementSize = 10,
		distanceTransformThreshold = 0.9,
		surfaceAreaToleranceLow = 0.8,
		surfaceAreaToleranceHigh = 1.2
	} = params;

	let cv: typeof OpenCV = self.cv;

	const timer = createStageTimer();

	await gpuReady;
	timer.mark('webgpu init');
	const gpu = await prepareBackend(image);
	const backend: ProcessingBackend = gpu ? 'webgpu' : 'opencv';
	if (!gpu) getSourceMat(image);
	timer.mark('source upload');

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
	let newHeight = Math.round((newWidth / image.width) * image.height);

	// Save the ratio the image was resized by on each axis
	const resizeWidthRatio = newWidth / image.width;
	const resizeHeightRatio = newHeight / image.height;

	console.log('Original Image Size: ', image.width, image.height);
	console.log('Resized Image Size: ', newWidth, newHeight);
	console.log('Resize Ratios: ', resizeWidthRatio, resizeHeightRatio);

	let src: OpenCV.Mat;
	if (gpu?.supportsMedian(medianBlurKernel)) {
		// Resize and blur in one trip to the GPU
		src = cv.matFromImageData(
			await gpu.createDetectionImage(newWidth, newHeight, medianBlurKernel)
		);
		timer.mark('downsample + median blur');
	} else {
		if (gpu) {
			src = cv.matFromImageData(await gpu.createDetectionImage(newWidth, newHeight));
		} else {
			src = new cv.Mat();
			cv.resize(getSourceMat(image), src, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);
		}
		timer.mark('downsample');
		// Blur the image
		cv.medianBlur(src, src, medianBlurKernel);
		timer.mark('detect: median blur');
	}

	// Convert to grayscale
	cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

	// Thresholding to isolate Polaroids
	cv.threshold(gray, gray, thresholdValue, 255, cv.THRESH_BINARY);

	// Erosion and Dilation to remove noise and get background

	// Tweak the structuring element values!!
	let M = cv.Mat.ones(structuringElementSize, structuringElementSize, cv.CV_8U); // Increase the size of the structuring element
	cv.erode(gray, gray, M);
	cv.dilate(gray, opening, M);
	timer.mark('detect: threshold + morphology');

	// Distance Transform
	cv.distanceTransform(opening, distTrans, cv.DIST_L2, 5);
	cv.normalize(distTrans, distTrans, 1, 0, cv.NORM_INF);

	// Get foreground
	cv.threshold(distTrans, polaroidsFg, distanceTransformThreshold * 1, 255, cv.THRESH_BINARY);
	polaroidsFg.convertTo(polaroidsFg, cv.CV_8U, 1, 0);
	cv.subtract(opening, polaroidsFg, unknown); // Use 'opening' instead of 'polaroidsBg'

	// Get connected components markers
	cv.connectedComponents(polaroidsFg, markers);
	timer.mark('detect: distance transform + components');

	// Shift the labels up so the background is 1, then mark the unknown region as 0.
	// Work on the heap views directly; per-pixel ptr() calls are orders of magnitude slower.
	// (The views are invalidated by WASM heap growth, so no cv allocations inside the loops.)
	const markerLabels = markers.data32S;
	const unknownPixels = unknown.data;
	for (let i = 0; i < markerLabels.length; i++) {
		markerLabels[i] = unknownPixels[i] == 255 ? 0 : markerLabels[i] + 1;
	}
	timer.mark('detect: marker loop');

	// Watershed Algorithm
	cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
	cv.watershed(src, markers);
	timer.mark('detect: watershed');

	// Draw barriers (before findContours, which modifies the markers)
	const contourOverlay = sendPreview
		? createContourOverlay(markers.data32S, newWidth, newHeight)
		: undefined;
	timer.mark('detect: contour overlay');

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
			if (area < rect.size.width * rect.size.height * MIN_POLAROID_RECTANGULARITY) {
				cnt.delete();
				continue;
			}
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

			// Check whether the center of the rectangle is inside any of the previous rectangles
			let center = rect.center;
			let overlapping = -1;
			for (let j = 0; j < polaroids.length; j++) {
				let polaroid = polaroids[j];
				let rect = polaroid.rect;
				if (
					center.x > rect.center.x - rect.size.width / 2 &&
					center.x < rect.center.x + rect.size.width / 2 &&
					center.y > rect.center.y - rect.size.height / 2 &&
					center.y < rect.center.y + rect.size.height / 2
				) {
					overlapping = j;
					break;
				}
			}

			let polaroid = {
				rect: rect,
				points: points,
				// Set once all four edges have been re-located at full resolution
				refined: false
			};

			// Clone the data
			polaroid = JSON.parse(JSON.stringify(polaroid));

			if (overlapping == -1) {
				polaroids.push(polaroid);
			} else {
				// The same polaroid is usually found twice: once as its own region and once as the
				// hole it leaves in its surroundings (one barrier width larger on every side). Keep
				// the polaroid's own outline, whichever order the contours arrive in.
				let existing = polaroids[overlapping].rect.size;
				if (rect.size.width * rect.size.height < existing.width * existing.height) {
					polaroids[overlapping] = polaroid;
				}
			}
		}
		cnt.delete();
	}

	timer.mark('detect: contours');

	// Memory cleanup
	src.delete();
	gray.delete();
	opening.delete();
	polaroidsBg.delete();
	polaroidsFg.delete();
	distTrans.delete();
	unknown.delete();
	markers.delete();
	M.delete();
	contours.delete();
	hierarchy.delete();

	// Apply the resize ratios to the polaroid rects and points to get the original image coordinates
	for (let polaroid of polaroids) {
		polaroid.rect.size.width /= resizeWidthRatio;
		polaroid.rect.size.height /= resizeHeightRatio;
		polaroid.rect.center.x /= resizeWidthRatio;
		polaroid.rect.center.y /= resizeHeightRatio;

		for (let j = 0; j < 4; j++) {
			polaroid.points[j].x /= resizeWidthRatio;
			polaroid.points[j].y /= resizeHeightRatio;
		}
	}

	// The corners so far were found on the downsized image, so they are only accurate to a few
	// full-resolution pixels. Re-locate each edge in the full-resolution scan.
	for (let pass = 0; pass < EDGE_REFINE_PASSES && polaroids.length > 0; pass++) {
		const edges = polaroids.flatMap((polaroid) => edgeProfileSpecs(polaroid.points));
		const profiles = gpu
			? await gpu.sampleEdgeProfiles(edges)
			: sampleEdgeProfiles(getSourceMat(image), edges);
		const profilesPerPolaroid = 4 * EDGE_STATIONS * EDGE_PROFILE_LENGTH * 4;
		polaroids.forEach((polaroid, i) => {
			const refined = refineRectangle(
				polaroid.points,
				profiles.subarray(i * profilesPerPolaroid, (i + 1) * profilesPerPolaroid)
			);
			polaroid.points = refined.corners;
			polaroid.refined = refined.complete;
		});
	}
	timer.mark('refine edges');

	// The outlines are drawn over the scan by the main thread, in full-resolution coordinates
	if (contourOverlay) {
		postStructuredMessage(
			{
				type: 'UPDATE PREVIEW',
				width: image.width,
				height: image.height,
				outlines: polaroids.map((polaroid) => ({
					corners: polaroid.points,
					refined: polaroid.refined
				})),
				contours: contourOverlay,
				transferable: true
			},
			[contourOverlay]
		);
	}

	// Extract each polaroid from the original image
	const extractedPolaroids: ImageBitmap[] = [];
	for (let i = 0; i < polaroids.length; i++) {
		let polaroid = polaroids[i];

		// Extract the polaroid from the original image using the points as the four corners of the polaroid
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

		// Create new points for the extracted polaroid using the width and height, trimming a fraction of the width or height from each edge to remove any border
		const edgeBuffer = polaroid.refined ? REFINED_EDGE_CROP : UNREFINED_EDGE_CROP;
		const widthEdgeBuffer = extractedPolaroidWidth * edgeBuffer;
		const heightEdgeBuffer = extractedPolaroidHeight * edgeBuffer;
		const outputWidth = Math.floor(extractedPolaroidWidth);
		const outputHeight = Math.floor(extractedPolaroidHeight);

		if (gpu) {
			// The corners form a rectangle, so mapping them onto the (edge-buffered) output
			// rectangle is affine: points[0] is the top-left, points[1] the top-right and
			// points[3] the bottom-left.
			const [p0, p1, , p3] = polaroid.points;
			const spanX = extractedPolaroidWidth + 2 * widthEdgeBuffer;
			const spanY = extractedPolaroidHeight + 2 * heightEdgeBuffer;
			const du = { x: (p1.x - p0.x) / spanX, y: (p1.y - p0.y) / spanX };
			const dv = { x: (p3.x - p0.x) / spanY, y: (p3.y - p0.y) / spanY };
			const mapping: WarpMapping = {
				origin: {
					x: p0.x + widthEdgeBuffer * du.x + heightEdgeBuffer * dv.x,
					y: p0.y + widthEdgeBuffer * du.y + heightEdgeBuffer * dv.y
				},
				du,
				dv
			};
			extractedPolaroids.push(gpu.extract(mapping, outputWidth, outputHeight));
			extractedPolaroidPoints.delete();
			continue;
		}

		let extractedPolaroid = new cv.Mat();
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
			getSourceMat(image),
			extractedPolaroid,
			M,
			new cv.Size(outputWidth, outputHeight)
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
		let fileOutputCanvas = new OffscreenCanvas(outputWidth, outputHeight);
		cv.imshow(fileOutputCanvas as any, extractedPolaroid);
		extractedPolaroids.push(fileOutputCanvas.transferToImageBitmap());

		// Memory cleanup
		extractedPolaroid.delete();
		extractedPolaroidPoints.delete();
		extractedPolaroidPoints2.delete();
		M.delete();
		sharpenFilter.delete();
	}
	// Wait for the GPU so the timing covers the rendering itself, not just its submission
	if (gpu) await gpu.finished();
	timer.mark('extract: warp + sharpen');

	const timings = { backend, ...timer.finish() };
	console.table(timings.stages);
	console.log('TIMINGS ' + JSON.stringify(timings));
	postStructuredMessage({ type: 'TIMINGS', ...timings });

	return extractedPolaroids;
}
