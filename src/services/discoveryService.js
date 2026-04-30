// src/services/discoveryService.js  — FULL FILE (replace existing)

const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Cache = require('../models/cacheModel');

// ── Existing (unchanged) ──────────────────────────────────────────────────────

exports.getTrendingTracks = async (limit = 20, genre = null) => {
  let parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    parsedLimit = 20; // Safe default
  }
  const cacheKey = `trending_${genre || 'all'}_${parsedLimit}`;

  const cachedRecord = await Cache.findOne({ key: cacheKey }).lean();
  if (cachedRecord) return cachedRecord.data;

  const matchQuery = {
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    viralScore: { $gt: 0 },
  };

  if (genre) matchQuery.genre = genre;

  const trendingTracks = await Track.find(matchQuery)
    .select(
      'title permalink artworkUrl hlsUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ viralScore: -1 })
    .limit(parsedLimit)
    .allowDiskUse(true) // 👈 ADD THIS LINE
    .populate({ path: 'artist', select: 'displayName permalink avatarUrl' })
    .lean();

  try {
    await Cache.findOneAndUpdate(
      { key: cacheKey },
      { data: trendingTracks, createdAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (error) {
    // If error is 11000 (Duplicate Key), it means a concurrent request
    // already created the cache a millisecond ago. We can safely ignore it!
    if (error.code !== 11000) {
      console.error('MongoDB Cache Upsert Error:', error);
    }
  }

  return trendingTracks;
};

exports.getRecommendedBasedOnLikes = async (userId) => {
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

  if (likedGenres.length === 0) {
    return exports.getTrendingTracks();
  }

  const tracks = await Track.find({
    genre: { $in: likedGenres },
    _id: { $nin: likedTrackIds },
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .select(
      'title permalink artworkUrl hlsUrl audioUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ playCount: -1 })
    .limit(15)
    .populate('artist', 'displayName avatarUrl permalink');

  return tracks;
};

exports.getStationByGenre = async (genre) => {
  return await Track.find({
    genre,
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
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
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('artist', 'displayName avatarUrl permalink');
};

exports.getRelatedTracks = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  return await Track.find({
    _id: { $ne: trackId },
    $or: [{ genre: track.genre }, { tags: { $in: track.tags } }],
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
  })
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ playCount: -1 })
    .limit(10)
    .populate('artist', 'displayName avatarUrl permalink');
};

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
    populate: { path: 'artist', select: 'displayName avatarUrl permalink' },
  });

  const recommendedTracks = [];
  const seenIds = new Set();

  for (const like of otherLikes) {
    if (like.targetId && !seenIds.has(like.targetId._id.toString())) {
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

// ── New: More of what you like ────────────────────────────────────────────────
// Wraps getRecommendedBasedOnLikes — adds basedOn + genres metadata so the
// controller can tell the frontend whether it fell back to trending.

exports.getMoreOfWhatYouLike = async (userId) => {
  const recentLikes = await Interaction.find({
    actorId: userId,
    actionType: 'LIKE',
    targetModel: 'Track',
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('targetId', 'genre');

  const likedGenres = [
    ...new Set(recentLikes.map((like) => like.targetId?.genre).filter(Boolean)),
  ];

  // Delegate to existing function — no duplicated query
  const tracks = await exports.getRecommendedBasedOnLikes(userId);

  return {
    tracks: Array.isArray(tracks) ? tracks : [],
    basedOn: likedGenres.length > 0 ? 'likes' : 'trending',
    genres: likedGenres,
  };
};

// ── New: Mixed for you ────────────────────────────────────────────────────────
// Calls existing getStationByGenre, getStationByArtist, getTrendingTracks.
// No duplicated queries — only the Interaction lookup is new here.

exports.getMixedForYou = async (userId) => {
  const recentLikes = await Interaction.find({
    actorId: userId,
    actionType: 'LIKE',
    targetModel: 'Track',
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('targetId', 'genre artist');

  const genreCount = {};
  const artistIds = new Set();

  recentLikes.forEach((like) => {
    const genre = like.targetId?.genre;
    const artist = like.targetId?.artist?.toString();
    if (genre) genreCount[genre] = (genreCount[genre] || 0) + 1;
    if (artist) artistIds.add(artist);
  });

  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([genre]) => genre);

  const stations = [];

  // Station 1 — calls existing getStationByGenre
  if (topGenres[0]) {
    const tracks = await exports.getStationByGenre(topGenres[0]);
    if (tracks.length > 0) {
      stations.push({
        id: `genre_${topGenres[0].replace(/\s+/g, '_').toLowerCase()}`,
        title: topGenres[0],
        description: `Top ${topGenres[0]} tracks based on your listening`,
        type: 'genre',
        tracks,
      });
    }
  }

  // Station 2 — calls existing getStationByGenre
  if (topGenres[1]) {
    const tracks = await exports.getStationByGenre(topGenres[1]);
    if (tracks.length > 0) {
      stations.push({
        id: `genre_${topGenres[1].replace(/\s+/g, '_').toLowerCase()}`,
        title: topGenres[1],
        description: `More ${topGenres[1]} you will enjoy`,
        type: 'genre',
        tracks,
      });
    }
  }

  // Station 3 — calls existing getStationByArtist
  const artistIdArray = [...artistIds].slice(0, 1);
  if (artistIdArray.length > 0) {
    const artistId = artistIdArray[0];
    const tracks = await exports.getStationByArtist(artistId);
    if (tracks.length > 0) {
      stations.push({
        id: `artist_${artistId}`,
        title: `More from ${tracks[0].artist?.displayName || 'this artist'}`,
        description: 'Because you liked their music',
        type: 'artist',
        tracks,
      });
    }
  }

  // Station 4 — calls existing getTrendingTracks (uses cache)
  const trendingTracks = await exports.getTrendingTracks(20);
  stations.push({
    id: 'trending_mix',
    title: 'Trending now',
    description: 'Most played tracks on the platform',
    type: 'trending',
    tracks: trendingTracks,
  });

  return stations;
};

// ── New: Curated by platform ──────────────────────────────────────────────────
// fresh_finds and spotlight need raw queries (no existing function covers them).
// trending calls getTrendingTracks, genre buckets call getStationByGenre.

exports.getCuratedByPlatform = async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Raw query — no existing function covers date-filtered fresh uploads
  const freshTracks = await Track.find({
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    createdAt: { $gte: sevenDaysAgo },
  })
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ viralScore: -1 })
    .limit(20)
    .populate('artist', 'displayName avatarUrl permalink')
    .lean();

  // Raw query — no existing function covers isPromoted filtering
  const promotedTracks = await Track.find({
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    isPromoted: true,
  })
    .select(
      'title permalink artworkUrl duration genre tags playCount likeCount repostCount commentCount containsExplicitContent releaseDate artist'
    )
    .sort({ viralScore: -1 })
    .limit(20)
    .populate('artist', 'displayName avatarUrl permalink')
    .lean();

  // Calls existing getTrendingTracks (hits cache when warm)
  const trendingTracks = await exports.getTrendingTracks(20);

  // Calls existing getStationByGenre — no duplicated query
  const electronicTracks = await exports.getStationByGenre('Electronic');
  const hiphopTracks = await exports.getStationByGenre('Hiphop & rap');

  const curated = [
    {
      id: 'fresh_finds',
      title: 'Fresh finds',
      description: 'New uploads trending this week',
      curatedBy: 'platform',
      tracks: freshTracks,
    },
    {
      id: 'trending_globally',
      title: 'Trending globally',
      description: 'Most-played tracks across all genres right now',
      curatedBy: 'platform',
      tracks: trendingTracks,
    },
    promotedTracks.length > 0 && {
      id: 'spotlight',
      title: 'Spotlight',
      description: 'Featured and promoted artists',
      curatedBy: 'platform',
      tracks: promotedTracks,
    },
    electronicTracks.length > 0 && {
      id: 'top_electronic',
      title: 'Top Electronic',
      description: 'The biggest tracks in electronic music',
      curatedBy: 'platform',
      tracks: electronicTracks,
    },
    hiphopTracks.length > 0 && {
      id: 'top_hiphop',
      title: 'Top Hip-hop & Rap',
      description: 'Essential hip-hop and rap picks',
      curatedBy: 'platform',
      tracks: hiphopTracks,
    },
  ].filter(Boolean);

  return curated;
};
