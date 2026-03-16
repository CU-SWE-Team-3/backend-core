const trackService = require('../services/trackService');

exports.initiateUpload = async (req, res) => {
  try {
    const result = await trackService.generateUploadUrl(req.user, req.body);
    res.status(201).json({
      success: true,
      message: 'Upload authorized. Proceed with direct-to-cloud streaming.',
      data: result,
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.confirmUpload = async (req, res) => {
  try {
    const track = await trackService.confirmUpload(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      message: 'Track upload confirmed and published.',
      data: track,
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

exports.getTrack = async (req, res) => {
  try {
    // 1. Grab the permalink from the URL parameters
    const { permalink } = req.params;

    // 2. Pass it to the updated service method
    const track = await trackService.getTrackByPermalink(permalink);

    res.status(200).json({ success: true, data: track });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ success: false, error: error.message });
  }
};

exports.downloadTrack = async (req, res) => {
  try {
    const { stream, contentLength, filename } =
      await trackService.downloadTrackAudio(req.params.id, req.user);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    stream.pipe(res);
  } catch (error) {
    // 403 Forbidden for Premium blocks, 404 for missing tracks
    const statusCode = error.message.includes('Premium') ? 403 : 404;
    res.status(statusCode).json({ success: false, error: error.message });
  }
};

exports.deleteTrack = async (req, res) => {
  try {
    // Pass the track ID from the URL, and the user ID from the JWT token
    await trackService.deleteTrack(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Track and associated audio file deleted successfully.',
    });
  } catch (error) {
    // 403 if they don't own it, 404 if it doesn't exist
    const statusCode = error.message.includes('Unauthorized') ? 403 : 404;
    res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};
