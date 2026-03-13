// src/controllers/profileController.js
const profileService = require('../services/profileService');

const updateProfile = async (req, res, next) => {
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

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'Please upload an image file' });
    }

    // FIXED: Removed the optional chaining (?.)
    const userId = (req.user && req.user.id) || req.user._id; // We get this safely from the verified token!;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: 'User ID is required' });
    }

    const updatedUser = await profileService.updateProfileImage(
      userId,
      'avatar'
    );

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  uploadAvatar,
};
