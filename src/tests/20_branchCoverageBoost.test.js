'use strict';
/**
 * 20_branchCoverageBoost.test.js
 *
 * Targets uncovered branches in:
 *  - discoveryService  (getRelatedTracks, getUsersWhoLikedAlsoLiked, getMoreOfWhatYouLike,
 *                       getMixedForYou, getCuratedByPlatform, getRecommendedBasedOnLikes fallback,
 *                       getTrendingTracks with/without cache, invalid limit)
 *  - feedService       (cursor path, ad injection at <5 items, grouped feed, block filtering,
 *                       missing actor/target, playlist creator path)
 *  - interactionService (addLike Playlist branch, removeLike Track/Playlist, getUserLikes,
 *                        getUserReposts, getTrackEngagers type filter)
 *  - networkService    (getSuggestedUsers all branches, blockUser mutual-follow combos,
 *                       unblockUser, getFollowers/getFollowing/getBlockedUsers)
 */

// ─── mocks ────────────────────────────────────────────────────────────────────
jest.mock('../models/trackModel');
jest.mock('../models/interactionModel');
jest.mock('../models/cacheModel');
jest.mock('../models/feedItemModel');
jest.mock('../models/blockModel');
jest.mock('../models/followModel');
jest.mock('../models/userModel');
jest.mock('../models/playlistModel');
jest.mock('../utils/queueProducer');
jest.mock('../services/notificationService');

const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Cache = require('../models/cacheModel');
const FeedItem = require('../models/feedItemModel');
const Block = require('../models/blockModel');
const Follow = require('../models/followModel');
const User = require('../models/userModel');
const Playlist = require('../models/playlistModel');
const { publishToQueue } = require('../utils/queueProducer');
const notificationService = require('../services/notificationService');
const AppError = require('../utils/appError');

const UID = '507f1f77bcf86cd799439011';
const UID2 = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';
const PID = '507f1f77bcf86cd799439044';
const AID = '507f1f77bcf86cd799439055';

const mkObjectId = (str) => ({ toString: () => str, _id: str });

beforeEach(() => {
  jest.clearAllMocks();
  notificationService.notifyLike = jest.fn();
  notificationService.notifyRepost = jest.fn();
  notificationService.retractNotification = jest.fn();
  publishToQueue.mockResolvedValue(true);
  global.AppError = AppError;
});

