import { createWorker, Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  provider: string;
  rawJson: string;
}

/**
 * Service to perform OCR using Tesseract.js locally inside the backend process.
 * Utilizes a sequential execution queue, persistent worker reuse, and idle auto-termination.
 */
export class OcrService {
  private static workerPromise: Promise<Worker> | null = null;
  private static activeJobsCount = 0;
  private static idleTimeout: NodeJS.Timeout | null = null;
  private static queuePromise: Promise<any> = Promise.resolve();

  private static async getWorker(): Promise<Worker> {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (!this.workerPromise) {
      console.log('Initializing global Tesseract.js worker...');
      this.workerPromise = createWorker('eng').then((worker) => {
        console.log('Global Tesseract.js worker initialized successfully.');
        return worker;
      });
    }
    return this.workerPromise;
  }

  private static releaseWorker() {
    this.activeJobsCount--;
    if (this.activeJobsCount === 0) {
      // Set an idle timeout of 30 seconds to terminate the worker and free RAM
      this.idleTimeout = setTimeout(async () => {
        if (this.workerPromise) {
          console.log('Tesseract.js worker idle for 30s. Terminating to free memory...');
          const promise = this.workerPromise;
          this.workerPromise = null;
          try {
            const worker = await promise;
            await worker.terminate();
            console.log('Tesseract.js worker terminated successfully.');
          } catch (err) {
            console.error('Error terminating idle Tesseract worker:', err);
          }
        }
      }, 30000);
    }
  }

  async processImage(buffer: Buffer, url?: string): Promise<OcrResult> {
    // Chain onto the queue to ensure sequential execution (thread safety and CPU throttling prevention)
    const result = OcrService.queuePromise.then(async () => {
      OcrService.activeJobsCount++;
      let worker;
      try {
        worker = await OcrService.getWorker();
        console.log(`Running Tesseract.js OCR locally (queue sequential)...`);
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
        // Reset worker on error so it starts fresh next time
        if (OcrService.workerPromise) {
          const promise = OcrService.workerPromise;
          OcrService.workerPromise = null;
          promise.then(w => w.terminate().catch(() => {})).catch(() => {});
        }
        throw new Error(`Tesseract OCR processing failed: ${error.message || String(error)}`);
      } finally {
        OcrService.releaseWorker();
      }
    });

    // Update the queue promise so the next job chains onto this one
    // Catch errors so a failed job doesn't block the queue
    OcrService.queuePromise = result.catch(() => {});

    return result;
  }
}
