import { createWorker } from 'tesseract.js';

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
  async processImage(buffer: Buffer, url?: string): Promise<OcrResult> {
    console.log(`Running Tesseract.js OCR locally inside backend...`);
    let worker;
    try {
      // 1. Create the worker (specifying English language)
      worker = await createWorker('eng');

      // 2. Perform OCR on the local image Buffer
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
      throw new Error(`Tesseract OCR processing failed: ${error.message || String(error)}`);
    } finally {
      // 3. Clean up the worker
      if (worker) {
        await worker.terminate();
      }
    }
  }
}
