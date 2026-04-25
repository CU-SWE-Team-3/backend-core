const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Playlist = require('../models/playlistModel');
const Block = require('../models/blockModel');

// 🌟 BONUS: Autocomplete / Typeahead Search
exports.autocompleteSearch = async (searchQuery) => {
  const regex = new RegExp(`^${searchQuery}`, 'i'); // Match start of string

  const tracks = await Track.find({
    title: regex,
    isPublic: true,
    moderationStatus: 'Approved',
  })
    .select('title permalink artworkUrl')
    .limit(5)
    .lean();

  const users = await User.find({
    displayName: regex,
    isPrivate: false,
    accountStatus: 'Active',
  })
    .select('displayName permalink avatarUrl')
    .limit(5)
    .lean();

  return { tracks, users };
};

// 🌟 BONUS: Added "filters = {}"
exports.performGlobalSearch = async (
  searchQuery,
  type,
  limit,
  skip,
  currentUserId,
  filters = {}
) => {
  let blockedIds = [];
  if (currentUserId) {
    const blocks = await Block.find({
      $or: [{ blocker: currentUserId }, { blocked: currentUserId }],
    });
    blockedIds = blocks.map((b) =>
      b.blocker.equals(currentUserId) ? b.blocked : b.blocker
    );
  }

  const trackMatch = {
    $text: { $search: searchQuery },
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    artist: { $nin: blockedIds },
  };

  if (filters.licenseType) {
    trackMatch.licenseType = filters.licenseType;
  }

  // In searchService.js inside performGlobalSearch
  const trackQuery = Track.find(trackMatch, { score: { $meta: 'textScore' } })
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .populate('artist', 'displayName permalink avatarUrl')
    .sort({ score: { $meta: 'textScore' }, isPromoted: -1, viralScore: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const userQuery = User.find(
    {
      $text: { $search: searchQuery },
      isPrivate: false,
      accountStatus: 'Active',
      _id: { $nin: blockedIds },
    },
    { score: { $meta: 'textScore' } }
  )
    .select('displayName permalink avatarUrl followerCount bio')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .lean();

  const playlistQuery = Playlist.find(
    {
      $text: { $search: searchQuery },
      isPrivate: false,
      creator: { $nin: blockedIds },
    },
    { score: { $meta: 'textScore' } }
  )
    .select(
      'title permalink artworkUrl trackCount totalDuration releaseType genre creator createdAt'
    )
    .populate('creator', 'displayName permalink avatarUrl')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .lean();

  const [tracks, users, playlists] = await Promise.all([
    trackQuery,
    userQuery,
    playlistQuery,
  ]);

  return { tracks, users, playlists };
};
