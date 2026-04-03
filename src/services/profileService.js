const User = require('../models/userModel'); // Ensure this points to the merged model
const { uploadImageToAzure } = require('../utils/azureStorage');
const AppError = require('../utils/appError');

exports.getProfileByPermalink = async (permalink) => {
  const user = await User.findOne({ permalink }).select(
    'displayName bio country city genres avatarUrl coverUrl role followerCount followingCount socialLinks createdAt permalink isPrivate isPremium'
  );

  if (!user) {
    const err = new Error('Profile not found.');
    err.statusCode = 404;
    throw err;
  }

  if (user.isPrivate) {
    return {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      permalink: user.permalink,
      role: user.role,
      isPrivate: true,
    };
  }

  return user;
};

exports.updatePrivacy = async (userId, isPrivate) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isPrivate },
    { new: true, runValidators: true }
  ).select('isPrivate');
  if (!user) throw new Error('User not found');
  return user;
};

exports.updateSocialLinks = async (userId, socialLinks) => {
  const user = await User.findById(userId).select('socialLinks');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const currentLinks = user.socialLinks.map((link) => ({
    platform: link.platform,
    url: link.url,
  }));

  const isIdentical =
    JSON.stringify(currentLinks) === JSON.stringify(socialLinks);

  if (isIdentical) {
    throw new AppError(
      'No changes detected. These social links are already saved.',
      400
    );
  }

  user.socialLinks = socialLinks;
  await user.save({ validateModifiedOnly: true });

  return { socialLinks: user.socialLinks };
};

exports.removeSocialLink = async (userId, linkId) => {
  const user = await User.findById(userId).select('socialLinks');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const linkExists = user.socialLinks.id(linkId);

  if (!linkExists) {
    throw new AppError('Social link not found or already removed.', 404);
  }

  user.socialLinks.pull(linkId);
  await user.save({ validateModifiedOnly: true });

  return { socialLinks: user.socialLinks };
};

exports.updateTier = async (userId, role) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { role },
    { new: true, runValidators: true }
  ).select('role');
  if (!user) throw new Error('User not found');
  return user;
};

exports.updateProfileData = async (userId, updateData) => {
  const allowedUpdates = {
    bio: updateData.bio,
    country: updateData.country,
    city: updateData.city,
    genres: updateData.genres,
    displayName: updateData.displayName,
    permalink: updateData.permalink,
  };

  Object.keys(allowedUpdates).forEach(
    (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key]
  );

  return User.findByIdAndUpdate(
    userId,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  ).select('displayName permalink bio country city genres');
};

// FIX: select only avatarUrl and coverUrl — controller returns just what changed
exports.updateProfileImages = async (userId, uploadedFiles) => {
  const updateFields = {};

  if (uploadedFiles.avatar && uploadedFiles.avatar[0]) {
    const file = uploadedFiles.avatar[0];
    const azureUrl = await uploadImageToAzure(
      file.buffer,
      file.mimetype,
      'avatars'
    );
    updateFields.avatarUrl = azureUrl;
  }

  if (uploadedFiles.cover && uploadedFiles.cover[0]) {
    const file = uploadedFiles.cover[0];
    const azureUrl = await uploadImageToAzure(
      file.buffer,
      file.mimetype,
      'covers'
    );
    updateFields.coverUrl = azureUrl;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new Error('No valid image fields provided');
  }

  return User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true }
  ).select('avatarUrl coverUrl');
};
