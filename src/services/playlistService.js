// src/services/playlistService.js
const Playlist = require('../models/playlistModel');
// 👇 Assuming your custom error class is in the utils folder.
// Adjust the path or capitalization if your file is named differently!
const AppError = require('../utils/appError');
const Track = require('../models/trackModel');
const { uploadImageToAzure } = require('../utils/azureStorage');

class PlaylistService {
  // 1. Create a new playlist
  static async createPlaylist(userId, playlistData) {
    const playlist = new Playlist(playlistData);
    playlist.creator = userId;

    return await playlist.save();
  }

  // Fetch multiple playlists (Supports filtering by creator and handles privacy)
  static async getAllPlaylists(queryParams, currentUser) {
    // eslint-disable-next-line prefer-object-spread
    const filter = Object.assign({}, queryParams);

    // PRIVACY LOGIC:
    // If the frontend is searching for a specific user's playlists (e.g., viewing a profile)
    if (filter.creator) {
      // If no user is logged in, OR the logged-in user is NOT the creator they are searching for:
      // Force the database to only return PUBLIC playlists.
      if (
        !currentUser ||
        currentUser._id.toString() !== filter.creator.toString()
      ) {
        filter.isPrivate = false;
      }
    } else {
      // If just browsing the platform generally, only show public playlists
      filter.isPrivate = false;
    }

    // Query the database, sort by newest first, and optionally populate the creator's display name
    const playlists = await Playlist.find(filter)
      .populate('creator', 'name') // Adjust 'name' to your User model's display field if needed
      .sort('-createdAt');

    return playlists;
  }

  // 2. Read / Fetch a playlist (Handles Secret Token & Dead Tracks)
  static async getPlaylist(playlistId, user, secretToken) {
    // 1. Fetch the playlist and POPULATE the tracks array
    // We use .populate() to pull the actual track documents from the Tracks collection
    const playlist = await Playlist.findById(playlistId).populate({
      path: 'tracks',
      select: 'title artist duration audioUrl hlsUrl coverImage', // Only grab the fields the frontend needs
    });

    if (!playlist) {
      throw new AppError('Playlist not found', 404);
    }

    // 2. Privacy Check (Keep your existing privacy logic here!)
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

    // 3. Calculate Total Duration dynamically
    // We loop through the populated tracks and add up their durations
    let totalDuration = 0;
    if (playlist.tracks && playlist.tracks.length > 0) {
      totalDuration = playlist.tracks.reduce(
        (sum, track) => sum + (track.duration || 0),
        0
      );
    }

    // 4. Return the playlist with the calculated duration attached
    // We convert the mongoose document to a plain object so we can add our custom field
    const playlistData = playlist.toObject();
    playlistData.totalDuration = totalDuration;

    return playlistData;
  }

  // 3. Update metadata (Title, Description, Privacy)
  static async updatePlaylist(playlistId, userId, updateData) {
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
    return await playlist.save();
  }

  // 4. Delete a playlist
  static async deletePlaylist(playlistId, userId) {
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
  }

  // 5. Track Sequencing
  static async updateTracks(playlistId, userId, newTracksArray) {
    const playlist = await Playlist.findOne({
      _id: playlistId,
      creator: userId,
    });

    if (!playlist) {
      throw new AppError('Playlist not found or unauthorized', 403);
    }

    // 1. Update the array and track count
    playlist.tracks = newTracksArray;
    playlist.trackCount = newTracksArray.length;

    // 2. Fetch the newly added tracks to calculate total duration
    // We import the Track model at the top of the file: const Track = require('../models/trackModel');

    const tracksData = await Track.find({
      _id: { $in: newTracksArray },
    }).select('duration');

    // 3. Sum up the durations
    const totalDuration = tracksData.reduce(
      (sum, track) => sum + (track.duration || 0),
      0
    );
    playlist.totalDuration = totalDuration;

    await playlist.save();
    return playlist;
  }

  // ❌ DELETE the static async incrementPlayCount(playlistId) method completely!
  // 6. Generate Simple Embed Code
  static async getEmbedCode(playlistId, user, secretToken) {
    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new AppError('Playlist not found', 404);
    }

    // Privacy Protection Logic
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

    // If the playlist is private, we MUST append the secretToken to the iframe source URL
    // so that the person viewing the embed elsewhere can actually hear the music.
    const tokenParam = playlist.isPrivate
      ? `?secretToken=${playlist.secretToken}`
      : '';
    const embedUrl = `https://your-frontend-domain.com/embed/playlist/${playlistId}${tokenParam}`;

    const iframeCode = `<iframe width="100%" height="450" scrolling="no" frameborder="no" allow="autoplay" src="${embedUrl}"></iframe>`;

    return { iframeCode, playlistId };
  }

  // 8. Upload Custom Artwork
  static async uploadArtwork(playlistId, userId, file) {
    // 1. Find the playlist and ensure the user owns it
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

    // 2. Upload the image buffer to Azure Blob Storage
    // We pass 'playlists' as the folder name to keep your Azure container organized
    const artworkUrl = await uploadImageToAzure(
      file.buffer,
      file.originalname,
      'playlists'
    );

    // 3. Update the database with the new Azure URL
    playlist.artworkUrl = artworkUrl;
    return await playlist.save();
  }
}

module.exports = PlaylistService;
