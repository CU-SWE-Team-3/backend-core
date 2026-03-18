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
  const trackId = req.params.id;
  const userId = req.user._id || req.user.id;

  if (!req.file) {
    return next(new AppError('Please provide an image file', 400));
  }

  const updatedTrack = await trackService.updateTrackArtwork(
    trackId,
    userId,
    req.file
  );

  res.status(200).json({
    success: true,
    message: 'Track artwork uploaded successfully',
    data: { track: updatedTrack },
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

exports.confirmUpload = catchAsync(async (req, res) => {
  const track = await trackService.confirmUpload(req.params.id, req.user._id);
  res.status(200).json({
    success: true,
    message: 'Track upload confirmed and published.',
    data: track,
  });
});

exports.getTrack = catchAsync(async (req, res) => {
  const { permalink } = req.params;
  const track = await trackService.getTrackByPermalink(permalink);

  res.status(200).json({ success: true, data: track });
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
