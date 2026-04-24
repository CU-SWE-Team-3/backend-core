const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Cache = require('../models/cacheModel');

exports.getTrendingTracks = async (limit = 20, genre = null) => {
  const parsedLimit = parseInt(limit, 10);
  const cacheKey = `trending_${genre || 'all'}_${parsedLimit}`;

  // 1. Check the Cache FIRST
  const cachedRecord = await Cache.findOne({ key: cacheKey }).lean();
  if (cachedRecord) {
    return cachedRecord.data; // Serve instantly!
  }

  // 2. Your exact query (Cache Miss)
  const matchQuery = {
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    viralScore: { $gt: 0 },
  };

  if (genre) matchQuery.genre = genre;

  const trendingTracks = await Track.find(matchQuery)
    .sort({ viralScore: -1 })
    .limit(parsedLimit)
    .populate({
      path: 'artist',
      select: 'displayName permalink avatarUrl',
    })
    .lean();

  // 3. Save your result to the Cache for the next 5 minutes
  await Cache.findOneAndUpdate(
    { key: cacheKey },
    { data: trendingTracks, createdAt: new Date() },
    { upsert: true, new: true }
  );

  return trendingTracks;
};

exports.getRecommendedBasedOnLikes = async (userId) => {
  // 1. Get recent tracks the user liked
  const recentLikes = await Interaction.find({
    actorId: userId,
    actionType: 'LIKE',
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('targetId');

  const likedGenres = [
    ...new Set(recentLikes.map((like) => like.targetId?.genre).filter(Boolean)),
  ];
  const likedTrackIds = recentLikes
    .map((like) => like.targetId?._id)
    .filter(Boolean);

  // If they haven't liked anything yet, fallback to trending tracks
  if (likedGenres.length === 0) {
    return this.getTrendingTracks();
  }

  // 2. Find similar tracks they HAVEN'T liked
  return await Track.find({
    genre: { $in: likedGenres },
    _id: { $nin: likedTrackIds },
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .sort({ playCount: -1 })
    .limit(15)
    .populate('artist', 'displayName avatarUrl permalink');
};
// In discoveryService.js
exports.getStationByGenre = async (genre) => {
  return await Track.find({
    genre,
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    // CHANGE: Sort by viralScore instead of playCount
    .sort({ viralScore: -1 })
    .limit(20)
    .populate('artist', 'displayName avatarUrl permalink');
};

exports.getStationByArtist = async (artistId) => {
  return await Track.find({
    artist: artistId,
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .sort({ createdAt: -1 }) // Newest tracks from this artist first
    .limit(20)
    .populate('artist', 'displayName avatarUrl permalink');
};

// ... (keep your existing getTrendingTracks, getRecommendedBasedOnLikes, getStationByGenre, getStationByArtist)

// 🌟 BONUS: Autoplay / Related Tracks
exports.getRelatedTracks = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new Error('Track not found');

  return await Track.find({
    _id: { $ne: trackId },
    $or: [{ genre: track.genre }, { tags: { $in: track.tags } }],
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .sort({ playCount: -1 })
    .limit(10)
    .populate('artist', 'displayName avatarUrl permalink');
};

// 🌟 BONUS: Collaborative Filtering ("People who liked this also liked...")
exports.getUsersWhoLikedAlsoLiked = async (trackId) => {
  const likesForThisTrack = await Interaction.find({
    targetId: trackId,
    actionType: 'LIKE',
  });
  const userIds = likesForThisTrack.map((like) => like.actorId);

  if (userIds.length === 0) return [];

  const otherLikes = await Interaction.find({
    actorId: { $in: userIds },
    actionType: 'LIKE',
    targetId: { $ne: trackId },
  }).populate({
    path: 'targetId',
    populate: { path: 'artist', select: 'displayName avatarUrl permalink' }, // populate artist inside track
  });

  const recommendedTracks = [];
  const seenIds = new Set();

  for (const like of otherLikes) {
    if (like.targetId && !seenIds.has(like.targetId._id.toString())) {
      // Only add public/approved tracks
      if (
        like.targetId.isPublic &&
        like.targetId.moderationStatus === 'Approved'
      ) {
        seenIds.add(like.targetId._id.toString());
        recommendedTracks.push(like.targetId);
      }
    }
  }

  return recommendedTracks.slice(0, 10);
};
