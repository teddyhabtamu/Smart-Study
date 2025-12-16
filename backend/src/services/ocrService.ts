// OCR Service using Tesseract.js
import { createWorker } from 'tesseract.js';

let worker: any = null;

// Initialize worker lazily
async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng'); // English language
  }
  return worker;
}

export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  try {
    const workerInstance = await getWorker();
    
    // Perform OCR on the image
    const { data: { text } } = await workerInstance.recognize(imageBuffer);
    
    // Clean up the extracted text
    const cleanedText = text.trim().replace(/\s+/g, ' ');
    
    return cleanedText || 'No text could be extracted from the image.';
  } catch (error) {
    console.error('OCR Error:', error);
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
