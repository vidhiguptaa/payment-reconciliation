import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../db';
import { uploadFromBuffer, deleteFromCloudinary } from '../services/cloudinary';
import { TransactionNormalizer } from '../services/extraction';

const router = Router();

const computeHash = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

const COLUMN_ALIASES: Record<string, string[]> = {
  transactionDate: [
    'transaction date', 'txn date', 'date', 'txndate', 'tran date',
    'post date', 'booking date', 'transaction_date', 'date of txn'
  ],
  valueDate: [
    'value date', 'val date', 'value_date', 'vdate', 'value dt'
  ],
  description: [
    'description', 'narration', 'particulars', 'remarks', 'details',
    'transaction description', 'transaction details', 'description  narration', 'particular'
  ],
  referenceNumber: [
    'reference number', 'ref no', 'ref no', 'reference', 'ref_no',
    'cheque no', 'chequeref no', 'chqref no', 'ref num', 'reference_number', 'chqno'
  ],
  utrNumber: [
    'utr', 'utr number', 'utr no', 'utr_number', 'rrn', 'rrn number', 'upi ref no'
  ],
  transactionId: [
    'transaction id', 'txn id', 'txnid', 'transaction_id', 'id', 'txn_id'
  ],
  debit: [
    'debit', 'withdrawal', 'withdrawals', 'debit amount', 'dr', 'dr amount'
  ],
  credit: [
    'credit', 'deposit', 'deposits', 'credit amount', 'cr', 'cr amount'
  ],
  amount: [
    'amount', 'net amount', 'transaction amount', 'amt', 'txn amt'
  ],
  balance: [
    'balance', 'closing balance', 'running balance', 'avail balance', 'bal'
  ]
};

const matchHeader = (headerName: string): string | null => {
  // Strip non-alphanumeric, lowercase, and trim
  const cleaned = headerName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const cleanedAlias = alias.replace(/[^a-z0-9]/g, '');
      if (cleaned === cleanedAlias) {
        return canonical;
      }
    }
  }
  return null;
};

/**
 * Handler for bank statement uploads.
 */
const uploadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const file = req.file;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  if (!file) {
    return res.status(400).json({ error: 'No statement file uploaded' });
  }

  try {
    const fileHash = computeHash(file.buffer);

    // Check if file is already imported
    const existing = await prisma.bankStatement.findUnique({
      where: { fileHash },
    });

    if (existing) {
      return res.status(409).json({ error: 'This statement file has already been uploaded previously.' });
    }

    // 1. Parse rows depending on the file type
    console.log(`Parsing statement file ${file.originalname}...`);
    let rows: any[][] = [];
    const extension = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();

    if (extension === '.csv') {
      const csvContent = file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvContent, { header: false, skipEmptyLines: true });
      rows = parsed.data as any[][];
    } else if (extension === '.xlsx' || extension === '.xls') {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload CSV or XLSX.' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }

    // 2. Detect the header row and map columns
    let headerIndex = -1;
    let mappedHeaders: Record<number, string> = {};

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      if (!row) continue;
      
      let matchCount = 0;
      const tempMapped: Record<number, string> = {};

      for (let j = 0; j < row.length; j++) {
        const val = String(row[j] || '').trim();
        if (!val) continue;
        const matched = matchHeader(val);
        if (matched) {
          tempMapped[j] = matched;
          matchCount++;
        }
      }

      // If we matched at least 3 critical columns, this is the header row
      if (matchCount >= 3) {
        headerIndex = i;
        mappedHeaders = tempMapped;
        break;
      }
    }

    if (headerIndex === -1) {
      return res.status(422).json({
        error: 'Failed to auto-detect statement headers. Ensure your sheet has columns for Date, Description, and Amount/Debit/Credit.',
      });
    }

    // 3. Process transactions starting below the header row
    const transactionsToCreate: any[] = [];

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const hasVal = row.some(cell => String(cell || '').trim() !== '');
      if (!hasVal) continue;

      const mappedRow: any = {
        transactionDate: null,
        valueDate: null,
        description: '',
        referenceNumber: null,
        utrNumber: null,
        transactionId: null,
        debit: null,
        credit: null,
        amount: null,
        balance: null,
      };

      for (let j = 0; j < row.length; j++) {
        const canonical = mappedHeaders[j];
        if (canonical) {
          mappedRow[canonical] = row[j];
        }
      }

      if (!mappedRow.description) continue;

      const description = String(mappedRow.description).trim();
      const txDate = TransactionNormalizer.normalizeDate(mappedRow.transactionDate);
      const valDate = TransactionNormalizer.normalizeDate(mappedRow.valueDate);

      const debit = TransactionNormalizer.normalizeAmount(mappedRow.debit);
      const credit = TransactionNormalizer.normalizeAmount(mappedRow.credit);
      const balance = TransactionNormalizer.normalizeAmount(mappedRow.balance);
      let amount = TransactionNormalizer.normalizeAmount(mappedRow.amount);

      // Interpolate signed amount if not explicitly provided
      if (amount === null) {
        if (credit !== null) {
          amount = credit;
        } else if (debit !== null) {
          amount = -Math.abs(debit);
        } else {
          continue; // skip rows with no numeric volume
        }
      }

      const refNo = TransactionNormalizer.normalizeText(mappedRow.referenceNumber);
      const utrNo = TransactionNormalizer.normalizeText(mappedRow.utrNumber) || refNo;
      const txnId = TransactionNormalizer.normalizeText(mappedRow.transactionId) || utrNo;

      transactionsToCreate.push({
        transactionDate: txDate,
        valueDate: valDate,
        description,
        referenceNumber: refNo,
        utrNumber: utrNo,
        transactionId: txnId,
        debit,
        credit,
        amount,
        balance,
        currency: 'INR',
        rawRowJson: JSON.stringify(row),
      });
    }

    if (transactionsToCreate.length === 0) {
      return res.status(422).json({ error: 'No valid transaction records could be parsed from the statement.' });
    }

    // 4. Stream file upload to Cloudinary
    const cloudinaryResult = await uploadFromBuffer(file.buffer, 'payment_reconciliation/statements', file.originalname.split('.')[0]);

    // 5. Save the BankStatement record
    const bankStatement = await prisma.bankStatement.create({
      data: {
        filename: file.originalname,
        cloudinaryUrl: cloudinaryResult.url,
        cloudinaryPublicId: cloudinaryResult.publicId,
        fileHash,
        userId,
      },
    });

    // 6. Bulk create the statement transactions linked to the file
    const txsWithFileId = transactionsToCreate.map(tx => ({
      ...tx,
      statementFileId: bankStatement.id,
    }));

    await prisma.statementTransaction.createMany({
      data: txsWithFileId,
    });

    return res.json({
      statement: bankStatement,
      count: transactionsToCreate.length,
    });
  } catch (error: any) {
    console.error('Statement import error:', error);
    return res.status(500).json({ error: 'Internal error processing the statement file' });
  }
};

