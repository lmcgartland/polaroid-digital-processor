/**
 * Perceptual hashing utilities for image comparison.
 * 
 * Uses perceptual hashing (pHash) to generate fingerprints of images that
 * remain similar for visually similar images, even if the underlying bytes
 * differ (e.g., due to compression, sharpening, or minor color adjustments).
 */

import { Jimp } from 'jimp';

/**
 * Size of the downsampled image for hash calculation.
 * Smaller sizes are faster but less precise.
 */
const HASH_SIZE = 8;

/**
 * Calculate a perceptual hash for an image.
 * 
 * This implementation uses the average hash (aHash) algorithm:
 * 1. Resize image to 8x8 grayscale
 * 2. Calculate the average pixel value
 * 3. Generate a 64-bit hash where each bit represents whether
 *    a pixel is above or below the average
 * 
 * @param imageData - Image data as a Buffer, ArrayBuffer, or data URL
 * @returns A 16-character hexadecimal hash string
 */
export async function calculatePHash(imageData: Buffer | ArrayBuffer | string): Promise<string> {
  let buffer: Buffer;
  
  if (typeof imageData === 'string') {
    // Handle data URL
    if (imageData.startsWith('data:')) {
      const base64Data = imageData.split(',')[1];
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('String input must be a data URL');
    }
  } else if (imageData instanceof ArrayBuffer) {
    buffer = Buffer.from(imageData);
  } else {
    buffer = imageData;
  }

  // Load and process image with Jimp
  const image = await Jimp.read(buffer);
  
  // Resize to small square and convert to grayscale
  image.resize({ w: HASH_SIZE, h: HASH_SIZE });
  image.greyscale();

  // Get pixel values
  const pixels: number[] = [];
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const color = image.getPixelColor(x, y);
      // Extract red channel (since it's grayscale, all channels are the same)
      const r = (color >> 24) & 0xFF;
      pixels.push(r);
    }
  }

  // Calculate average
  const average = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;

  // Generate hash: 1 if pixel > average, 0 otherwise
  let hash = '';
  for (const pixel of pixels) {
    hash += pixel > average ? '1' : '0';
  }

  // Convert binary string to hexadecimal
  return binaryToHex(hash);
}

/**
 * Calculate the Hamming distance between two hashes.
 * This represents the number of bit positions where the hashes differ.
 * 
 * @param hash1 - First hash (hexadecimal string)
 * @param hash2 - Second hash (hexadecimal string)
 * @returns Number of differing bits (0 = identical)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(`Hash length mismatch: ${hash1.length} vs ${hash2.length}`);
  }

  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);

  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) {
      distance++;
    }
  }

  return distance;
}

/**
 * Check if two images are visually similar based on their perceptual hashes.
 * 
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @param threshold - Maximum Hamming distance to consider similar (default: 10)
 * @returns True if images are similar
 */
export function areImagesSimilar(hash1: string, hash2: string, threshold = 10): boolean {
  return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Convert a binary string to hexadecimal.
 */
function binaryToHex(binary: string): string {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/**
 * Convert a hexadecimal string to binary.
 */
function hexToBinary(hex: string): string {
  let binary = '';
  for (const char of hex) {
    binary += parseInt(char, 16).toString(2).padStart(4, '0');
  }
  return binary;
}

/**
 * Calculate pHash for a Blob (useful in browser context).
 */
export async function calculatePHashFromBlob(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  return calculatePHash(arrayBuffer);
}

