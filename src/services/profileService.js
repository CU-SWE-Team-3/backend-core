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
    { $pull: { socialLinks: { _id: linkId } } }, // اسحب اللينك اللي الـ ID بتاعه كذا
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
