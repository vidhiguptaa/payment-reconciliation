import axios from 'axios';

const getBaseUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL !== undefined && import.meta.env.VITE_API_BASE_URL !== '') {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173') {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === 'tauri.localhost' || window.location.protocol.startsWith('tauri')) {
      return 'http://127.0.0.1:8000';
    }
    return window.location.origin;
  }
  return 'http://127.0.0.1:8000';
};

const API_BASE_URL = getBaseUrl();

export interface HealthStatus {
  status: string;
  app_name: string;
  version: string;
  database: string;
  timestamp: string;
}

export const checkHealth = async (): Promise<HealthStatus> => {
  const response = await axios.get<HealthStatus>(`${API_BASE_URL}/api/health`, { timeout: 3000 });
  return response.data;
};

export interface ScreenshotItem {
  id: number;
  filename: string;
  filepath: string;
  file_hash: string;
  extension: string;
  file_size: number;
  created_at: string;
  imported_at: string;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  thumbnail_path?: string | null;
  image_url: string;
  thumbnail_url?: string | null;
}

export interface ScreenshotsResponse {
  total: number;
  items: ScreenshotItem[];
}

export interface ScanDetail {
  id?: number;
  filename: string;
  status: string;
  file_hash?: string;
  file_size?: number;
  reason?: string;
}

export interface ScanSummary {
  total_scanned: number;
  new_imported: number;
  skipped_duplicates: number;
  unsupported_ignored: number;
  failed_errors: number;
  details: ScanDetail[];
}