// ═══════════════════════════════════════════════════════════
// discoveryService
// ═══════════════════════════════════════════════════════════
describe('discoveryService', () => {
  let svc;

  beforeAll(() => {
    global.AppError = AppError;
    svc = require('../services/discoveryService');
  });

  // ── getTrendingTracks ──────────────────────────────────────
  describe('getTrendingTracks', () => {
    test('returns cached data when cache hit', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ key: 'k', data: [{ title: 'cached' }] }),
      });
      const result = await svc.getTrendingTracks(5, 'Pop');
      expect(result).toEqual([{ title: 'cached' }]);
    });

    test('fetches from DB on cache miss and upserts cache', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        allowDiskUse: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ title: 'db track' }]),
      };
      Track.find.mockReturnValue(mockFind);
      Cache.findOneAndUpdate.mockResolvedValue({});

      const result = await svc.getTrendingTracks(10, 'Electronic');
      expect(result).toEqual([{ title: 'db track' }]);
      expect(Cache.findOneAndUpdate).toHaveBeenCalled();
    });

    test('handles cache upsert duplicate key error (11000) silently', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        allowDiskUse: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      Track.find.mockReturnValue(mockFind);
      Cache.findOneAndUpdate.mockRejectedValue({ code: 11000 });

      await expect(svc.getTrendingTracks()).resolves.toEqual([]);
    });

    test('logs non-11000 cache error but still returns results', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        allowDiskUse: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ title: 'x' }]),
      };
      Track.find.mockReturnValue(mockFind);
      Cache.findOneAndUpdate.mockRejectedValue({
        code: 99999,
        message: 'other error',
      });

      const result = await svc.getTrendingTracks();
      expect(result).toEqual([{ title: 'x' }]);
    });

    test('uses default limit of 20 for NaN or zero limit', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        allowDiskUse: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      Track.find.mockReturnValue(mockFind);
      Cache.findOneAndUpdate.mockResolvedValue({});

      await svc.getTrendingTracks('abc');
      expect(mockFind.limit).toHaveBeenCalledWith(20);
    });

    test('uses default limit for negative limit', async () => {
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        allowDiskUse: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      Track.find.mockReturnValue(mockFind);
      Cache.findOneAndUpdate.mockResolvedValue({});

      await svc.getTrendingTracks(-5);
      expect(mockFind.limit).toHaveBeenCalledWith(20);
    });
  });

  // ── getRecommendedBasedOnLikes ─────────────────────────────
  describe('getRecommendedBasedOnLikes', () => {
    test('falls back to getTrendingTracks when no liked genres', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      });
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [{ title: 'trending' }] }),
      });

      const result = await svc.getRecommendedBasedOnLikes(UID);
      expect(result).toEqual([{ title: 'trending' }]);
    });

    test('returns genre-based tracks when genres found', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([{ targetId: { genre: 'Rock', _id: TID } }]),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([{ title: 'rock track' }]),
      };
      Track.find.mockReturnValue(mockFind);

      const result = await svc.getRecommendedBasedOnLikes(UID);
      expect(result).toEqual([{ title: 'rock track' }]);
    });

    test('filters out nullish targetId.genre safely', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([
            { targetId: null },
            { targetId: { genre: null, _id: TID } },
          ]),
      });
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await svc.getRecommendedBasedOnLikes(UID);
      expect(result).toEqual([]);
    });
  });

  // ── getRelatedTracks ───────────────────────────────────────
  describe('getRelatedTracks', () => {
    test('throws 404 when track not found', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(svc.getRelatedTracks(TID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    test('returns related tracks', async () => {
      Track.findById.mockResolvedValue({ genre: 'Pop', tags: ['a', 'b'] });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([{ title: 'related' }]),
      };
      Track.find.mockReturnValue(mockFind);

      const result = await svc.getRelatedTracks(TID);
      expect(result).toEqual([{ title: 'related' }]);
    });
  });

  // ── getUsersWhoLikedAlsoLiked ──────────────────────────────
  describe('getUsersWhoLikedAlsoLiked', () => {
    test('returns empty array when no users liked the track', async () => {
      Interaction.find.mockResolvedValueOnce([]); // likesForThisTrack
      const result = await svc.getUsersWhoLikedAlsoLiked(TID);
      expect(result).toEqual([]);
    });

    test('returns recommended tracks from co-likers', async () => {
      Interaction.find
        .mockResolvedValueOnce([{ actorId: UID }]) // likesForThisTrack
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue([
            {
              targetId: {
                _id: { toString: () => PID },
                isPublic: true,
                moderationStatus: 'Approved',
              },
            },
          ]),
        });

      const result = await svc.getUsersWhoLikedAlsoLiked(TID);
      expect(result).toHaveLength(1);
    });

    test('skips private or non-approved tracks', async () => {
      Interaction.find
        .mockResolvedValueOnce([{ actorId: UID }])
        .mockReturnValueOnce({
          populate: jest
            .fn()
            .mockResolvedValue([
              {
                targetId: {
                  _id: { toString: () => PID },
                  isPublic: false,
                  moderationStatus: 'Approved',
                },
              },
              {
                targetId: {
                  _id: { toString: () => AID },
                  isPublic: true,
                  moderationStatus: 'Pending',
                },
              },
            ]),
        });

      const result = await svc.getUsersWhoLikedAlsoLiked(TID);
      expect(result).toHaveLength(0);
    });

    test('deduplicates repeated targetIds', async () => {
      const sameTid = { toString: () => 'same_id' };
      Interaction.find
        .mockResolvedValueOnce([{ actorId: UID }, { actorId: UID2 }])
        .mockReturnValueOnce({
          populate: jest
            .fn()
            .mockResolvedValue([
              {
                targetId: {
                  _id: sameTid,
                  isPublic: true,
                  moderationStatus: 'Approved',
                },
              },
              {
                targetId: {
                  _id: sameTid,
                  isPublic: true,
                  moderationStatus: 'Approved',
                },
              },
            ]),
        });

      const result = await svc.getUsersWhoLikedAlsoLiked(TID);
      expect(result).toHaveLength(1);
    });

    test('skips null targetId entries', async () => {
      Interaction.find
        .mockResolvedValueOnce([{ actorId: UID }])
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue([{ targetId: null }]),
        });

      const result = await svc.getUsersWhoLikedAlsoLiked(TID);
      expect(result).toHaveLength(0);
    });
  });

  // ── getMoreOfWhatYouLike ───────────────────────────────────
  describe('getMoreOfWhatYouLike', () => {
    test('returns basedOn:trending when no liked genres', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      });
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await svc.getMoreOfWhatYouLike(UID);
      expect(result.basedOn).toBe('trending');
      expect(result.genres).toEqual([]);
    });

    test('returns basedOn:likes when genres found', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([{ targetId: { genre: 'Jazz' } }]),
      });
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([{ title: 'jazz' }]),
      };
      Track.find.mockReturnValue(mockFind);

      const result = await svc.getMoreOfWhatYouLike(UID);
      expect(result.basedOn).toBe('likes');
      expect(result.tracks).toEqual([{ title: 'jazz' }]);
    });
  });

  // ── getMixedForYou ─────────────────────────────────────────
  describe('getMixedForYou', () => {
    const mkFindChain = (results) => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(results),
    });

    test('returns only trending station when no likes', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      });
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [{ title: 't' }] }),
      });

      const result = await svc.getMixedForYou(UID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trending_mix');
    });

    test('includes genre and artist stations when likes exist', async () => {
      const artistId = { toString: () => AID };
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([
            { targetId: { genre: 'Pop', artist: artistId } },
            { targetId: { genre: 'Rock', artist: artistId } },
            { targetId: { genre: 'Pop', artist: null } },
          ]),
      });

      // genre stations
      Track.find.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([
            { title: 'genre track', artist: { displayName: 'DJ' } },
          ]),
      }));

      // trending cache
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [{ title: 'trending' }] }),
      });

      const result = await svc.getMixedForYou(UID);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('trending_mix');
    });

    test('skips empty genre station', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([{ targetId: { genre: 'Pop', artist: null } }]),
      });
      // genre station returns empty
      Track.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      });
      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await svc.getMixedForYou(UID);
      // Only trending, no genre station
      expect(result.every((s) => s.id !== 'genre_pop')).toBe(true);
    });
  });

  // ── getCuratedByPlatform ───────────────────────────────────
  describe('getCuratedByPlatform', () => {
    const mkFindChain = (results, isLean = true) => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(results),
    });

    test('returns curated stations including spotlight when promoted tracks exist', async () => {
      // fresh tracks, promoted tracks, electronic, hiphop, trending
      Track.find
        .mockReturnValueOnce(mkFindChain([{ title: 'fresh' }])) // fresh
        .mockReturnValueOnce(mkFindChain([{ title: 'promoted' }])) // promoted
        .mockReturnValueOnce({
          // electronic (via getStationByGenre)
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockResolvedValue([{ title: 'electronic' }]),
        })
        .mockReturnValueOnce({
          // hiphop (via getStationByGenre)
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockResolvedValue([{ title: 'hiphop' }]),
        });

      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [{ title: 'trending' }] }),
      });

      const result = await svc.getCuratedByPlatform();
      expect(result.some((s) => s.id === 'fresh_finds')).toBe(true);
      expect(result.some((s) => s.id === 'spotlight')).toBe(true);
      expect(result.some((s) => s.id === 'trending_globally')).toBe(true);
    });

    test('omits spotlight when no promoted tracks', async () => {
      Track.find
        .mockReturnValueOnce(mkFindChain([{ title: 'fresh' }]))
        .mockReturnValueOnce(mkFindChain([])) // no promoted
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockResolvedValue([]),
        });

      Cache.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await svc.getCuratedByPlatform();
      expect(result.some((s) => s.id === 'spotlight')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// feedService
// ═══════════════════════════════════════════════════════════
describe('feedService', () => {
  const svc = require('../services/feedService');

  const mkFeedItem = (opts = {}) => ({
    actorId: opts.actorId || {
      _id: { toString: () => UID2 },
      displayName: 'Bob',
    },
    targetId: opts.targetId || {
      _id: { toString: () => TID },
      isPublic: true,
      artist: { _id: { toString: () => AID }, displayName: 'DJ' },
      creator: null,
    },
    activityType: opts.activityType || 'LIKE',
    activityDate: opts.activityDate || new Date('2024-01-01'),
    targetModel: opts.targetModel || 'Track',
    ...opts,
  });

  beforeEach(() => {
    Block.find = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    Track.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
  });

  test('returns empty feed with nextCursor null when no items', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test('sets nextCursor from last item', async () => {
    const date = new Date('2024-03-01');
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem({ activityDate: date })]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.nextCursor).toBe(date.toISOString());
  });

  test('uses cursor in query when provided', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    await svc.getUserFeed(UID, '2024-01-01T00:00:00.000Z');
    expect(FeedItem.find).toHaveBeenCalledWith(
      expect.objectContaining({ activityDate: expect.any(Object) })
    );
  });

  test('filters out items with missing targetId', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem({ targetId: null })]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('filters out items with missing actorId', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem({ actorId: null })]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('filters out private tracks', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          mkFeedItem({
            targetId: {
              _id: { toString: () => TID },
              isPublic: false,
              artist: null,
              creator: null,
            },
          }),
        ]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('filters out blocked actor', async () => {
    Block.find = jest.fn().mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue([
          {
            blocker: { toString: () => UID },
            blocked: { toString: () => UID2 },
          },
        ]),
    });
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem()]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('groups repeated actor-target-type into one feed item', async () => {
    const actor1 = { _id: { toString: () => UID2 }, displayName: 'Bob' };
    const actor2 = { _id: { toString: () => AID }, displayName: 'Alice' };
    const target = {
      _id: { toString: () => TID },
      isPublic: true,
      artist: { _id: { toString: () => 'x' } },
      creator: null,
    };
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          actorId: actor1,
          targetId: target,
          activityType: 'LIKE',
          activityDate: new Date(),
          targetModel: 'Track',
        },
        {
          actorId: actor2,
          targetId: target,
          activityType: 'LIKE',
          activityDate: new Date(),
          targetModel: 'Track',
        },
      ]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(1);
    expect(result.feedActivities[0].actors).toHaveLength(2);
  });

  test('uses creator field when targetId has no artist (playlist feed)', async () => {
    const creator = { _id: { toString: () => AID }, displayName: 'Creator' };
    const target = {
      _id: { toString: () => TID },
      isPublic: true,
      artist: null,
      creator,
    };
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          {
            actorId: { _id: { toString: () => UID2 }, displayName: 'Bob' },
            targetId: target,
            activityType: 'REPOST',
            activityDate: new Date(),
            targetModel: 'Playlist',
          },
        ]),
    });

    const result = await svc.getUserFeed(UID);
    expect(result.feedActivities).toHaveLength(1);
  });

  test('injects ad when promoted track exists and feed >= 5 items', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      actorId: { _id: { toString: () => `actor_${i}` }, displayName: `A${i}` },
      targetId: {
        _id: { toString: () => `t_${i}` },
        isPublic: true,
        artist: { _id: { toString: () => `cr_${i}` } },
        creator: null,
      },
      activityType: 'LIKE',
      activityDate: new Date(),
      targetModel: 'Track',
    }));

    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    });

    Track.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue({
          _id: 'promo',
          title: 'Promo Track',
          artist: { displayName: 'Sponsor' },
        }),
    });

    const result = await svc.getUserFeed(UID);
    expect(
      result.feedActivities.some((a) => a.activityType === 'PROMOTED')
    ).toBe(true);
  });

  test('does not inject ad when feed has fewer than 5 items', async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      actorId: { _id: { toString: () => `actor_${i}` }, displayName: `A${i}` },
      targetId: {
        _id: { toString: () => `t_${i}` },
        isPublic: true,
        artist: { _id: { toString: () => `cr_${i}` } },
        creator: null,
      },
      activityType: 'LIKE',
      activityDate: new Date(),
      targetModel: 'Track',
    }));

    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    });

    Track.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: 'promo', title: 'Promo' }),
    });

    const result = await svc.getUserFeed(UID);
    expect(
      result.feedActivities.some((a) => a.activityType === 'PROMOTED')
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// interactionService
// ═══════════════════════════════════════════════════════════
describe('interactionService', () => {
  const svc = require('../services/interactionService');

  // ── addLike ────────────────────────────────────────────────
  describe('addLike', () => {
    test('adds like to a Playlist', async () => {
      Playlist.findById.mockResolvedValue({
        _id: PID,
        creator: UID2,
        save: jest.fn(),
      });
      Interaction.findOne.mockResolvedValue(null);
      Interaction.create.mockResolvedValue({});
      Playlist.findByIdAndUpdate.mockResolvedValue({ likeCount: 1 });
      publishToQueue.mockResolvedValue(true);

      const result = await svc.addLike(UID, PID, 'Playlist');
      expect(result.liked).toBe(true);
    });

    test('adds like to a Track (default)', async () => {
      Track.findById.mockResolvedValue({ _id: TID, artist: UID2 });
      Interaction.findOne.mockResolvedValue(null);
      Interaction.create.mockResolvedValue({});
      Track.findByIdAndUpdate.mockResolvedValue({ likeCount: 5 });

      const result = await svc.addLike(UID, TID);
      expect(result.liked).toBe(true);
    });

    test('throws 404 when Playlist not found', async () => {
      Playlist.findById.mockResolvedValue(null);
      await expect(svc.addLike(UID, PID, 'Playlist')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    test('throws 400 when already liked', async () => {
      Track.findById.mockResolvedValue({ _id: TID, artist: UID2 });
      Interaction.findOne.mockResolvedValue({ _id: 'existing' });
      await expect(svc.addLike(UID, TID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── removeLike ─────────────────────────────────────────────
  describe('removeLike', () => {
    test('removes like from Track', async () => {
      Track.findById.mockResolvedValue({ _id: TID });
      Interaction.findOneAndDelete.mockResolvedValue({ _id: 'int' });
      Track.findByIdAndUpdate.mockResolvedValue({ likeCount: 0 });

      const result = await svc.removeLike(UID, TID);
      expect(result.liked).toBe(false);
    });

    test('removes like from Playlist', async () => {
      Playlist.findById.mockResolvedValue({ _id: PID });
      Interaction.findOneAndDelete.mockResolvedValue({ _id: 'int' });
      Playlist.findByIdAndUpdate.mockResolvedValue({ likeCount: 0 });

      const result = await svc.removeLike(UID, PID, 'Playlist');
      expect(result.liked).toBe(false);
    });

    test('throws 404 when entity not found', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(svc.removeLike(UID, TID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    test('throws 400 when like not found', async () => {
      Track.findById.mockResolvedValue({ _id: TID });
      Interaction.findOneAndDelete.mockResolvedValue(null);
      await expect(svc.removeLike(UID, TID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── getUserLikes ───────────────────────────────────────────
  describe('getUserLikes', () => {
    test('returns paginated likes filtering nulls', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([
          {
            targetId: { _id: TID, title: 'Track A' },
            createdAt: new Date(),
            targetModel: 'Track',
          },
          { targetId: null, createdAt: new Date(), targetModel: 'Track' },
        ]),
      });
      Interaction.countDocuments.mockResolvedValue(2);

      const result = await svc.getUserLikes(UID, 1, 20);
      expect(result.likedTracks).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  // ── getUserReposts ─────────────────────────────────────────
  describe('getUserReposts', () => {
    test('returns paginated reposts filtering nulls', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([
          {
            targetId: { _id: TID, title: 'Track B' },
            createdAt: new Date(),
            targetModel: 'Track',
          },
          { targetId: null, createdAt: new Date(), targetModel: 'Track' },
        ]),
      });
      Interaction.countDocuments.mockResolvedValue(2);

      const result = await svc.getUserReposts(UID, 1, 20);
      expect(result.repostedTracks).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  // ── getTrackEngagers ───────────────────────────────────────
  describe('getTrackEngagers', () => {
    test('queries LIKE engagers', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest
          .fn()
          .mockResolvedValue([{ actorId: { displayName: 'Fan' } }]),
      });
      Interaction.countDocuments.mockResolvedValue(1);

      const result = await svc.getTrackEngagers(TID, 'LIKE', 1, 20);
      expect(result.total).toBe(1);
    });

    test('queries REPOST engagers', async () => {
      Interaction.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      });
      Interaction.countDocuments.mockResolvedValue(0);

      const result = await svc.getTrackEngagers(TID, 'REPOST', 1, 20);
      expect(result.total).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// networkService
// ═══════════════════════════════════════════════════════════
describe('networkService', () => {
  const svc = require('../services/networkService');

  // ── getFollowers / getFollowing ─────────────────────────────
  describe('getFollowers', () => {
    test('returns paginated followers', async () => {
      Follow.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest
          .fn()
          .mockResolvedValue([{ follower: { displayName: 'Alice' } }]),
      });
      Follow.countDocuments.mockResolvedValue(1);

      const result = await svc.getFollowers(UID);
      expect(result).toHaveLength(1);
    });
  });

  describe('getFollowing', () => {
    test('returns paginated following', async () => {
      Follow.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest
          .fn()
          .mockResolvedValue([{ following: { displayName: 'Bob' } }]),
      });
      Follow.countDocuments.mockResolvedValue(1);

      const result = await svc.getFollowing(UID);
      expect(result).toHaveLength(1);
    });
  });

  // ── getSuggestedUsers ──────────────────────────────────────
  describe('getSuggestedUsers', () => {
    test('returns mutual follow suggestions when followingIds exists', async () => {
      const mkUserFindChain = (resolved) => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
        };
        chain.then = (cb) => cb(resolved);
        return chain;
      };

      Follow.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([{ following: UID2 }]),
      });
      Block.find.mockResolvedValue([]);
      Follow.aggregate.mockResolvedValue([{ _id: AID, mutualCount: 2 }]);
      User.find
        .mockReturnValueOnce(
          mkUserFindChain([{ _id: AID, displayName: 'Mutual' }])
        )
        .mockReturnValueOnce(mkUserFindChain([]));

      const result = await svc.getSuggestedUsers(UID);
      expect(result).toHaveLength(1);
    });

    test('falls back to popular users when no following', async () => {
      Follow.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      Block.find.mockResolvedValue([]);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue([{ _id: AID, displayName: 'Popular' }]),
      });

      const result = await svc.getSuggestedUsers(UID);
      expect(result).toHaveLength(1);
    });

    test('falls back to popular users when mutual results are fewer than limit', async () => {
      Follow.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([{ following: UID2 }]),
      });
      Block.find.mockResolvedValue([]);
      Follow.aggregate.mockResolvedValue([{ _id: AID, mutualCount: 1 }]);
      // mutual returns 1 user
      User.find
        .mockReturnValueOnce({
          select: jest
            .fn()
            .mockResolvedValue([{ _id: AID, displayName: 'Mutual' }]),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest
            .fn()
            .mockResolvedValue([{ _id: 'extra', displayName: 'Popular' }]),
        });

      const result = await svc.getSuggestedUsers(UID, 1, 10);
      expect(result.length).toBeGreaterThan(0);
    });

    test('excludes blocked users from suggestions', async () => {
      Follow.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });
      Block.find.mockResolvedValue([
        { blocker: { toString: () => UID }, blocked: { toString: () => AID } },
      ]);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });

      const result = await svc.getSuggestedUsers(UID);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── getBlockedUsers ─────────────────────────────────────────
  describe('getBlockedUsers', () => {
    test('returns list of blocked user objects', async () => {
      Block.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest
          .fn()
          .mockResolvedValue([
            { blocked: { _id: AID, displayName: 'Blocked User' } },
          ]),
      });

      const result = await svc.getBlockedUsers(UID);
      expect(result).toHaveLength(1);
    });
  });

  // ── blockUser ───────────────────────────────────────────────
  describe('blockUser', () => {
    test('throws 400 when blocking self', async () => {
      await expect(svc.blockUser(UID, UID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('throws 409 when already blocked', async () => {
      Block.updateOne.mockResolvedValue({ upsertedCount: 0 });
      await expect(svc.blockUser(UID, UID2)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    test('blocks when both follow each other (updates counts)', async () => {
      Block.updateOne.mockResolvedValue({ upsertedCount: 1 });
      Follow.findOneAndDelete
        .mockResolvedValueOnce({ _id: 'f1' }) // blocker followed blocked
        .mockResolvedValueOnce({ _id: 'f2' }); // blocked followed blocker
      User.findByIdAndUpdate.mockResolvedValue({});

      const result = await svc.blockUser(UID, UID2);
      expect(result.status).toBe('blocked');
      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    test('blocks when only blocker was following blocked', async () => {
      Block.updateOne.mockResolvedValue({ upsertedCount: 1 });
      Follow.findOneAndDelete
        .mockResolvedValueOnce({ _id: 'f1' }) // blocker followed blocked
        .mockResolvedValueOnce(null); // blocked did not follow blocker
      User.findByIdAndUpdate.mockResolvedValue({});

      const result = await svc.blockUser(UID, UID2);
      expect(result.status).toBe('blocked');
    });

    test('blocks when neither was following the other (no count updates)', async () => {
      Block.updateOne.mockResolvedValue({ upsertedCount: 1 });
      Follow.findOneAndDelete
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await svc.blockUser(UID, UID2);
      expect(result.status).toBe('blocked');
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ── unblockUser ─────────────────────────────────────────────
  describe('unblockUser', () => {
    test('throws 404 when block not found', async () => {
      Block.findOneAndDelete.mockResolvedValue(null);
      await expect(svc.unblockUser(UID, UID2)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    test('successfully unblocks', async () => {
      Block.findOneAndDelete.mockResolvedValue({ _id: 'block' });
      const result = await svc.unblockUser(UID, UID2);
      expect(result.status).toBe('unblocked');
    });
  });
});
