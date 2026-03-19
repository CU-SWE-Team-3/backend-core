const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
const AppError = require('./appError');

/**
 * Uploads a file buffer to Azure Blob Storage
 * @param {Buffer} fileBuffer - The file buffer from multer in memory
 * @param {String} originalName - The original file name
 * @param {String} folder - The folder structure inside the container (e.g., 'artworks')
 * @returns {String} - The public URL of the uploaded blob
 */
exports.uploadImageToAzure = async (
  fileBuffer,
  originalName,
  folder = 'artworks'
) => {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || 'biobeats-assets';

    if (!connectionString) {
      throw new AppError(
        'Azure Storage connection string is missing in .env',
        500
      );
    }

    // 1. Initialize the Azure client
    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // 2. Ensure the container exists and allows public read access for images
    await containerClient.createIfNotExists({ access: 'blob' });

    // 3. Generate a unique filename (e.g., artworks/artwork-16849201.jpg)
    const extension = path.extname(originalName);
    const blobName = `${folder}/artwork-${Date.now()}${extension}`;

    // 4. Get a reference to the new blob
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // 5. Upload the raw buffer to Azure
    await blockBlobClient.uploadData(fileBuffer);

    // 6. Return the public URL to be saved in MongoDB
    return blockBlobClient.url;
  } catch (error) {
    throw new AppError(`Failed to upload: ${error.message}`, 500);
  }
};