export interface ProcessingJobItem {
  id: number;
  job_id: string;
  screenshot_id: number;
  current_stage: 'QUEUED' | 'OCR' | 'EXTRACTION' | 'RECONCILIATION' | 'COMPLETED' | 'FAILED';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface JobsListResponse {
  total: number;
  jobs: ProcessingJobItem[];
}

export interface OCRResultItem {
  id: number;
  screenshot_id: number;
  provider: string;
  raw_text: string;
  raw_json: string;
  confidence: number;
  processing_time_ms: number;
  status: string;
  error_message?: string | null;
  created_at: string;
}

export interface ExtractedTransactionItem {
  id: number;
  ocr_result_id?: number | null;
  screenshot_id: number;
  amount?: number | null;
  currency: string;
  transaction_date?: string | null;
  transaction_time?: string | null;
  reference_number?: string | null;
  utr_number?: string | null;
  transaction_id?: string | null;
  sender_name?: string | null;
  receiver_name?: string | null;
  sender_account?: string | null;
  receiver_account?: string | null;
  bank_name?: string | null;
  ifsc?: string | null;
  transaction_type?: string | null;
  payment_status: string;
  remarks?: string | null;
  raw_ai_json: string;
  confidence: number;
  is_manually_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExtractedTransactionUpdatePayload {
  amount?: number | null;
  currency?: string | null;
  transaction_date?: string | null;
  transaction_time?: string | null;
  reference_number?: string | null;
  utr_number?: string | null;
  transaction_id?: string | null;
  sender_name?: string | null;
  receiver_name?: string | null;
  sender_account?: string | null;
  receiver_account?: string | null;
  bank_name?: string | null;
  ifsc?: string | null;
  transaction_type?: string | null;
  payment_status?: string | null;
  remarks?: string | null;
}

export interface StatementFileItem {
  id: number;
  filename: string;
  filepath: string;
  file_hash: string;
  extension: string;
  imported_at: string;
  status: string;
  total_transactions: number;
  processing_time_ms: number;
  created_at: string;
}

export interface StatementFileListResponse {
  total: number;
  items: StatementFileItem[];
}

export interface StatementTransactionItem {
  id: number;
  statement_file_id: number;
  transaction_date?: string | null;
  value_date?: string | null;
  description?: string | null;
  reference_number?: string | null;
  utr_number?: string | null;
  transaction_id?: string | null;
  debit?: number | null;
  credit?: number | null;
  amount?: number | null;
  balance?: number | null;
  currency: string;
  bank_name?: string | null;
  raw_row_json: string;
  created_at: string;
}

export interface StatementTransactionsPaginatedResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  transactions: StatementTransactionItem[];
}

export interface StatementImportSummary {
  total_scanned: number;
  new_imported: number;
  skipped_duplicates: number;
  unsupported_ignored: number;
  failed_errors: number;
  details: {
    id?: number;
    filename: string;
    status: string;
    file_hash?: string;
    total_transactions?: number;
    processing_time_ms?: number;
    reason?: string;
  }[];
}

export interface TransactionMatchItem {
  id: number;
  extracted_transaction_id: number;
  statement_transaction_id?: number | null;
  match_status: 'Matched' | 'Possible Match' | 'Needs Review' | 'Unmatched';
  match_type: 'AUTO_MATCHED' | 'MANUALLY_MATCHED';
  confidence_score: number;
  match_reason_json: string;
  field_scores_json: string;
  created_at: string;
  updated_at: string;
  extracted_transaction?: Partial<ExtractedTransactionItem> | null;
  statement_transaction?: Partial<StatementTransactionItem> | null;
  screenshot_id?: number;
  screenshot_filename?: string;
}

export interface ReconciliationListResponse {
  total: number;
  matched_count: number;
  possible_count: number;
  needs_review_count: number;
  unmatched_count: number;
  items: TransactionMatchItem[];
}

export interface FieldComparisonItem {
  extracted?: string | number | null;
  statement?: string | number | null;
  status: 'MATCH' | 'PARTIAL MATCH' | 'MISMATCH' | 'NOT AVAILABLE';
}

export interface ReconciliationDetailResponse {
  match: TransactionMatchItem;
  extracted_transaction: ExtractedTransactionItem;
  statement_transaction?: StatementTransactionItem | null;
  screenshot_image_url: string;
  field_comparison: Record<string, FieldComparisonItem>;
}

export const getHealthCheck = async (): Promise<HealthStatus> => {
  const response = await axios.get<HealthStatus>(`${API_BASE_URL}/api/health`, {
    timeout: 5000,
  });
  return response.data;
};

export const scanScreenshots = async (): Promise<ScanSummary> => {
  const response = await axios.post<ScanSummary>(`${API_BASE_URL}/api/screenshots/scan`, {}, {
    timeout: 30000,
  });
  return response.data;
};

export const getScreenshots = async (): Promise<ScreenshotsResponse> => {
  const response = await axios.get<ScreenshotsResponse>(`${API_BASE_URL}/api/screenshots`, {
    timeout: 5000,
  });
  return response.data;
};

export const getScreenshotById = async (id: number): Promise<ScreenshotItem> => {
  const response = await axios.get<ScreenshotItem>(`${API_BASE_URL}/api/screenshots/${id}`, {
    timeout: 5000,
  });
  return response.data;
};

export const processScreenshot = async (screenshotId: number): Promise<ProcessingJobItem> => {
  const response = await axios.post<ProcessingJobItem>(`${API_BASE_URL}/api/jobs/process/${screenshotId}`, {}, {
    timeout: 30000,
  });
  return response.data;
};

export const processAllPending = async (): Promise<JobsListResponse> => {
  const response = await axios.post<JobsListResponse>(`${API_BASE_URL}/api/jobs/process-pending`, {}, {
    timeout: 60000,
  });
  return response.data;
};

export const getJobs = async (): Promise<JobsListResponse> => {
  const response = await axios.get<JobsListResponse>(`${API_BASE_URL}/api/jobs`, {
    timeout: 5000,
  });
  return response.data;
};

export const runOCR = async (screenshotId: number, providerName?: string): Promise<OCRResultItem> => {
  const params = providerName ? { provider_name: providerName } : {};
  const response = await axios.post<OCRResultItem>(`${API_BASE_URL}/api/ocr/run/${screenshotId}`, {}, {
    params,
    timeout: 30000,
  });
  return response.data;
};

export const getOCRResult = async (screenshotId: number): Promise<OCRResultItem> => {
  const response = await axios.get<OCRResultItem>(`${API_BASE_URL}/api/ocr/${screenshotId}`, {
    timeout: 5000,
  });
  return response.data;
};

export const getExtractedTransaction = async (screenshotId: number): Promise<ExtractedTransactionItem> => {
  const response = await axios.get<ExtractedTransactionItem>(`${API_BASE_URL}/api/extraction/${screenshotId}`, {
    timeout: 5000,
  });
  return response.data;
};

export const runExtraction = async (screenshotId: number): Promise<ExtractedTransactionItem> => {
  const response = await axios.post<ExtractedTransactionItem>(`${API_BASE_URL}/api/extraction/run/${screenshotId}`, {}, {
    timeout: 30000,
  });
  return response.data;
};

export const updateExtractedTransaction = async (
  extractedId: number,
  payload: ExtractedTransactionUpdatePayload
): Promise<ExtractedTransactionItem> => {
  const response = await axios.put<ExtractedTransactionItem>(`${API_BASE_URL}/api/extraction/${extractedId}`, payload, {
    timeout: 5000,
  });
  return response.data;
};

export const importStatements = async (): Promise<StatementImportSummary> => {
  const response = await axios.post<StatementImportSummary>(`${API_BASE_URL}/api/statements/import`, {}, {
    timeout: 30000,
  });
  return response.data;
};

export const getStatements = async (): Promise<StatementFileListResponse> => {
  const response = await axios.get<StatementFileListResponse>(`${API_BASE_URL}/api/statements`, {
    timeout: 5000,
  });
  return response.data;
};

export const getStatementById = async (id: number): Promise<StatementFileItem> => {
  const response = await axios.get<StatementFileItem>(`${API_BASE_URL}/api/statements/${id}`, {
    timeout: 5000,
  });
  return response.data;
};

export const getStatementTransactions = async (
  id: number,
  search?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<StatementTransactionsPaginatedResponse> => {
  const response = await axios.get<StatementTransactionsPaginatedResponse>(`${API_BASE_URL}/api/statements/${id}/transactions`, {
    params: { search, page, page_size: pageSize },
    timeout: 5000,
  });
  return response.data;
};

export const runBatchReconciliation = async (): Promise<{ total_processed: number }> => {
  const response = await axios.post<{ total_processed: number }>(`${API_BASE_URL}/api/reconciliation/run`, {}, {
    timeout: 60000,
  });
  return response.data;
};

export const runSingleReconciliation = async (extractedId: number): Promise<TransactionMatchItem> => {
  const response = await axios.post<TransactionMatchItem>(`${API_BASE_URL}/api/reconciliation/run/${extractedId}`, {}, {
    timeout: 30000,
  });
  return response.data;
};

export const getReconciliationMatches = async (matchStatus?: string): Promise<ReconciliationListResponse> => {
  const params = matchStatus ? { match_status: matchStatus } : {};
  const response = await axios.get<ReconciliationListResponse>(`${API_BASE_URL}/api/reconciliation`, {
    params,
    timeout: 5000,
  });
  return response.data;
};

export const getReconciliationDetail = async (id: number): Promise<ReconciliationDetailResponse> => {
  const response = await axios.get<ReconciliationDetailResponse>(`${API_BASE_URL}/api/reconciliation/${id}`, {
    timeout: 5000,
  });
  return response.data;
};

export const manualMatchTransaction = async (
  id: number,
  statementTransactionId: number
): Promise<TransactionMatchItem> => {
  const response = await axios.post<TransactionMatchItem>(
    `${API_BASE_URL}/api/reconciliation/${id}/manual-match`,
    { statement_transaction_id: statementTransactionId },
    { timeout: 5000 }
  );
  return response.data;
};

export const rejectMatch = async (id: number): Promise<TransactionMatchItem> => {
  const response = await axios.post<TransactionMatchItem>(
    `${API_BASE_URL}/api/reconciliation/${id}/reject`,
    {},
    { timeout: 5000 }
  );
  return response.data;
};

export const getMediaUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
};

// ==================== Settings API ====================

export interface AppSettings {
  screenshots_dir: string;
  statements_dir: string;
  backup_dir: string;
  ocr_provider: string;
  theme: string;
  auto_start_watcher: boolean;
  auto_reconcile: boolean;
  auto_import_statements: boolean;
  show_processing_notifications: boolean;
  last_tab?: string;
}

export interface FolderValidation {
  path: string;
  exists: boolean;
  is_directory: boolean;
  is_writable: boolean;
  valid: boolean;
}

export const getSettings = async (): Promise<AppSettings> => {
  const response = await axios.get<AppSettings>(`${API_BASE_URL}/api/settings`, { timeout: 5000 });
  return response.data;
};

export const updateSettings = async (updates: Partial<AppSettings>): Promise<any> => {
  const response = await axios.put(`${API_BASE_URL}/api/settings`, updates, { timeout: 5000 });
  return response.data;
};

export const validateFolder = async (path: string): Promise<FolderValidation> => {
  const response = await axios.post<FolderValidation>(
    `${API_BASE_URL}/api/settings/validate-folder`,
    { path },
    { timeout: 5000 }
  );
  return response.data;
};

export const createFolder = async (path: string): Promise<any> => {
  const response = await axios.post(
    `${API_BASE_URL}/api/settings/create-folder`,
    { path },
    { timeout: 5000 }
  );
  return response.data;
};

export const getWatcherStatus = async (): Promise<{ running: boolean }> => {
  const response = await axios.get<{ running: boolean }>(`${API_BASE_URL}/api/settings/watcher-status`, { timeout: 3000 });
  return response.data;
};

// ==================== Backups & Detailed Health API ====================

export interface BackupItem {
  filename: string;
  filepath: string;
  size_bytes: number;
  created_at: string;
  is_auto: boolean;
}

export interface ComponentHealth {
  backend_running: boolean;
  watcher_running: boolean;
  database_connected: boolean;
  ocr_provider_available: boolean;
  db_path: string;
  config_path: string;
}

export interface StageMetric {
  total_runs: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  last_ms: number;
}

export interface PerformanceMetrics {
  ocr: StageMetric;
  extraction: StageMetric;
  import: StageMetric;
  reconciliation: StageMetric;
}

export interface DetailedHealthInfo {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  database: string;
  timestamp: string;
  components: ComponentHealth;
  metrics: PerformanceMetrics;
}

export const getDetailedHealth = async (): Promise<DetailedHealthInfo> => {
  const response = await axios.get<DetailedHealthInfo>(`${API_BASE_URL}/api/health`, { timeout: 5000 });
  return response.data;
};

export const getBackups = async (): Promise<BackupItem[]> => {
  const response = await axios.get<BackupItem[]>(`${API_BASE_URL}/api/backups`, { timeout: 5000 });
  return response.data;
};

export const createBackup = async (): Promise<BackupItem> => {
  const response = await axios.post<BackupItem>(`${API_BASE_URL}/api/backups/create`, {}, { timeout: 10000 });
  return response.data;
};

export const restoreBackup = async (filename: string): Promise<any> => {
  const response = await axios.post(`${API_BASE_URL}/api/backups/restore`, { filename }, { timeout: 15000 });
  return response.data;
};

export const deleteBackup = async (filename: string): Promise<any> => {
  const response = await axios.delete(`${API_BASE_URL}/api/backups/${filename}`, { timeout: 5000 });
  return response.data;
};

// --- Ingestion Flow Types ---
export interface FileInfo {
  filename: string;
  size: number;
  hash: string;
}

export interface CheckDuplicatesRequest {
  files: FileInfo[];
}

export interface ExistingFileInfo {
  hash: string;
  screenshot_id: number;
  imported_at: string;
}

export interface MissingFileInfo {
  filename: string;
  hash: string;
}

export interface InvalidFileInfo {
  filename: string;
  hash: string;
  reason: string;
}

export interface DuplicateCheckResponse {
  summary: {
    total_checked: number;
    existing_count: number;
    missing_count: number;
    invalid_count: number;
  };
  existing: ExistingFileInfo[];
  missing: MissingFileInfo[];
  invalid: InvalidFileInfo[];
}

export interface BatchUploadDetail {
  id?: number | null;
  filename: string;
  status: string;
  hash: string;
  reason?: string | null;
}

export interface BatchUploadResponse {
  batch_id: string;
  imported_count: number;
  details: BatchUploadDetail[];
}

export interface ExistingStatementFileInfo {
  hash: string;
  statement_file_id: number;
  imported_at: string;
}

export interface CheckStatementDuplicatesResponse {
  summary: {
    total_checked: number;
    existing_count: number;
    missing_count: number;
    invalid_count: number;
  };
  existing: ExistingStatementFileInfo[];
  missing: MissingFileInfo[];
  invalid: InvalidFileInfo[];
}

export interface BatchStatementUploadDetail {
  id?: number | null;
  filename: string;
  status: string;
  hash: string;
  new_transactions: number;
  reason?: string | null;
}

export interface BatchStatementUploadResponse {
  processed_files: number;
  details: BatchStatementUploadDetail[];
}

// --- Ingestion Flow API Endpoints ---
export const checkScreenshotDuplicates = async (files: FileInfo[]): Promise<DuplicateCheckResponse> => {
  const response = await axios.post<DuplicateCheckResponse>(
    `${API_BASE_URL}/api/screenshots/check-duplicates`,
    { files },
    { timeout: 10000 }
  );
  return response.data;
};

export const uploadScreenshots = async (
  files: File[], 
  onUploadProgress?: (progressEvent: any) => void
): Promise<BatchUploadResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });
  
  const response = await axios.post<BatchUploadResponse>(
    `${API_BASE_URL}/api/screenshots/batch-upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
      onUploadProgress,
    }
  );
  return response.data;
};

export const checkStatementDuplicates = async (files: FileInfo[]): Promise<CheckStatementDuplicatesResponse> => {
  const response = await axios.post<CheckStatementDuplicatesResponse>(
    `${API_BASE_URL}/api/statements/check-duplicates`,
    { files },
    { timeout: 10000 }
  );
  return response.data;
};

export const uploadStatements = async (
  files: File[],
  onUploadProgress?: (progressEvent: any) => void
): Promise<BatchStatementUploadResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });
  
  const response = await axios.post<BatchStatementUploadResponse>(
    `${API_BASE_URL}/api/statements/batch-upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
      onUploadProgress,
    }
  );
  return response.data;
};


