# Polaroid Digital Processor

A browser-based tool for extracting individual polaroid photos from scanned images using computer vision. All processing happens locally in your browser using WebGPU, OpenCV.js and Web Workers.

## Features

- **Client-side processing**: No server required, your photos never leave your device
- **Automatic detection**: Uses watershed segmentation to find individual polaroids
- **Perspective correction**: Straightens rotated or skewed polaroids
- **Sub-pixel edges**: Each polaroid's edges are re-located in the full-resolution scan, so crops are tight and square
- **Batch export**: Download all extracted polaroids as a ZIP file
- **Folder mode**: Pick a folder of scans, confirm where to save, and every polaroid is written straight to disk (Chrome or Edge)
- **Tunable parameters**: Adjust detection sensitivity for different scan qualities

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/polaroid-digital-processor.git
cd polaroid-digital-processor

# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

The app will be available at `http://localhost:5173`.

## Usage

1. Drop a scan onto the page, or click **Choose File**
2. Your Polaroids show up in the tray below the scan, and each one is outlined on the scan itself (under **Display**, switch on **Contours** to also see the raw watershed lines)
3. Missing one, or two stuck together? Adjust the **Fine-tune** settings (tap ⓘ for help) and click **Process**
4. Click **Download** for a ZIP

Got a pile of scans? Click **Choose Folder**. You'll see how many scans were found and where the Polaroids will be saved (an `extracted` folder inside it by default, or anywhere you pick) before anything runs. Each Polaroid is then saved straight to disk as `<scan name>-<n>.png`, with every result shown grouped by scan — there is nothing to download. This uses the File System Access API, which needs a Chromium-based browser.

## Testing

The project includes a comprehensive test suite for validating the polaroid extraction algorithm.

### Running Tests

```bash
# Run browser-based extraction tests
pnpm run test:browser

# Run unit tests
pnpm run test
```

### Test Configuration

Tests are configured in `src/tests/fixtures.ts`. Each fixture defines:
- A folder path containing test images
- Expected number of polaroids per image
- Optional baseline hashes for visual comparison

```typescript
export const testFixtures: TestFixture[] = [
  {
    folder: '/path/to/your/test/images',
    images: [
      { filename: 'scan1.png', expectedCount: 4 },
      { filename: 'scan2.png', expectedCount: 6 },
    ]
  }
];
```

### Generating Baseline Hashes

When the extraction algorithm is working correctly, generate baseline perceptual hashes:

```bash
pnpm run test:baselines
```

This creates `src/tests/fixtures.generated.ts` with pHash values for each extracted polaroid. Copy this to `fixtures.ts` to enable visual regression testing.

### How Visual Comparison Works

The test suite uses perceptual hashing (pHash) to compare extracted polaroids:

1. Each image is resized to 8x8 grayscale
2. A 64-bit hash is generated based on pixel brightness
3. Hamming distance measures similarity (0 = identical, 64 = completely different)
4. Images with distance ≤ 10 are considered visually similar

This allows tests to pass even when minor changes (sharpening, compression) alter the exact bytes.

## Documentation

Visit `/docs` in the running app to view:
- **How It Works**: Visual diagrams of the processing pipeline
- **API Reference**: Auto-generated documentation from source code

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start development server |
| `pnpm run build` | Build for production |
| `pnpm run preview` | Preview production build |
| `pnpm run test` | Run unit tests |
| `pnpm run test:browser` | Run browser extraction tests |
| `pnpm run test:baselines` | Generate baseline hashes |
| `pnpm run check` | Type-check the codebase |
| `pnpm run lint` | Check code formatting |
| `pnpm run format` | Format code with Prettier |

## Tech Stack

- **Frontend**: SvelteKit, Tailwind CSS
- **Image Processing**: WebGPU for the full-resolution stages (resize, blur, warp, sharpen) with an automatic OpenCV.js fallback; OpenCV.js (WebAssembly) for detection
- **Testing**: Vitest, Playwright
- **Build**: Vite

## License

MIT

## Note on settings
This has only been tested/optimized for scanning integral Polaroid film on an Epson v39 scanner at 600 ppi.