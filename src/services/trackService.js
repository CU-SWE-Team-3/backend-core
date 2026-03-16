const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const { publishToQueue } = require('../utils/queueProducer');
const Track = require('../models/trackModel');

// 1. GENERATE SAS TOKEN & CHECK LIMITS
exports.generateUploadUrl = async (user, trackData) => {
  const { title, format, size, duration } = trackData;

  // Module 12: Premium Subscriptions (Upload Limit Check)
  if (!user.isPremium) {
    const trackCount = await Track.countDocuments({ artist: user._id });
    if (trackCount >= 3) {
      throw new Error(
        'Upload limit reached. Free accounts are limited to 3 tracks. Please upgrade to Pro.'
      );
    }
  }

  if (!format || !format.startsWith('audio/')) {
    throw new Error('Invalid format. Must be an audio file type.');
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
    throw new Error('Track not found.');
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
  // Use findOne to search the database for the matching permalink string
  const track = await Track.findOne({ permalink: permalink }).populate(
    'artist',
    'displayName permalink avatarUrl isPremium'
  );

  if (!track || track.processingState !== 'Finished') {
    throw new Error('Track not found or is still processing.');
  }

  return track;
};

// 4. DOWNLOAD TRACK (Module 12: Premium Offline Listening)
exports.downloadTrackAudio = async (trackId, user) => {
  if (!user.isPremium) {
    throw new Error(
      'Requires Premium Subscription (Go+ or Pro) for offline listening.'
    );
  }

  const track = await Track.findById(trackId);
  if (!track || track.processingState !== 'Finished') {
    throw new Error('Track not found or not ready.');
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
    throw new Error('Track not found.');
  }

  // 2. Security Check: Only the owner can delete their track
  if (track.artist.toString() !== userId.toString()) {
    throw new Error('Unauthorized: You can only delete your own tracks.');
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
