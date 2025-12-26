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
 * @returns Promise with extracted text
 */
export async function extractTextFromImage(imageFile: File): Promise<string> {
  try {
    const workerInstance = await getWorker();
    
    // Perform OCR on the image
    const { data: { text } } = await workerInstance.recognize(imageFile);
    
    // Clean up the extracted text
    const cleanedText = text.trim().replace(/\s+/g, ' ');
    
    return cleanedText || 'No text could be extracted from the image.';
  } catch (error) {
    console.error('OCR Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract text from image: ${errorMessage}`);
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
