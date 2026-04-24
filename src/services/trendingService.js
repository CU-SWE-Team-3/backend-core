const Track = require('../models/trackModel');
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
