const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a buffer or file path to Cloudinary
 */
async function uploadFile(source, options = {}) {
  try {
    const result = await cloudinary.uploader.upload(source, {
      folder: `agentpro/${options.folder || 'general'}`,
      resource_type: options.resource_type || 'auto',
      ...options,
    });
    return result.secure_url;
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw error;
  }
}

/**
 * Delete a file from Cloudinary by public_id
 */
async function deleteFile(publicId) {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.error('Cloudinary delete error:', error);
    throw error;
  }
}

/**
 * Upload a PDF buffer (for receipts)
 *
 * IMPORTANT: Cloudinary blocks public delivery of PDF/ZIP files by default
 * on new accounts (an account-level anti-abuse security setting, separate
 * from anything configured here). This upload call will succeed and
 * return a URL with no error — the resulting URL will only fail (HTTP 401
 * "ACL or Deny") when someone actually tries to open it, if the account
 * hasn't enabled "Allow delivery of PDF and ZIP files" under
 * Settings → Security on the Cloudinary dashboard. See
 * docs/DEPLOYMENT.md step 1.3 — this cannot be fixed from application
 * code; it's an account configuration step.
 */
async function uploadPDF(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'agentpro/receipts',
        resource_type: 'raw',
        public_id: filename,
        format: 'pdf',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}


/**
 * Upload an audio buffer (for voice note posts in the Community Hub).
 * Mirrors uploadPDF's proven upload_stream pattern above - Cloudinary
 * handles audio under resource_type 'video', not 'auto' or 'raw'.
 */
async function uploadAudio(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'agentpro/voice_notes',
        resource_type: 'video',
        public_id: filename,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadFile, deleteFile, uploadPDF, uploadAudio };
