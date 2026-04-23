const Track = require('../models/trackModel');

exports.getTrendingTracks = async (limit = 20, genre = null) => {
  const parsedLimit = parseInt(limit, 10);

  const matchQuery = {
    isPublic: true,
    moderationStatus: 'Approved',
    processingState: 'Finished',
    viralScore: { $gt: 0 }, // Only fetch tracks that have some momentum
  };

  if (genre) matchQuery.genre = genre;

  // No more complex aggregations! Just sort by the live viralScore.
  const trendingTracks = await Track.find(matchQuery)
    .sort({ viralScore: -1 })
    .limit(parsedLimit)
    .populate({
      path: 'artist',
      select: 'displayName permalink avatarUrl',
    })
    .lean();

  return trendingTracks;
};
