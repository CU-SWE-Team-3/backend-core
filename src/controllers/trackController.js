const trackService = require('../services/trackService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ==========================================
// BE-3: METADATA & VISIBILITY CONTROLLERS
// ==========================================

/**
 * @desc    Update track metadata (title, genre, tags, etc.)
 * @route   PATCH /api/tracks/:id/metadata
 * @access  Private (Track Owner)
 */

const formatTrack = (track) => ({
  _id: track._id,
  title: track.title,
  permalink: track.permalink,
  description: track.description,
  genre: track.genre,
  tags: track.tags,
  releaseDate: track.releaseDate,
  artworkUrl: track.artworkUrl,
  hlsUrl: track.hlsUrl,
  waveform: track.waveform,
  duration: track.duration,
  format: track.format,
  isPublic: track.isPublic,
  processingState: track.processingState,
  playCount: track.playCount,
  likeCount: track.likeCount,
  repostCount: track.repostCount,
  commentCount: track.commentCount,
  artist: track.artist,
  createdAt: track.createdAt,
});

exports.getMyTracks = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const tracks = await trackService.getMyTracks(userId);

  res.status(200).json({
    success: true,
    count: tracks.length,
    data: tracks.map(formatTrack),
  });
});

exports.updateMetadata = catchAsync(async (req, res) => {
  const trackId = req.params.id;
  const userId = req.user._id || req.user.id;
  const metadataBody = req.body;

  const updatedTrack = await trackService.updateTrackMetadata(
    trackId,
    userId,
    metadataBody
  );

  res.status(200).json({
    success: true,
    message: 'Track metadata updated successfully',
    data: { track: updatedTrack },
  });
});

/**
 * @desc    Toggle track visibility (Public / Private)
 * @route   PATCH /api/tracks/:id/visibility
 * @access  Private (Track Owner)
 */
exports.updateVisibility = catchAsync(async (req, res, next) => {
  const trackId = req.params.id;
  const userId = req.user._id || req.user.id;
  const { isPublic } = req.body;

  if (typeof isPublic !== 'boolean') {
    return next(
      new AppError('isPublic field must be a boolean (true or false)', 400)
    );
  }

  const updatedTrack = await trackService.toggleTrackVisibility(
    trackId,
    userId,
    isPublic
  );

  res.status(200).json({
    success: true,
    message: `Track is now ${isPublic ? 'Public' : 'Private'}`,
    data: { track: updatedTrack },
  });
});
/**
 * @desc    Upload track artwork
 * @route   PATCH /api/tracks/:id/artwork
 * @access  Private (Track Owner)
 */
exports.uploadArtwork = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please provide an image file', 400));
  }

  const updatedTrack = await trackService.updateTrackArtwork(
    req.params.id,
    req.user._id || req.user.id,
    req.file
  );

  res.status(200).json({
    success: true,
    message: 'Track artwork uploaded successfully',
    data: { artworkUrl: updatedTrack.artworkUrl },
  });
});

exports.initiateUpload = catchAsync(async (req, res) => {
  const result = await trackService.generateUploadUrl(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Upload authorized. Proceed with direct-to-cloud streaming.',
    data: result,
  });
});

exports.confirmUpload = catchAsync(async (req, res, next) => {
  const track = await trackService.confirmUpload(req.params.id, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Track upload confirmed. Processing has started.',
    data: {
      trackId: track._id,
      permalink: track.permalink,
      title: track.title,
      processingState: track.processingState,
    },
  });
});

exports.getTrack = catchAsync(async (req, res, next) => {
  const { permalink } = req.params;
  const track = await trackService.getTrackByPermalink(permalink);

  res.status(200).json({
    success: true,
    data: { track: formatTrack(track) },
  });
});

exports.downloadTrack = catchAsync(async (req, res) => {
  const { stream, contentLength, filename } =
    await trackService.downloadTrackAudio(req.params.id, req.user);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  stream.pipe(res);
});

exports.deleteTrack = catchAsync(async (req, res) => {
  await trackService.deleteTrack(req.params.id, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Track and associated audio file deleted successfully.',
  });
});
