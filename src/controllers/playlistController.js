// src/controllers/playlistController.js
const playlistService = require('../services/playlistService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError'); // <-- Added to handle missing files

exports.createPlaylist = catchAsync(async (req, res, next) => {
  const playlist = await playlistService.createPlaylist(req.user._id, req.body);

  res.status(201).json({
    status: 'success',
    data: { playlist },
  });
});

exports.getPlaylist = catchAsync(async (req, res, next) => {
  const user = req.user || null;
  const { secretToken } = req.query;

  const playlist = await playlistService.getPlaylist(
    req.params.id,
    user,
    secretToken
  );

  res.status(200).json({
    status: 'success',
    data: { playlist },
  });
});

exports.updatePlaylist = catchAsync(async (req, res, next) => {
  const playlist = await playlistService.updatePlaylist(
    req.params.id,
    req.user._id,
    req.body
  );

  res.status(200).json({
    status: 'success',
    data: { playlist },
  });
});

exports.deletePlaylist = catchAsync(async (req, res, next) => {
  await playlistService.deletePlaylist(req.params.id, req.user._id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.updateTracks = catchAsync(async (req, res, next) => {
  const playlist = await playlistService.updateTracks(
    req.params.id,
    req.user._id,
    req.body.tracks
  );

  res.status(200).json({
    status: 'success',
    data: { playlist },
  });
});

exports.getEmbedCode = catchAsync(async (req, res, next) => {
  const data = await playlistService.getEmbedCode(
    req.params.id,
    req.user,
    req.query.secretToken
  );

  res.status(200).json({
    status: 'success',
    data,
  });
});

exports.getAllPlaylists = catchAsync(async (req, res, next) => {
  // Pass req.query for filtering and req.user for privacy checks
  const playlists = await playlistService.getAllPlaylists(req.query, req.user);

  res.status(200).json({
    status: 'success',
    results: playlists.length, // Good API practice to include the array length
    data: { playlists },
  });
});

// 👇 Added the Artwork Upload Controller
exports.uploadArtwork = catchAsync(async (req, res, next) => {
  // Multer adds the 'file' object to 'req'. If it's not there, reject the request.
  if (!req.file) {
    return next(new AppError('Please provide an image file to upload.', 400));
  }

  const playlist = await playlistService.uploadArtwork(
    req.params.id,
    req.user._id,
    req.file
  );

  res.status(200).json({
    status: 'success',
    data: { playlist },
  });
});
