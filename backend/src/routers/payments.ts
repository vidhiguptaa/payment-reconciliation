import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../db';
import { uploadFromBuffer, deleteFromCloudinary } from '../services/cloudinary';
import { OcrService } from '../services/ocr';
import { TransactionExtractor } from '../services/extraction';
import { ProcessingStatus } from '../shared/types';

const router = Router();

// Configure cryptographic hash helper
const computeHash = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Asynchronous OCR processing executor running in background.
 */
const executeOcrPipeline = async (paymentImageId: string, fileBuffer: Buffer, cloudinaryUrl: string) => {
  const startTime = Date.now();
  try {
    // 1. Mark status as PROCESSING
    await prisma.paymentImage.update({
      where: { id: paymentImageId },
      data: { status: ProcessingStatus.PROCESSING },
    });

    // 2. Perform OCR
    console.log(`Calling OCR microservice for image: ${paymentImageId}...`);
    const ocrService = new OcrService();
    const ocrResult = await ocrService.processImage(fileBuffer, cloudinaryUrl);
    console.log(`OCR completed successfully for image: ${paymentImageId}.`);

    // 3. Extract transaction parameters from text
    console.log(`Extracting transaction parameters for image: ${paymentImageId}...`);
    const extracted = TransactionExtractor.extract(ocrResult.text);
    const duration = Date.now() - startTime;

    // 4. Save the OCR execution metrics
    await prisma.oCRResult.create({
      data: {
        paymentImageId,
        provider: ocrResult.provider,
        rawText: ocrResult.text,
        rawJson: ocrResult.rawJson,
        confidence: ocrResult.confidence,
        processingTimeMs: duration,
        status: 'SUCCESS',
      },
    });

    // 5. Update the primary payment record with details and status PROCESSED
    await prisma.paymentImage.update({
      where: { id: paymentImageId },
      data: {
        status: ProcessingStatus.PROCESSED,
        amount: extracted.amount,
        currency: extracted.currency,
        transactionDate: extracted.transactionDate,
        transactionTime: extracted.transactionTime,
        referenceNumber: extracted.referenceNumber,
        utrNumber: extracted.utrNumber,
        transactionId: extracted.transactionId,
        senderName: extracted.senderName,
        receiverName: extracted.receiverName,
        transactionType: extracted.transactionType,
        paymentStatus: extracted.paymentStatus,
      },
    });

    console.log(`Successfully completed OCR extraction background job for payment image: ${paymentImageId}`);
  } catch (error: any) {
    console.log(`OCR failed for payment image: ${paymentImageId}. Error: ${error.message || String(error)}`);
    console.error(`Failed executing background OCR pipeline for ${paymentImageId}:`, error);
    const duration = Date.now() - startTime;

    // Save failed OCR execution
    await prisma.oCRResult.create({
      data: {
        paymentImageId,
        provider: 'paddleocr',
        rawText: '',
        rawJson: '{}',
        confidence: 0,
        processingTimeMs: duration,
        status: 'FAILED',
        errorMessage: error.message || String(error),
      },
    });

    // Mark image status as FAILED
    await prisma.paymentImage.update({
      where: { id: paymentImageId },
      data: { status: ProcessingStatus.FAILED },
    });
  }
};

/**
 * Handler for uploading screenshots.
 */
const uploadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const files = req.files as Express.Multer.File[];

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No screenshot files uploaded' });
  }

  const results: any[] = [];
  const errors: any[] = [];

  for (const file of files) {
    try {
      const fileHash = computeHash(file.buffer);

      // Check if this user (or any user) has already uploaded this exact file hash
      const existing = await prisma.paymentImage.findUnique({
        where: { fileHash },
      });

      if (existing) {
        errors.push({
          filename: file.originalname,
          error: 'This file has already been uploaded previously.',
        });
        continue;
      }

      // Stream to Cloudinary
      const nameWithoutExt = file.originalname.split('.').slice(0, -1).join('.');
      console.log(`Uploading image ${file.originalname}...`);
      const cloudinaryResult = await uploadFromBuffer(file.buffer, 'payment_reconciliation/screenshots', nameWithoutExt);
      console.log(`Cloudinary upload successful for ${file.originalname}.`);

      // Save record in database as PENDING
      console.log(`Creating database record for ${file.originalname}...`);
      const paymentImage = await prisma.paymentImage.create({
        data: {
          filename: file.originalname,
          cloudinaryUrl: cloudinaryResult.url,
          cloudinaryPublicId: cloudinaryResult.publicId,
          fileHash,
          fileSize: file.size,
          status: ProcessingStatus.PENDING,
          userId,
        },
      });

      // Trigger OCR asynchronously (Express background task)
      executeOcrPipeline(paymentImage.id, file.buffer, cloudinaryResult.url);

      results.push(paymentImage);
    } catch (err: any) {
      console.error(`Upload error for file ${file.originalname}:`, err);
      errors.push({
        filename: file.originalname,
        error: err.message || 'Cloudinary upload failed',
      });
    }
  }

  return res.json({
    uploaded: results,
    failed: errors,
  });
};

/**
 * Handler for deleting a screenshot.
 */
const deleteHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const paymentImage = await prisma.paymentImage.findFirst({
      where: { id, userId },
    });

    if (!paymentImage) {
      return res.status(404).json({ error: 'Screenshot not found or already deleted.' });
    }

    // 1. Delete from Cloudinary (with error suppression if already deleted)
    try {
      if (paymentImage.cloudinaryPublicId) {
        await deleteFromCloudinary(paymentImage.cloudinaryPublicId);
      }
    } catch (clError) {
      console.warn(`Failed to delete Cloudinary asset ${paymentImage.cloudinaryPublicId}:`, clError);
    }

    // 2. Delete from database using deleteMany to prevent P2025
    const deleteResult = await prisma.paymentImage.deleteMany({
      where: { id, userId },
    });

    if (deleteResult.count === 0) {
      return res.status(404).json({ error: 'Screenshot was already deleted by another process.' });
    }

    return res.json({ message: 'Screenshot deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Screenshot not found or already deleted.' });
    }
    console.error('Delete screenshot error:', error);
    return res.status(500).json({ error: 'Failed to delete screenshot' });
  }
};

// Route registrations
router.post('/upload', requireAuth, upload.array('files', 15), uploadHandler);
router.post('/payment-images', requireAuth, upload.array('files', 15), uploadHandler);

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const paymentImages = await prisma.paymentImage.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
    });

    return res.json(paymentImages);
  } catch (error: any) {
    console.error('Fetch screenshots error:', error);
    return res.status(500).json({ error: 'Failed to retrieve screenshots' });
  }
});

router.delete('/:id', requireAuth, deleteHandler);
router.delete('/payment-images/:id', requireAuth, deleteHandler);

/**
 * Simple test/diagnostic OCR endpoint.
 */
router.post('/ocr', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Image URL ("url") is required in request body.' });
  }

  try {
    console.log(`Running diagnostic/direct OCR request for: ${url}`);
    const ocrService = new OcrService();
    const result = await ocrService.processImage(Buffer.from([]), url);
    return res.json({
      text: result.text,
      confidence: result.confidence,
      provider: result.provider,
      rawJson: JSON.parse(result.rawJson),
    });
  } catch (error: any) {
    console.error('Diagnostic OCR endpoint failure:', error);
    return res.status(500).json({ error: error.message || 'OCR processing failed' });
  }
});

export default router;
