const Track = require('../models/trackModel');
const { uploadImageToAzure } = require('../utils/azureStorage');

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
  // - Verifies ownership in the same query ({ user: userId })
  // - TRIGGERS THE SLUG PLUGIN AUTOMATICALLY!
  const track = await Track.findOneAndUpdate(
    { _id: trackId, user: userId },
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );

  // 3. If no track was returned, it either doesn't exist or they don't own it
  if (!track) {
    throw new Error('Track not found or you do not have permission to edit it');
  }

  return track;
};

/**
 * Toggles the track between Public and Private
 */
exports.toggleTrackVisibility = async (trackId, userId, isPublic) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new Error('Track not found');
  }

  if (track.user.toString() !== userId.toString()) {
    throw new Error('You do not have permission to edit this track');
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
    throw new Error('Track not found');
  }

  if (track.user.toString() !== userId.toString()) {
    throw new Error('You do not have permission to edit this track');
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
