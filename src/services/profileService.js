const User = require('../models/userModel'); // Ensure this points to the merged model

exports.updatePrivacy = async (userId, isPrivate) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isPrivate },
    { new: true, runValidators: true, select: '-password' } // Exclude sensitive info
  );
  if (!user) throw new Error('User not found');
  return user;
};

exports.updateSocialLinks = async (userId, socialLinks) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { socialLinks },
    { new: true, runValidators: true, select: '-password' }
  );
  if (!user) throw new Error('User not found');
  return user;
};

exports.removeSocialLink = async (userId, linkId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { socialLinks: { _id: linkId } } },
    { new: true, select: '-password' }
  );

  if (!user) throw new Error('User not found');
  return user;
};

exports.updateTier = async (userId, role) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { role },
    { new: true, runValidators: true, select: '-password' }
  );
  if (!user) throw new Error('User not found');
  return user;
};

exports.updateProfileData = async (userId, updateData) => {
  // Only allow updating specific fields to prevent security risks
  const allowedUpdates = {
    bio: updateData.bio,
    country: updateData.country,
    city: updateData.city,
    genres: updateData.genres,
    displayName: updateData.displayName,
    permalink: updateData.permalink,
  };

  // Remove undefined fields so we don't accidentally overwrite existing data
  Object.keys(allowedUpdates).forEach(
    (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key]
  );

  return User.findByIdAndUpdate(
    userId,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );
};

// Removed fileBuffer parameter here to fix the ESLint error!
exports.updateProfileImage = async (userId, imageType) => {
  // Mocking the image URL since we don't have Cloudinary set up yet
  const mockImageUrl = `https://biobeats-assets.com/${imageType}-${Date.now()}.png`;

  const updateField =
    imageType === 'avatar'
      ? { avatarUrl: mockImageUrl }
      : { coverUrl: mockImageUrl };

  return User.findByIdAndUpdate(userId, { $set: updateField }, { new: true });
};
