import { createWorker, Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  provider: string;
  rawJson: string;
}

/**
 * Service to perform OCR using Tesseract.js locally inside the backend process.
 */
export class OcrService {
  private static workerPromise: Promise<Worker> | null = null;

  private static async getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      console.log('Initializing global Tesseract.js worker...');
      // By default, Tesseract.js caches eng.traineddata in the directory of the running process
      this.workerPromise = createWorker('eng').then((worker) => {
        console.log('Global Tesseract.js worker initialized successfully.');
        return worker;
      });
    }
    return this.workerPromise;
  }

  async processImage(buffer: Buffer, url?: string): Promise<OcrResult> {
    console.log(`Running Tesseract.js OCR locally inside backend...`);
    try {
      // Get the shared singleton worker instance
      const worker = await OcrService.getWorker();

      // Perform OCR on the local image Buffer
      const response = await worker.recognize(buffer);
      const { text, confidence } = response.data;

      return {
        text: text || '',
        confidence: confidence || 0.0,
        provider: 'tesseract',
        rawJson: JSON.stringify(response.data),
      };
    } catch (error: any) {
      console.error('Tesseract OCR failure:', error.message || error);
      
      // If the worker is in a bad state or crashed, reset the promise to re-initialize on the next call
      OcrService.workerPromise = null;
      
      throw new Error(`Tesseract OCR processing failed: ${error.message || String(error)}`);
    }
  }
}
