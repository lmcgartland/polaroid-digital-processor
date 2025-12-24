#!/usr/bin/env tsx
/**
 * Baseline Hash Generator
 * 
 * This script runs the polaroid extraction on all configured test images
 * and generates perceptual hashes (pHash) for the extracted polaroids.
 * 
 * These hashes can then be used as baselines for regression testing.
 * 
 * Usage: pnpm run test:baselines
 * 
 * IMPORTANT: Only run this script when you are confident that the current
 * extraction algorithm is working correctly. The generated hashes will be
 * used as the "golden" reference for future tests.
 */

import { chromium, type Page } from '@playwright/test';
import { testFixtures } from '../src/tests/fixtures';
import { calculatePHash } from '../src/tests/phash';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';

const DEV_SERVER_URL = 'http://localhost:5173';
const DEV_SERVER_TIMEOUT = 60000; // 1 minute to start server

interface GeneratedBaseline {
  folder: string;
  images: {
    filename: string;
    expectedCount: number;
    baselineHashes: string[];
  }[];
}

/**
 * Start the dev server and wait for it to be ready.
 */
async function startDevServer(): Promise<ChildProcess> {
  console.log('🚀 Starting dev server...');
  
  const serverProcess = spawn('pnpm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Dev server failed to start within timeout'));
    }, DEV_SERVER_TIMEOUT);

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes('localhost:5173')) {
        clearTimeout(timeout);
        console.log('✅ Dev server is ready');
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return serverProcess;
}

/**
 * Wait for OpenCV to be ready.
 */
async function waitForOpenCVReady(page: Page): Promise<void> {
  await page.waitForSelector('input[type="file"]', { timeout: 30000 });
}

/**
 * Upload an image and wait for processing to complete.
 */
async function processImage(page: Page, imagePath: string): Promise<Buffer[]> {
  // Navigate to app
  await page.goto(DEV_SERVER_URL);
  await waitForOpenCVReady(page);

  // Upload the image
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(imagePath);

  // Wait for thumbnails to appear (processing complete)
  await page.waitForSelector('.thumbnails-grid img, .thumbnail', { timeout: 120000 });
  
  // Wait a bit more for all images to be fully processed
  await page.waitForTimeout(2000);

  // Get all thumbnail images
  const thumbnails = await page.locator('.thumbnails-grid img, .thumbnail').all();
  const buffers: Buffer[] = [];

  for (const thumbnail of thumbnails) {
    const src = await thumbnail.getAttribute('src');
    if (src && src.startsWith('blob:')) {
      const buffer = await page.evaluate(async (blobUrl) => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, src);
      buffers.push(Buffer.from(buffer));
    }
  }

  return buffers;
}

async function main() {
  console.log('📸 Polaroid Baseline Hash Generator\n');
  
  // Check if any test images exist
  let totalImages = 0;
  let existingImages = 0;
  
  for (const fixture of testFixtures) {
    for (const imageConfig of fixture.images) {
      totalImages++;
      const imagePath = path.join(fixture.folder, imageConfig.filename);
      if (fs.existsSync(imagePath)) {
        existingImages++;
      }
    }
  }

  if (existingImages === 0) {
    console.error('❌ No test images found!');
    console.error('   Update src/tests/fixtures.ts with valid paths.');
    process.exit(1);
  }

  console.log(`Found ${existingImages}/${totalImages} test images\n`);

  // Start the dev server
  let serverProcess: ChildProcess | null = null;
  
  try {
    serverProcess = await startDevServer();
    
    // Launch browser
    console.log('🌐 Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const generatedBaselines: GeneratedBaseline[] = [];

    // Process each fixture
    for (const fixture of testFixtures) {
      console.log(`\n📁 Processing folder: ${fixture.folder}`);
      
      if (!fs.existsSync(fixture.folder)) {
        console.warn(`   ⚠️ Folder does not exist, skipping`);
        continue;
      }

      const fixtureBaseline: GeneratedBaseline = {
        folder: fixture.folder,
        images: [],
      };

      for (const imageConfig of fixture.images) {
        const imagePath = path.join(fixture.folder, imageConfig.filename);
        
        if (!fs.existsSync(imagePath)) {
          console.warn(`   ⚠️ ${imageConfig.filename} not found, skipping`);
          continue;
        }

        console.log(`   📷 Processing: ${imageConfig.filename}`);
        
        try {
          const extractedBuffers = await processImage(page, imagePath);
          console.log(`      Extracted ${extractedBuffers.length} polaroids`);

          // Calculate pHash for each extracted image
          const hashes: string[] = [];
          for (let i = 0; i < extractedBuffers.length; i++) {
            const hash = await calculatePHash(extractedBuffers[i]);
            hashes.push(hash);
            console.log(`      Polaroid ${i + 1}: ${hash}`);
          }

          fixtureBaseline.images.push({
            filename: imageConfig.filename,
            expectedCount: extractedBuffers.length,
            baselineHashes: hashes,
          });
        } catch (error) {
          console.error(`      ❌ Error processing: ${error}`);
        }
      }

      generatedBaselines.push(fixtureBaseline);
    }

    await browser.close();

    // Generate the updated fixtures file
    console.log('\n📝 Generating updated fixtures...\n');
    
    const fixturesContent = generateFixturesFile(generatedBaselines);
    const fixturesPath = path.join(process.cwd(), 'src/tests/fixtures.generated.ts');
    fs.writeFileSync(fixturesPath, fixturesContent);
    
    console.log(`✅ Generated baselines saved to: ${fixturesPath}`);
    console.log('\nTo use these baselines, copy the contents to src/tests/fixtures.ts');
    console.log('or rename the file:\n');
    console.log('  mv src/tests/fixtures.generated.ts src/tests/fixtures.ts\n');

  } finally {
    // Cleanup
    if (serverProcess) {
      console.log('🛑 Stopping dev server...');
      serverProcess.kill('SIGTERM');
    }
  }
}

/**
 * Generate the fixtures TypeScript file content.
 */
function generateFixturesFile(baselines: GeneratedBaseline[]): string {
  const content = `/**
 * Test fixture configuration for polaroid extraction tests.
 * 
 * AUTO-GENERATED by scripts/generate-baselines.ts
 * Generated at: ${new Date().toISOString()}
 * 
 * NOTE: These paths are hardcoded to local filesystem locations and are NOT
 * committed to git. Each developer should update these paths to point to their
 * own test images.
 */

export interface TestImage {
  /** Filename of the test image */
  filename: string;
  /** Expected number of polaroids to extract from this image */
  expectedCount: number;
  /** 
   * Optional baseline perceptual hashes for the extracted polaroids.
   * These are generated by running \`pnpm run test:baselines\` when the
   * extraction algorithm is known to be working correctly.
   */
  baselineHashes?: string[];
}

export interface TestFixture {
  /** Absolute path to the folder containing test images */
  folder: string;
  /** List of test images in this folder */
  images: TestImage[];
}

/**
 * Test fixtures configuration.
 */
export const testFixtures: TestFixture[] = ${JSON.stringify(baselines, null, 2).replace(/"([^"]+)":/g, '$1:')};

/**
 * Hamming distance threshold for perceptual hash comparison.
 * Images with a distance less than this value are considered visually similar.
 */
export const PHASH_SIMILARITY_THRESHOLD = 10;
`;

  return content;
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

