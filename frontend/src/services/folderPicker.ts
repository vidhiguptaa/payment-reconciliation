import { 
  checkScreenshotDuplicates, 
  uploadScreenshots, 
  checkStatementDuplicates, 
  uploadStatements,
  FileInfo
} from './api';

export async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function selectFolder(): Promise<File[]> {
  const globalWindow = window as any;
  if (globalWindow.showDirectoryPicker) {
    try {
      const dirHandle = await globalWindow.showDirectoryPicker();
      const files: File[] = [];
      
      async function scan(handle: any) {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            files.push(file);
          } else if (entry.kind === 'directory') {
            await scan(entry);
          }
        }
      }
      
      await scan(dirHandle);
      return files;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return [];
      }
      console.warn('showDirectoryPicker failed, falling back to input:', err);
    }
  }
  
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', 'true');
    input.setAttribute('directory', 'true');
    input.multiple = true;
    input.style.display = 'none';
    
    document.body.appendChild(input);
    
    input.onchange = () => {
      const files = Array.from(input.files || []);
      document.body.removeChild(input);
      resolve(files);
    };
    
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve([]);
    };
    
    input.click();
  });
}

export interface ProcessingProgress {
  step: 'idle' | 'hashing' | 'checking_duplicates' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalFiles: number;
  uploadedCount: number;
  skippedCount: number;
  errorMessage?: string;
}

export async function processScreenshotFolder(
  onProgress: (progress: ProcessingProgress) => void,
  onUploadProgress?: (percent: number) => void
): Promise<{ total: number; uploaded: number; skipped: number }> {
  onProgress({ step: 'hashing', progress: 0, totalFiles: 0, uploadedCount: 0, skippedCount: 0 });
  
  const allFiles = await selectFolder();
  if (allFiles.length === 0) {
    onProgress({ step: 'idle', progress: 0, totalFiles: 0, uploadedCount: 0, skippedCount: 0 });
    return { total: 0, uploaded: 0, skipped: 0 };
  }
  
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const imageFiles = allFiles.filter(file => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return supportedExtensions.includes(ext);
  });
  
  if (imageFiles.length === 0) {
    throw new Error('No supported image files found in the selected folder.');
  }
  
  onProgress({ step: 'hashing', progress: 0, totalFiles: imageFiles.length, uploadedCount: 0, skippedCount: 0 });
  
  const fileInfos: FileInfo[] = [];
  const filesWithHashes: { file: File; hash: string }[] = [];
  
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const hash = await computeFileHash(file);
    fileInfos.push({ filename: file.name, size: file.size, hash });
    filesWithHashes.push({ file, hash });
    onProgress({ 
      step: 'hashing', 
      progress: Math.round(((i + 1) / imageFiles.length) * 100), 
      totalFiles: imageFiles.length, 
      uploadedCount: 0, 
      skippedCount: 0 
    });
  }
  
  onProgress({ step: 'checking_duplicates', progress: 100, totalFiles: imageFiles.length, uploadedCount: 0, skippedCount: 0 });
  const dupCheck = await checkScreenshotDuplicates(fileInfos);
  
  const missingHashes = new Set(dupCheck.missing.map(f => f.hash));
  const filesToUpload = filesWithHashes
    .filter(item => missingHashes.has(item.hash))
    .map(item => item.file);
    
  const skippedCount = dupCheck.existing.length;
  
  if (filesToUpload.length === 0) {
    onProgress({ 
      step: 'processing', 
      progress: 100, 
      totalFiles: imageFiles.length, 
      uploadedCount: 0, 
      skippedCount 
    });
    return { total: imageFiles.length, uploaded: 0, skipped: skippedCount };
  }
  
  onProgress({ 
    step: 'uploading', 
    progress: 0, 
    totalFiles: imageFiles.length, 
    uploadedCount: filesToUpload.length, 
    skippedCount 
  });
  
  await uploadScreenshots(filesToUpload, (progressEvent) => {
    if (progressEvent.total) {
      const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      if (onUploadProgress) onUploadProgress(percent);
      onProgress({ 
        step: 'uploading', 
        progress: percent, 
        totalFiles: imageFiles.length, 
        uploadedCount: filesToUpload.length, 
        skippedCount 
      });
    }
  });
  
  onProgress({ 
    step: 'processing', 
    progress: 100, 
    totalFiles: imageFiles.length, 
    uploadedCount: filesToUpload.length, 
    skippedCount 
  });
  
  return { total: imageFiles.length, uploaded: filesToUpload.length, skipped: skippedCount };
}

