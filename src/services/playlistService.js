const Playlist = require('../models/playlistModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');
const notificationService = require('./notificationService');
const Follow = require('../models/followModel');
const { uploadImageToAzure } = require('../utils/azureStorage');

// ==========================================
// CREATE PLAYLIST
// ==========================================
exports.createPlaylist = async (userId, playlistData) => {
  const playlist = new Playlist(playlistData);
  playlist.creator = userId;

  await playlist.save();

  // Notify followers in the background — does not block the response
  if (!playlist.isPrivate) {
    Follow.find({ following: userId })
      .then((followers) => {
        followers.forEach((followDoc) => {
          notificationService.notifyNewPlaylist(
            followDoc.follower,
            userId,
            playlist._id
          );
        });
      })
      .catch((err) => {
        console.error(
          '[Notification Error] Failed to fetch followers for playlist alert:',
          err
        );
      });
  }

  const playlistObj = playlist.toObject();
  delete playlistObj.secretToken;
  delete playlistObj.__v;
  return playlistObj;
};

// ==========================================
// GET ALL PLAYLISTS (browse / profile page)
// ==========================================
exports.getAllPlaylists = async (queryParams, currentUser) => {
  const filter = { ...queryParams };

  // If browsing a specific creator's playlists, only show private ones to the owner
  if (filter.creator) {
    if (
      !currentUser ||
      currentUser._id.toString() !== filter.creator.toString()
    ) {
      filter.isPrivate = false;
    }
  } else {
    // General browse — public only
    filter.isPrivate = false;
  }

  const playlists = await Playlist.find(filter)
    .select(
      'title permalink artworkUrl trackCount totalDuration releaseType genre tags isPrivate creator createdAt likeCount repostCount playCount'
    )
    .populate('creator', 'displayName permalink avatarUrl')
    .sort('-createdAt');

  return playlists;
};

// ==========================================
// GET SINGLE PLAYLIST
// ==========================================
exports.getPlaylist = async (playlistId, user, secretToken) => {
  const playlist = await Playlist.findById(playlistId).populate({
    path: 'tracks',
    select: 'title permalink artworkUrl duration artist playCount likeCount',
    populate: { path: 'artist', select: 'displayName permalink avatarUrl' },
  });

  if (!playlist) {
    throw new AppError('Playlist not found', 404);
  }

  // Privacy check
  if (playlist.isPrivate) {
    const isCreator =
      user && user._id.toString() === playlist.creator.toString();
    const hasValidToken = secretToken && secretToken === playlist.secretToken;

    if (!isCreator && !hasValidToken) {
      throw new AppError(
        'This playlist is private or the secret token is invalid.',
        403
      );
    }
  }

  // Calculate total duration from populated tracks
  let totalDuration = 0;
  if (playlist.tracks && playlist.tracks.length > 0) {
    totalDuration = playlist.tracks.reduce(
      (sum, track) => sum + (track.duration || 0),
      0
    );
  }

  const playlistData = playlist.toObject();
  playlistData.totalDuration = totalDuration;

  // Never expose the secret token to the client
  delete playlistData.secretToken;
  delete playlistData.__v;

  return playlistData;
};

// ==========================================
// UPDATE PLAYLIST METADATA
// ==========================================
exports.updatePlaylist = async (playlistId, userId, updateData) => {
  const playlist = await Playlist.findOne({
    _id: playlistId,
    creator: userId,
  });

  if (!playlist) {
    throw new AppError(
      'Playlist not found or you are not authorized to edit it',
      403
    );
  }

  Object.assign(playlist, updateData);
  await playlist.save();

  const playlistObj = playlist.toObject();
  delete playlistObj.secretToken;
  delete playlistObj.__v;
  return playlistObj;
};

// ==========================================
// DELETE PLAYLIST
// ==========================================
exports.deletePlaylist = async (playlistId, userId) => {
  const playlist = await Playlist.findOneAndDelete({
    _id: playlistId,
    creator: userId,
  });

  if (!playlist) {
    throw new AppError(
      'Playlist not found or you are not authorized to delete it',
      403
    );
  }

  return playlist;
};

// ==========================================
// UPDATE TRACKS (sequencing / add / remove)
// ==========================================
exports.updateTracks = async (playlistId, userId, newTracksArray) => {
  const playlist = await Playlist.findOne({
    _id: playlistId,
    creator: userId,
  });

  if (!playlist) {
    throw new AppError('Playlist not found or unauthorized', 403);
  }

  playlist.tracks = newTracksArray;
  playlist.trackCount = newTracksArray.length;

  // Recalculate total duration from the new track list
  const tracksData = await Track.find({
    _id: { $in: newTracksArray },
  }).select('duration');

  const totalDuration = tracksData.reduce(
    (sum, track) => sum + (track.duration || 0),
    0
  );
  playlist.totalDuration = totalDuration;

  await playlist.save();

  const playlistObj = playlist.toObject();
  delete playlistObj.secretToken;
  delete playlistObj.__v;
  return playlistObj;
};

// ==========================================
// GET EMBED CODE
// ==========================================
exports.getEmbedCode = async (playlistId, user, secretToken) => {
  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new AppError('Playlist not found', 404);
  }

  // Privacy check — same logic as getPlaylist
  if (playlist.isPrivate) {
    const isCreator =
      user && user._id.toString() === playlist.creator.toString();
    const hasValidToken = secretToken && secretToken === playlist.secretToken;

    if (!isCreator && !hasValidToken) {
      throw new AppError(
        'You cannot generate an embed code for a private playlist without authorization.',
        403
      );
    }
  }

  // Append secret token to the embed URL for private playlists
  const tokenParam = playlist.isPrivate
    ? `?secretToken=${playlist.secretToken}`
    : '';
  const embedUrl = `${process.env.FRONTEND_URL}/embed/playlist/${playlistId}${tokenParam}`;
  const iframeCode = `<iframe width="100%" height="450" scrolling="no" frameborder="no" allow="autoplay" src="${embedUrl}"></iframe>`;

  return { iframeCode, playlistId };
};

// ==========================================
// UPLOAD ARTWORK
// ==========================================
exports.uploadArtwork = async (playlistId, userId, file) => {
  const playlist = await Playlist.findOne({
    _id: playlistId,
    creator: userId,
  });

  if (!playlist) {
    throw new AppError(
      'Playlist not found or you are not authorized to edit it',
      403
    );
  }

  const artworkUrl = await uploadImageToAzure(
    file.buffer,
    file.originalname,
    'playlists'
  );

  playlist.artworkUrl = artworkUrl;
  await playlist.save();

  const playlistObj = playlist.toObject();
  delete playlistObj.secretToken;
  delete playlistObj.__v;
  return playlistObj;
};
