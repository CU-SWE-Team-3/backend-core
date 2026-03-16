const profileService = require('../services/profileService');

// ==========================================
// 1. Update Privacy
// ==========================================
exports.updatePrivacy = async (req, res, next) => {
  try {
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }

    const { isPrivate } = req.body;

    const updatedUser = await profileService.updatePrivacy(userId, isPrivate);

    res.status(200).json({
      status: 'success',
      message: 'Privacy settings updated successfully',
      data: { isPrivate: updatedUser.isPrivate },
    });
  } catch (error) {
    next(error); // Passes to the global error handler in app.js
  }
};

// ==========================================
// 2. Update Social Links
// ==========================================
exports.updateSocialLinks = async (req, res, next) => {
  try {
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }
    const { socialLinks } = req.body;

    const updatedUser = await profileService.updateSocialLinks(
      userId,
      socialLinks
    );

    res.status(200).json({
      status: 'success',
      message: 'Social links updated successfully',
      data: { socialLinks: updatedUser.socialLinks },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    // FIXED: Removed the optional chaining (?.)
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }

    const updatedUser = await profileService.updateProfileData(
      userId,
      req.body
    );

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Remove Specific Social Link
// ==========================================
exports.removeSocialLink = async (req, res, next) => {
  try {
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }
    const { linkId } = req.params;
    const updatedUser = await profileService.removeSocialLink(userId, linkId);

    res.status(200).json({
      status: 'success',
      message: 'Social link removed successfully',
      data: { socialLinks: updatedUser.socialLinks },
    });
  } catch (error) {
    next(error);
  }
};

exports.uploadProfileImages = async (req, res, next) => {
  try {
    // 1. Check if ANY files were uploaded at all
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one image (avatar or cover)',
      });
    }

    const userId = (req.user && req.user.id) || req.user._id;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }

    // 2. Pass the entire req.files object to the service!
    const updatedUser = await profileService.updateProfileImages(
      userId,
      req.files
    );

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. Update Tier (Role)
// ==========================================
exports.updateTier = async (req, res, next) => {
  try {
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }
    const { role } = req.body;

    const updatedUser = await profileService.updateTier(userId, role);

    res.status(200).json({
      status: 'success',
      message: 'Account tier updated successfully',
      data: { role: updatedUser.role },
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfileByPermalink = async (req, res) => {
  try {
    const { permalink } = req.params;

    // Ask the service to get the data
    const user = await profileService.getProfileByPermalink(permalink);

    // Send the success response
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    // If the service threw the "Profile not found" error, return a 404. Otherwise, 500.
    const statusCode = error.message === 'Profile not found.' ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};
