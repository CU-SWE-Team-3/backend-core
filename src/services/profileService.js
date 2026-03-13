// src/services/profileService.js
const User = require('../models/userModel');

const updateProfileData = async (userId, updateData) => {
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
const updateProfileImage = async (userId, imageType) => {
  // Mocking the image URL since we don't have Cloudinary set up yet
  const mockImageUrl = `https://biobeats-assets.com/${imageType}-${Date.now()}.png`;

  const updateField =
    imageType === 'avatar'
      ? { avatarUrl: mockImageUrl }
      : { coverUrl: mockImageUrl };

  return User.findByIdAndUpdate(userId, { $set: updateField }, { new: true });
};

module.exports = { updateProfileData, updateProfileImage };
