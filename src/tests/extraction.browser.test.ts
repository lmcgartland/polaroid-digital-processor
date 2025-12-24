/**
 * Polaroid Extraction Browser Tests
 * 
 * These tests run in a real browser using Playwright to verify that
 * the image processing pipeline correctly extracts polaroids from
 * scanned images.
 * 
 * Run with: pnpm run test:browser
 */

import { test, expect, type Page } from '@playwright/test';
import { testFixtures, PHASH_SIMILARITY_THRESHOLD } from './fixtures';
import { calculatePHash, hammingDistance } from './phash';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Wait for OpenCV to be ready (indicated by the upload UI appearing).
 */
async function waitForOpenCVReady(page: Page): Promise<void> {
  // Wait for the "Upload an image to get started" text or file input
  await page.waitForSelector('input[type="file"]', { timeout: 30000 });
}

/**
 * Upload an image file to the application.
 */
async function uploadImage(page: Page, imagePath: string): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(imagePath);
}

/**
 * Wait for image processing to complete.
 * We detect completion by waiting for thumbnail images to appear.
 */
async function waitForProcessingComplete(page: Page, expectedCount: number): Promise<void> {
  // Wait for the thumbnails section to have the expected number of images
  // The thumbnails are in a section with class 'thumbnails-section' or similar
  // We'll wait for img elements in the thumbnails area
  
  // First, wait for at least one thumbnail to appear (processing started)
  await page.waitForSelector('.thumbnails-grid img, .thumbnails-section img, section img.thumbnail', { 
    timeout: 60000 
  });
  
  // Then wait for the expected count
  await expect(async () => {
    const thumbnails = await page.locator('.thumbnails-grid img, .thumbnail').all();
    expect(thumbnails.length).toBe(expectedCount);
  }).toPass({ timeout: 60000 });
}

/**
 * Get the extracted polaroid images as Blobs.
 */
async function getExtractedPolaroids(page: Page): Promise<Buffer[]> {
  // Get all thumbnail image sources
  const thumbnails = await page.locator('.thumbnails-grid img, .thumbnail').all();
  const buffers: Buffer[] = [];
  
  for (const thumbnail of thumbnails) {
    const src = await thumbnail.getAttribute('src');
    if (src && src.startsWith('blob:')) {
      // Fetch the blob URL content
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

/**
 * Reset the application state for a new test.
 */
async function resetApplication(page: Page): Promise<void> {
  // Click the Reset button if it exists
  const resetButton = page.locator('button:has-text("Reset")');
  if (await resetButton.isVisible()) {
    await resetButton.click();
    // Wait for the upload prompt to reappear
    await page.waitForSelector('text=Upload an image to get started', { timeout: 5000 }).catch(() => {
      // If the text doesn't appear, try reloading
    });
  }
  
  // Reload the page to ensure clean state
  await page.reload();
  await waitForOpenCVReady(page);
}

// Generate tests dynamically from fixtures
for (const fixture of testFixtures) {
  test.describe(`Folder: ${path.basename(fixture.folder)}`, () => {
    // Check if folder exists
    test.beforeAll(() => {
      if (!fs.existsSync(fixture.folder)) {
        console.warn(`Warning: Test folder does not exist: ${fixture.folder}`);
        console.warn('Skipping tests for this folder. Update fixtures.ts with valid paths.');
      }
    });

    for (const imageConfig of fixture.images) {
      const imagePath = path.join(fixture.folder, imageConfig.filename);
      
      test(`${imageConfig.filename} should extract ${imageConfig.expectedCount} polaroids`, async ({ page }) => {
        // Skip if the image doesn't exist
        if (!fs.existsSync(imagePath)) {
          test.skip();
          return;
        }

        // Navigate to the app
        await page.goto('/');
        await waitForOpenCVReady(page);

        // Upload the test image
        await uploadImage(page, imagePath);

        // Wait for processing to complete
        await waitForProcessingComplete(page, imageConfig.expectedCount);

        // Verify the count
        const thumbnails = await page.locator('.thumbnails-grid img, .thumbnail').all();
        expect(thumbnails.length).toBe(imageConfig.expectedCount);

        // If baseline hashes exist, verify visual similarity
        if (imageConfig.baselineHashes && imageConfig.baselineHashes.length > 0) {
          const extractedBuffers = await getExtractedPolaroids(page);
          
          expect(extractedBuffers.length).toBe(imageConfig.baselineHashes.length);
          
          for (let i = 0; i < extractedBuffers.length; i++) {
            const extractedHash = await calculatePHash(extractedBuffers[i]);
            const baselineHash = imageConfig.baselineHashes[i];
            const distance = hammingDistance(extractedHash, baselineHash);
            
            expect(
              distance,
              `Polaroid ${i + 1} visual similarity check failed. ` +
              `Hamming distance: ${distance} (threshold: ${PHASH_SIMILARITY_THRESHOLD}). ` +
              `Extracted: ${extractedHash}, Baseline: ${baselineHash}`
            ).toBeLessThanOrEqual(PHASH_SIMILARITY_THRESHOLD);
          }
        }
      });
    }
  });
}

// Summary test that reports overall results
test('Test Summary', async ({ page }) => {
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
  
  console.log(`\n📊 Test Fixture Summary:`);
  console.log(`   Total configured images: ${totalImages}`);
  console.log(`   Images found on disk: ${existingImages}`);
  console.log(`   Images missing: ${totalImages - existingImages}`);
  
  if (existingImages === 0) {
    console.warn('\n⚠️  No test images found! Update src/tests/fixtures.ts with valid paths.');
  }
  
  expect(existingImages).toBeGreaterThan(0);
});

