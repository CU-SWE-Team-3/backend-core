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
exports.updateProfileImages = async (userId, uploadedFiles) => {
  // 1. Create an empty object to hold our dynamic updates
  const updateFields = {};

  // 2. Did they upload an avatar? If yes, generate the URL and add it to the object.
  if (uploadedFiles.avatar) {
    updateFields.avatarUrl = `https://biobeats-assets.com/avatar-${Date.now()}.png`;
  }

  // 3. Did they upload a cover? If yes, generate the URL and add it to the object.
  if (uploadedFiles.cover) {
    updateFields.coverUrl = `https://biobeats-assets.com/cover-${Date.now()}.png`;
  }

  // 4. Safety check: If they somehow bypassed the controller check, don't crash the DB
  if (Object.keys(updateFields).length === 0) {
    throw new Error('No valid image fields provided');
  }

  // 5. Execute a SINGLE database update with whatever is inside updateFields
  return User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true });
};
