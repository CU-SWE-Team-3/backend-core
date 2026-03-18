const profileService = require('../services/profileService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ==========================================
// 1. Update Privacy
// ==========================================
exports.updatePrivacy = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { isPrivate } = req.body;
  const updatedUser = await profileService.updatePrivacy(userId, isPrivate);

  res.status(200).json({
    success: true,
    message: 'Privacy settings updated successfully',
    data: { isPrivate: updatedUser.isPrivate },
  });
});

// ==========================================
// 2. Update Social Links
// ==========================================
exports.updateSocialLinks = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { socialLinks } = req.body;
  const updatedUser = await profileService.updateSocialLinks(
    userId,
    socialLinks
  );

  res.status(200).json({
    success: true,
    message: 'Social links updated successfully',
    data: { socialLinks: updatedUser.socialLinks },
  });
});

exports.updateProfile = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const updatedUser = await profileService.updateProfileData(userId, req.body);

  res.status(200).json({
    success: true,
    data: {
      user: {
        displayName: updatedUser.displayName,
        permalink: updatedUser.permalink,
        bio: updatedUser.bio,
        country: updatedUser.country,
        city: updatedUser.city,
        genres: updatedUser.genres,
      },
    },
  });
});

// 5. Remove Specific Social Link
// ==========================================
exports.removeSocialLink = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { linkId } = req.params;
  const updatedUser = await profileService.removeSocialLink(userId, linkId);

  res.status(200).json({
    success: true,
    message: 'Social link removed successfully',
    data: { socialLinks: updatedUser.socialLinks },
  });
});

exports.uploadProfileImages = catchAsync(async (req, res, next) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return next(
      new AppError('Please upload at least one image (avatar or cover)', 400)
    );
  }

  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const updatedUser = await profileService.updateProfileImages(
    userId,
    req.files
  );

  res.status(200).json({
    success: true,
    data: {
      avatarUrl: updatedUser.avatarUrl,
      coverUrl: updatedUser.coverUrl,
    },
  });
});

// ==========================================
// 3. Update Tier (Role)
// ==========================================
exports.updateTier = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { role } = req.body;
  const updatedUser = await profileService.updateTier(userId, role);

  res.status(200).json({
    success: true,
    message: 'Account tier updated successfully',
    data: { role: updatedUser.role },
  });
});

exports.getProfileByPermalink = catchAsync(async (req, res, next) => {
  const { permalink } = req.params;
  const user = await profileService.getProfileByPermalink(permalink);

  res.status(200).json({
    success: true,
    data: { user },
  });
});
