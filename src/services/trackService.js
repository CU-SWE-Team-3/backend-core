const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const Track = require('../models/trackModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const { publishToQueue } = require('../utils/queueProducer');
const AppError = require('../utils/appError');
// ==========================================
// BE-3: METADATA & VISIBILITY LOGIC
// ==========================================

/**
 * Updates track metadata (title, description, genre, tags, releaseDate)
 */
/**
 * Updates track metadata (title, description, genre, tags, releaseDate)
 */
/**
 * Updates track metadata (title, description, genre, tags, releaseDate)
 */
exports.updateTrackMetadata = async (trackId, userId, metadataBody) => {
  // 1. Filter the input so users can't secretly update BE-2's audioUrl or status
  const allowedUpdates = {};
  const allowedFields = [
    'title',
    'description',
    'genre',
    'tags',
    'releaseDate',
  ];

  allowedFields.forEach((field) => {
    if (metadataBody[field] !== undefined) {
      allowedUpdates[field] = metadataBody[field];
    }
  });

  // 2. Use findOneAndUpdate exactly like the User Profile service!
  // This does three things at once:
  // - Finds the track by its ID
  // - Verifies ownership in the same query ({ artist: userId })
  // - TRIGGERS THE SLUG PLUGIN AUTOMATICALLY!
  const track = await Track.findOneAndUpdate(
    { _id: trackId, artist: userId },
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );

  // 3. If no track was returned, it either doesn't exist or they don't own it
  if (!track) {
    throw new AppError(
      'Track not found or you do not have permission to edit it',
      404
    );
  }

  return track;
};

exports.getMyTracks = async (userId) => {
  const tracks = await Track.find({
    artist: userId,
    processingState: 'Finished',
  })
    .select('-audioUrl')
    .sort({ createdAt: -1 });

  return tracks;
};

/**
 * Toggles the track between Public and Private
 */
exports.toggleTrackVisibility = async (trackId, userId, isPublic) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }

  if (track.artist.toString() !== userId.toString()) {
    throw new AppError('You do not have permission to edit this track', 403);
  }

  // Update visibility
  track.isPublic = isPublic;
  await track.save();

  return track;
};
/**
 * Uploads a new artwork image to Azure and updates the track
 */
exports.updateTrackArtwork = async (trackId, userId, file) => {
  const track = await Track.findById(trackId);

  if (!track) {
    throw new AppError('Track not found', 404);
  }

  if (track.artist.toString() !== userId.toString()) {
    throw new AppError('You do not have permission to edit this track', 403);
  }

  // Upload the buffer to Azure Blob Storage
  const artworkUrl = await uploadImageToAzure(
    file.buffer,
    file.originalname,
    'artworks'
  );

  // Update the track document
  track.artworkUrl = artworkUrl;
  await track.save();

  return track;
};

// 1. GENERATE SAS TOKEN & CHECK LIMITS
exports.generateUploadUrl = async (user, trackData) => {
  const { title, format, size, duration } = trackData;

  // Module 12: Premium Subscriptions (Upload Limit Check)
  if (!user.isPremium) {
    const trackCount = await Track.countDocuments({ artist: user._id });
    if (trackCount >= 3) {
      throw new AppError(
        'Upload limit reached. Free accounts are limited to 3 tracks. Please upgrade to Pro.',
        403
      );
    }
  }

  const ALLOWED_FORMATS = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
  ];
  if (!format || !ALLOWED_FORMATS.includes(format)) {
    throw new AppError(
      `Unsupported format "${format}". Accepted formats: MP3 (audio/mpeg) and WAV (audio/wav).`,
      400
    );
  }

  const accountName = process.env.AZURE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_CONTAINER_NAME || 'biobeats-audio';

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey
  );

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const extension = format.includes('wav') ? '.wav' : '.mp3';
  const blobName = `track-${uniqueSuffix}${extension}`;

  const sasOptions = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('cw'), // create & write
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + 15 * 60 * 1000), // 15 mins
  };

  const sasToken = generateBlobSASQueryParameters(
    sasOptions,
    sharedKeyCredential
  ).toString();
  const uploadUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
  const finalAudioUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

  const newTrack = await Track.create({
    title: title || 'Untitled Track',
    artist: user._id,
    format,
    size,
    duration: Math.round(duration),
    audioUrl: finalAudioUrl,
    processingState: 'Processing',
  });

  return { trackId: newTrack._id, uploadUrl };
};

// 2. CONFIRM UPLOAD SUCCESS
exports.confirmUpload = async (trackId, userId) => {
  const track = await Track.findOne({ _id: trackId, artist: userId });
  if (!track) {
    throw new AppError('Track not found.', 404);
  }

  // 1. Instantly update the database status to 'Processing'
  track.processingState = 'Processing';
  await track.save();

  // 2. Create the ticket payload with exactly what the worker needs
  const ticketData = {
    trackId: track._id.toString(),
    audioUrl: track.audioUrl,
  };

  // 3. Drop the ticket into the RabbitMQ queue!
  // It only takes ~50 milliseconds to send this to the cloud.
  await publishToQueue('audio_processing_queue', ticketData);

  // 4. Return immediately to the user so the frontend doesn't hang
  return track;
};

// 3. FETCH SINGLE TRACK (Public streaming)
exports.getTrackByPermalink = async (permalink) => {
  const track = await Track.findOne({ permalink })
    .select('-audioUrl')
    .populate('artist', 'displayName permalink avatarUrl isPremium');

  if (!track || track.processingState !== 'Finished') {
    throw new Error('Track not found or is still processing.');
  }

  return track;
};

// 4. DOWNLOAD TRACK (Module 12: Premium Offline Listening)
exports.downloadTrackAudio = async (trackId, user) => {
  if (!user.isPremium) {
    throw new AppError(
      'Requires Premium Subscription (Go+ or Pro) for offline listening.',
      403
    );
  }

  const track = await Track.findById(trackId);
  if (!track || track.processingState !== 'Finished') {
    throw new AppError('Track not found or not ready.', 404);
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_CONTAINER_NAME;
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  const blobName = track.audioUrl.split('/').pop();
  const blobClient = containerClient.getBlobClient(blobName);

  const downloadResponse = await blobClient.download(0);

  return {
    stream: downloadResponse.readableStreamBody,
    contentType: downloadResponse.contentType,
    contentLength: downloadResponse.contentLength,
    filename: `${track.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`,
  };
};

// 5. DELETE TRACK (From MongoDB and Azure)
exports.deleteTrack = async (trackId, userId) => {
  // 1. Find the track
  const track = await Track.findById(trackId);

  if (!track) {
    throw new AppError('Track not found.', 404);
  }

  // 2. Security Check: Only the owner can delete their track
  if (track.artist.toString() !== userId.toString()) {
    throw new AppError(
      'Unauthorized: You can only delete your own tracks.',
      403
    );
  }

  // 3. Delete the physical file from Azure Blob Storage
  if (track.audioUrl) {
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName =
        process.env.AZURE_CONTAINER_NAME || 'biobeats-audio';
      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      // Extract the exact filename from the URL
      const blobName = track.audioUrl.split('/').pop();
      const blobClient = containerClient.getBlobClient(blobName);

      // Delete the file from the cloud
      await blobClient.deleteIfExists();
      console.log(`[Azure] Successfully deleted blob: ${blobName}`);
    } catch (azureError) {
      console.error('[Azure Error] Failed to delete file:', azureError.message);
      // We log the error but still proceed to delete the DB record so the user isn't stuck
    }
  }

  // 4. Delete the document from MongoDB
  await track.deleteOne();

  return true;
};
