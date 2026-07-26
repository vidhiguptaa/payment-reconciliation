import multer from 'multer';

// Use memory storage to process files as buffers, complying with ephemeral file constraints
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit uploads to 10MB per file
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation
    const allowedMimeTypes = [
      'image/png',
      'image/jpg',
      'image/jpeg',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported.`));
    }
  },
});
