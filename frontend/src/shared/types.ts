export enum MatchStatus {
  MATCHED = 'Matched',
  POSSIBLE_MATCH = 'Possible Match',
  NEEDS_REVIEW = 'Needs Review',
  UNMATCHED = 'Unmatched'
}

export enum MatchType {
  AUTO_MATCHED = 'AUTO_MATCHED',
  MANUALLY_MATCHED = 'MANUALLY_MATCHED'
}

export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED'
}

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export interface PaymentImageDto {
  id: string;
  filename: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  fileHash: string;
  fileSize: number;
  status: ProcessingStatus;
  uploadedAt: string;
  
  // OCR fields (populated when status = PROCESSED)
  amount?: number | null;
  currency: string;
  transactionDate?: string | null;
  transactionTime?: string | null;
  referenceNumber?: string | null;
  utrNumber?: string | null;
  transactionId?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
  transactionType?: string | null;
  paymentStatus?: string | null;
}

export interface OCRResultDto {
  id: string;
  paymentImageId: string;
  provider: string;
  rawText: string;
  rawJson: string;
  confidence: number;
  processingTimeMs: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface BankStatementDto {
  id: string;
  filename: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  fileHash: string;
  importedAt: string;
  transactionCount: number;
}

export interface StatementTransactionDto {
  id: string;
  statementFileId: string;
  transactionDate?: string | null;
  valueDate?: string | null;
  description: string;
  referenceNumber?: string | null;
  utrNumber?: string | null;
  transactionId?: string | null;
  debit?: number | null;
  credit?: number | null;
  amount: number;
  balance?: number | null;
  currency: string;
  bankName?: string | null;
  rawRowJson: string;
  createdAt: string;
}

export interface ReconciliationReportDto {
  id: string;
  name: string;
  createdAt: string;
  matchedCount: number;
  possibleCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  totalCount: number;
}

export interface ReconciliationMatchDto {
  id: string;
  reportId: string;
  paymentImageId: string;
  paymentImage: PaymentImageDto;
  statementTransactionId?: string | null;
  statementTransaction?: StatementTransactionDto | null;
  matchStatus: MatchStatus;
  matchType: MatchType;
  confidenceScore: number;
  matchReasonJson: string; // JSON array of reasons
  fieldScoresJson: string; // JSON object of field-level scores
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetailDto {
  report: ReconciliationReportDto;
  matches: ReconciliationMatchDto[];
  unmatchedImages: PaymentImageDto[];
  unmatchedTransactions: StatementTransactionDto[];
}
