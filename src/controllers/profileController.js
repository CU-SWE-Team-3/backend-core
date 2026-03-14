const profileService = require('../services/profileService');

// ==========================================
// 1. Update Privacy
// ==========================================
exports.updatePrivacy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isPrivate } = req.body;

    const updatedUser = await profileService.updatePrivacy(id, isPrivate);

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
    const { id } = req.params;
    const { socialLinks } = req.body; // بنستقبل Object فيه انستجرام وتويتر زي الـ Schema

    const updatedUser = await profileService.updateSocialLinks(id, socialLinks);

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
    const { id, linkId } = req.params; // هناخد الـ id بتاع اليوزر والـ linkId بتاع اللينك

    const updatedUser = await profileService.removeSocialLink(id, linkId);

    res.status(200).json({
      status: 'success',
      message: 'Social link removed successfully',
      data: { socialLinks: updatedUser.socialLinks },
    });
  } catch (error) {
    next(error);
  }
};
      
exports.uploadAvatar = async (req, res, next) => {
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

// ==========================================
// 3. Update Tier (Role)
// ==========================================
exports.updateTier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const updatedUser = await profileService.updateTier(id, role);

    res.status(200).json({
      status: 'success',
      message: 'Account tier updated successfully',
      data: { role: updatedUser.role },
    });
  } catch (error) {
    next(error);
  }
};
