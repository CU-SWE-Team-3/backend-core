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
  const user = await User.findByIdAndUpdate(
    userId,
    { socialLinks },
    { new: true, runValidators: true }
  ).select('socialLinks');
  if (!user) throw new Error('User not found');
  return user;
};

exports.removeSocialLink = async (userId, linkId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { socialLinks: { _id: linkId } } },
    { new: true }
  ).select('socialLinks');
  if (!user) throw new Error('User not found');
  return user;
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