export async function processStatementFolder(
  onProgress: (progress: ProcessingProgress) => void,
  onUploadProgress?: (percent: number) => void
): Promise<{ total: number; uploaded: number; skipped: number }> {
  onProgress({ step: 'hashing', progress: 0, totalFiles: 0, uploadedCount: 0, skippedCount: 0 });
  
  const allFiles = await selectFolder();
  if (allFiles.length === 0) {
    onProgress({ step: 'idle', progress: 0, totalFiles: 0, uploadedCount: 0, skippedCount: 0 });
    return { total: 0, uploaded: 0, skipped: 0 };
  }
  
  const supportedExtensions = ['.csv', '.xlsx', '.xls'];
  const statementFiles = allFiles.filter(file => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return supportedExtensions.includes(ext);
  });
  
  if (statementFiles.length === 0) {
    throw new Error('No supported bank statement files (.csv, .xlsx, .xls) found in the selected folder.');
  }
  
  onProgress({ step: 'hashing', progress: 0, totalFiles: statementFiles.length, uploadedCount: 0, skippedCount: 0 });
  
  const fileInfos: FileInfo[] = [];
  const filesWithHashes: { file: File; hash: string }[] = [];
  
  for (let i = 0; i < statementFiles.length; i++) {
    const file = statementFiles[i];
    const hash = await computeFileHash(file);
    fileInfos.push({ filename: file.name, size: file.size, hash });
    filesWithHashes.push({ file, hash });
    onProgress({ 
      step: 'hashing', 
      progress: Math.round(((i + 1) / statementFiles.length) * 100), 
      totalFiles: statementFiles.length, 
      uploadedCount: 0, 
      skippedCount: 0 
    });
  }
  
  onProgress({ step: 'checking_duplicates', progress: 100, totalFiles: statementFiles.length, uploadedCount: 0, skippedCount: 0 });
  const dupCheck = await checkStatementDuplicates(fileInfos);
  
  const missingHashes = new Set(dupCheck.missing.map(f => f.hash));
  const filesToUpload = filesWithHashes
    .filter(item => missingHashes.has(item.hash))
    .map(item => item.file);
    
  const skippedCount = dupCheck.existing.length;
  
  if (filesToUpload.length === 0) {
    onProgress({ 
      step: 'processing', 
      progress: 100, 
      totalFiles: statementFiles.length, 
      uploadedCount: 0, 
      skippedCount 
    });
    return { total: statementFiles.length, uploaded: 0, skipped: skippedCount };
  }
  
  onProgress({ 
    step: 'uploading', 
    progress: 0, 
    totalFiles: statementFiles.length, 
    uploadedCount: filesToUpload.length, 
    skippedCount 
  });
  
  await uploadStatements(filesToUpload, (progressEvent) => {
    if (progressEvent.total) {
      const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      if (onUploadProgress) onUploadProgress(percent);
      onProgress({ 
        step: 'uploading', 
        progress: percent, 
        totalFiles: statementFiles.length, 
        uploadedCount: filesToUpload.length, 
        skippedCount 
      });
    }
  });
  
  onProgress({ 
    step: 'processing', 
    progress: 100, 
    totalFiles: statementFiles.length, 
    uploadedCount: filesToUpload.length, 
    skippedCount 
  });
  
  return { total: statementFiles.length, uploaded: filesToUpload.length, skipped: skippedCount };
}
