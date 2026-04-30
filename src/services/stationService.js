const StationLike = require('../models/stationLikeModel');
const AppError = require('../utils/appError');
const discoveryService = require('./discoveryService');

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Re-hydrate a single liked station by fetching its tracks from discoveryService.
 * Returns null if the station can no longer be resolved (e.g. artist deleted).
 */
const hydrateStation = async (like) => {
  try {
    let tracks = [];

    switch (like.stationType) {
      case 'genre':
        if (like.genre) {
          tracks = await discoveryService.getStationByGenre(like.genre);
        }
        break;
      case 'artist':
        if (like.artistId) {
          tracks = await discoveryService.getStationByArtist(like.artistId);
        }
        break;
      case 'trending':
        tracks = await discoveryService.getTrendingTracks(20);
        break;
      case 'recommended':
        tracks = await discoveryService.getTrendingTracks(20); // fallback
        break;
      case 'curated':
        // For curated stations we fetch all and find by stationId
        {
          const allCurated = await discoveryService.getCuratedByPlatform();
          const found = allCurated.find((s) => s.id === like.stationId);
          tracks = found ? found.tracks : [];
        }
        break;
      default:
        tracks = [];
    }

    return {
      stationId: like.stationId,
      stationType: like.stationType,
      stationTitle: like.stationTitle,
      stationDescription: like.stationDescription,
      artistId: like.artistId || null,
      genre: like.genre || null,
      likedAt: like.createdAt,
      tracks,
    };
  } catch {
    return null;
  }
};

// ─── exports ──────────────────────────────────────────────────────────────────

/**
 * Like a station.
 *
 * @param {string} userId
 * @param {object} stationData  { stationId, stationType, stationTitle, stationDescription, artistId?, genre? }
 */
exports.likeStation = async (userId, stationData) => {
  const {
    stationId,
    stationType,
    stationTitle,
    stationDescription,
    artistId,
    genre,
  } = stationData;

  if (!stationId || !stationType) {
    throw new AppError('stationId and stationType are required.', 400);
  }

  const VALID_TYPES = ['genre', 'artist', 'trending', 'curated', 'recommended'];
  if (!VALID_TYPES.includes(stationType)) {
    throw new AppError(
      `Invalid stationType. Must be one of: ${VALID_TYPES.join(', ')}.`,
      400
    );
  }

  const existing = await StationLike.findOne({ user: userId, stationId });
  if (existing) {
    throw new AppError('You have already liked this station.', 400);
  }

  const like = await StationLike.create({
    user: userId,
    stationId,
    stationType,
    stationTitle: stationTitle || stationId,
    stationDescription: stationDescription || '',
    artistId: artistId || null,
    genre: genre || null,
  });

  return {
    liked: true,
    stationId: like.stationId,
    stationType: like.stationType,
    stationTitle: like.stationTitle,
    likedAt: like.createdAt,
  };
};

/**
 * Unlike a station.
 */
exports.unlikeStation = async (userId, stationId) => {
  const like = await StationLike.findOneAndDelete({ user: userId, stationId });
  if (!like) {
    throw new AppError('You have not liked this station.', 400);
  }
  return { liked: false, stationId };
};

/**
 * Get all stations liked by a user (paginated), with live track data.
 *
 * @param {string}  userId
 * @param {number}  page
 * @param {number}  limit
 * @param {boolean} hydrate  – when true, fetch fresh tracks for every station
 */
exports.getLikedStations = async (userId, page = 1, limit = 20, hydrate = true) => {
  const skip = (page - 1) * limit;

  const likes = await StationLike.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await StationLike.countDocuments({ user: userId });

  if (!hydrate) {
    return {
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / limit),
      stations: likes.map((l) => ({
        stationId: l.stationId,
        stationType: l.stationType,
        stationTitle: l.stationTitle,
        stationDescription: l.stationDescription,
        artistId: l.artistId || null,
        genre: l.genre || null,
        likedAt: l.createdAt,
      })),
    };
  }

  // Hydrate all in parallel; drop ones that no longer resolve
  const hydrated = (
    await Promise.all(likes.map((l) => hydrateStation(l)))
  ).filter(Boolean);

  return {
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    stations: hydrated,
  };
};

/**
 * Check whether the current user has liked a specific station.
 */
exports.checkStationLiked = async (userId, stationId) => {
  const like = await StationLike.findOne({ user: userId, stationId }).lean();
  return { liked: !!like, stationId };
};
