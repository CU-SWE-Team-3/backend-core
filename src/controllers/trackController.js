const trackService = require('../services/trackService');

// ==========================================
// BE-3: METADATA & VISIBILITY CONTROLLERS
// ==========================================

/**
 * @desc    Update track metadata (title, genre, tags, etc.)
 * @route   PATCH /api/tracks/:id/metadata
 * @access  Private (Track Owner)
 */
exports.updateMetadata = async (req, res) => {
  try {
    const trackId = req.params.id;
    const userId = req.user._id || req.user.id; // Comes from authMiddleware
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
  } catch (error) {
    // If the service throws an error (e.g., "Track not found" or permission denied)
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @desc    Toggle track visibility (Public / Private)
 * @route   PATCH /api/tracks/:id/visibility
 * @access  Private (Track Owner)
 */
exports.updateVisibility = async (req, res) => {
  try {
    const trackId = req.params.id;
    const userId = req.user._id || req.user.id;
    const { isPublic } = req.body;

    // Validate input
    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isPublic field must be a boolean (true or false)',
      });
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
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};
/**
 * @desc    Upload track artwork
 * @route   PATCH /api/tracks/:id/artwork
 * @access  Private (Track Owner)
 */
exports.uploadArtwork = async (req, res) => {
  try {
    const trackId = req.params.id;
    const userId = req.user._id || req.user.id;

    // Check if the file was passed by the multer middleware
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an image file',
      });
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
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};
