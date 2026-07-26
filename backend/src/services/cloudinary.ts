import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary from environment variables
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn('Cloudinary environment variables are not fully set up. File uploads will fail.');
}

/**
 * Uploads a file buffer directly to Cloudinary via a stream.
 * Avoids saving files to the ephemeral disk.
 */
export const uploadFromBuffer = (
  buffer: Buffer,
  folder: string,
  fileNameWithoutExt?: string
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    // Generate a unique public ID suffix to avoid duplicates
    const publicId = fileNameWithoutExt 
      ? `${fileNameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`
      : `file_${Date.now()}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary upload returned empty response'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    stream.pipe(uploadStream);
  });
};

/**
 * Deletes an asset from Cloudinary using its public ID.
 */
export const deleteFromCloudinary = (publicId: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { invalidate: true }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};
