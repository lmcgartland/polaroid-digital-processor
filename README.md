# Polaroid Digital Processor

A browser-based tool for extracting individual polaroid photos from scanned images using computer vision. All processing happens locally in your browser using OpenCV.js and Web Workers.

## Features

- **Client-side processing**: No server required, your photos never leave your device
- **Automatic detection**: Uses watershed segmentation to find individual polaroids
- **Perspective correction**: Straightens rotated or skewed polaroids
- **Batch export**: Download all extracted polaroids as a ZIP file
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

1. Upload a scanned image containing multiple polaroid photos
2. Adjust processing parameters if needed (expand each parameter for help)
3. Click "Process Image" to detect and extract polaroids
4. Review the extracted thumbnails
5. Click "Download images" to get a ZIP of all polaroids

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
- **Image Processing**: OpenCV.js (WebAssembly)
- **Testing**: Vitest, Playwright
- **Build**: Vite

## License

MIT

## Note on settings
This has only been tested/optimized for scanning integral Polaroid film on an Epson v39 scanner at 600 ppi.