/**
 * Handler for deleting a statement file.
 */
const deleteHandler = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const statement = await prisma.bankStatement.findFirst({
      where: { id, userId },
    });

    if (!statement) {
      return res.status(404).json({ error: 'Statement file not found or already deleted.' });
    }

    // 1. Delete file from Cloudinary (with error suppression if already deleted)
    try {
      if (statement.cloudinaryPublicId) {
        await deleteFromCloudinary(statement.cloudinaryPublicId);
      }
    } catch (clError) {
      console.warn(`Failed to delete Cloudinary asset ${statement.cloudinaryPublicId}:`, clError);
    }

    // 2. Delete from database (onDelete: Cascade cleans up StatementTransactions and ReconciliationMatches)
    const deleteResult = await prisma.bankStatement.deleteMany({
      where: { id, userId },
    });

    if (deleteResult.count === 0) {
      return res.status(404).json({ error: 'Statement file was already deleted by another process.' });
    }

    return res.json({ message: 'Statement file deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Statement file not found or already deleted.' });
    }
    console.error('Delete statement error:', error);
    return res.status(500).json({ error: 'Failed to delete statement file' });
  }
};

// Route mappings
router.post('/upload', requireAuth, upload.single('file'), uploadHandler);
router.post('/bank-statements', requireAuth, upload.single('file'), uploadHandler);

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User session not found' });
  }

  try {
    const statements = await prisma.bankStatement.findMany({
      where: { userId },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { importedAt: 'desc' },
    });

    const formatted = statements.map(s => ({
      id: s.id,
      filename: s.filename,
      cloudinaryUrl: s.cloudinaryUrl,
      cloudinaryPublicId: s.cloudinaryPublicId,
      fileHash: s.fileHash,
      importedAt: s.importedAt,
      transactionCount: s._count.transactions,
    }));

    return res.json(formatted);
  } catch (error: any) {
    console.error('Fetch statements error:', error);
    return res.status(500).json({ error: 'Failed to retrieve statement files' });
  }
});

router.delete('/:id', requireAuth, deleteHandler);
router.delete('/bank-statements/:id', requireAuth, deleteHandler);

export default router;
