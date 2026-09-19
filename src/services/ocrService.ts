// Client-side OCR Service using Tesseract.js
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

// Initialize Tesseract worker lazily
async function getWorker() {
  if (worker) {
    return worker;
  }

  if (isInitializing) {
    // Wait for existing initialization
    let attempts = 0;
    while (isInitializing && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (worker) return worker;
      attempts++;
    }
    throw new Error('Worker initialization timeout');
  }

  isInitializing = true;
  
  try {
    worker = await createWorker('eng', 1, {
      logger: () => {
        // Progress logging removed
      }
    });

    // Set worker parameters for faster processing
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume uniform block of text (faster)
    });

    isInitializing = false;
    return worker;
  } catch (error) {
    isInitializing = false;
    worker = null;
    throw error;
  }
}

/**
 * Extract text from an image file using client-side OCR
 * @param imageFile - The image file to process
 * @returns Promise with extracted text (empty string when nothing found —
 * callers branch on empty, so a "no text" sentence must never come back as
 * if it were recognized content)
 */
export async function extractTextFromImage(imageFile: File): Promise<string> {
  try {
    const workerInstance = await getWorker();

    // Downscale phone photos first: tesseract on a raw 12MP file stalls
    // low-end devices and can OOM the tab. Text survives 2000px fine.
    const input = await prepareImage(imageFile);

    // Perform OCR on the image
    const { data: { text } } = await workerInstance.recognize(input);

    // Clean up the extracted text
    const cleanedText = text.trim().replace(/\s+/g, ' ');

    return cleanedText;
  } catch (error) {
    console.error('OCR Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract text from image: ${errorMessage}`);
  }
}

// Downscale oversized images before recognition (see extractTextFromImage).
// Returns the original file when downscaling is impossible or unneeded.
async function prepareImage(imageFile: File): Promise<Blob> {
  const MAX_DIM = 2000;
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
      return imageFile;
    }
    const bitmap = await createImageBitmap(imageFile);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      if (typeof bitmap.close === 'function') bitmap.close();
      return imageFile;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageFile;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === 'function') bitmap.close();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    return blob || imageFile;
  } catch {
    return imageFile;
  }
}

/**
 * Cleanup function to terminate worker when needed
 */
export async function cleanupOCR() {
  if (worker) {
    try {
      await worker.terminate();
    } catch (e) {
      console.error('Error terminating OCR worker:', e);
    }
    worker = null;
  }
}
