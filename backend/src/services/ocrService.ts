// OCR Service using Tesseract.js
import { createWorker } from 'tesseract.js';

let worker: any = null;
let workerInitializing = false;
const WORKER_TIMEOUT = 30000; // 30 seconds timeout for worker initialization
const OCR_TIMEOUT = 20000; // 20 seconds timeout for OCR processing

// Initialize worker lazily with timeout
async function getWorker() {
  if (worker) {
    return worker;
  }

  if (workerInitializing) {
    // Wait for existing initialization
    let attempts = 0;
    while (workerInitializing && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (worker) return worker;
      attempts++;
    }
    throw new Error('Worker initialization timeout');
  }

  workerInitializing = true;
  
  try {
    // Create worker with timeout
    worker = await Promise.race([
      createWorker('eng', 1, {
        logger: () => {
          // Suppress verbose logging
        }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Worker initialization timeout')), WORKER_TIMEOUT)
      )
    ]) as any;

    // Set worker parameters for faster processing
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume uniform block of text (faster)
    });

    workerInitializing = false;
    return worker;
  } catch (error) {
    workerInitializing = false;
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // Ignore termination errors
      }
    }
    worker = null;
    throw error;
  }
}

export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  try {
    const workerInstance = await getWorker();
    
    // Perform OCR on the image with timeout
    const result = await Promise.race([
      workerInstance.recognize(imageBuffer, {
        rectangle: undefined, // Process entire image
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR processing timeout')), OCR_TIMEOUT)
      )
    ]) as any;
    
    // Clean up the extracted text
    const cleanedText = result.data.text.trim().replace(/\s+/g, ' ');
    
    return cleanedText || 'No text could be extracted from the image.';
  } catch (error) {
    console.error('OCR Error:', error);
    
    // Clean up worker on error to allow retry
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // Ignore termination errors
      }
      worker = null;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('timeout')) {
      throw new Error('OCR processing took too long. Please try with a smaller or clearer image.');
    }
    throw new Error('Failed to extract text from image. Please ensure the image contains clear, readable text.');
  }
}

// Cleanup function to terminate worker when needed
export async function cleanupOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
