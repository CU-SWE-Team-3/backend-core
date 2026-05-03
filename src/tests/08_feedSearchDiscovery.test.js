'use strict';
/**
 * 08_feedSearchDiscovery.test.js
 * Module 8: Feed, Search & Discovery
 * Tests feedService, searchService, discoveryService, and their controllers
 */

jest.mock('../models/feedItemModel');
jest.mock('../models/blockModel');
jest.mock('../models/trackModel');
jest.mock('../models/userModel');
jest.mock('../models/playlistModel');
jest.mock('../models/interactionModel');
jest.mock('../models/cacheModel');

const FeedItem = require('../models/feedItemModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Playlist = require('../models/playlistModel');
const Interaction = require('../models/interactionModel');
const Cache = require('../models/cacheModel');

// Mock services for controller tests
jest.mock('../services/feedService');
jest.mock('../services/searchService');
jest.mock('../services/discoveryService');

const feedService = require('../services/feedService');
const searchService = require('../services/searchService');
const discoveryService = require('../services/discoveryService');

const feedController = require('../controllers/feedController');
const searchController = require('../controllers/searchController');
const discoveryController = require('../controllers/discoveryController');

const UID = '507f1f77bcf86cd799439011';
const TID = '507f1f77bcf86cd799439022';

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ─── feedController ───────────────────────────────────────────────────────────
describe('feedController', () => {
  test('getActivityFeed — 200 with cursor and limit', async () => {
    feedService.getUserFeed.mockResolvedValue({ feedActivities: [], nextCursor: null });
    const r = mkRes();
    await feedController.getActivityFeed({ user: { _id: UID }, query: { cursor: null, limit: '20' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(feedService.getUserFeed).toHaveBeenCalledWith(UID, null, 20);
  });

  test('getActivityFeed — uses default limit when not provided', async () => {
    feedService.getUserFeed.mockResolvedValue({ feedActivities: [{ activityType: 'LIKE' }], nextCursor: 'cursor123' });
    const r = mkRes();
    await feedController.getActivityFeed({ user: { _id: UID }, query: {} }, r, jest.fn());
    expect(feedService.getUserFeed).toHaveBeenCalledWith(UID, null, 40);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ results: 1 }));
  });

  test('getActivityFeed — passes cursor to service', async () => {
    feedService.getUserFeed.mockResolvedValue({ feedActivities: [], nextCursor: null });
    const r = mkRes();
    await feedController.getActivityFeed({ user: { _id: UID }, query: { cursor: '2024-01-01' } }, r, jest.fn());
    expect(feedService.getUserFeed).toHaveBeenCalledWith(UID, '2024-01-01', 40);
  });
});

// ─── searchController ─────────────────────────────────────────────────────────
describe('searchController', () => {
  test('globalSearch — 200 with results', async () => {
    searchService.performGlobalSearch.mockResolvedValue({ tracks: [{ title: 'Beat' }], users: [], playlists: [] });
    const r = mkRes();
    await searchController.globalSearch({ user: { _id: UID }, query: { q: 'beat' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ results: 1 }));
  });

  test('globalSearch — 400 when no query', async () => {
    const r = mkRes();
    await searchController.globalSearch({ user: null, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });

  test('globalSearch — works without user (guest)', async () => {
    searchService.performGlobalSearch.mockResolvedValue({ tracks: [], users: [], playlists: [] });
    const r = mkRes();
    await searchController.globalSearch({ user: null, query: { q: 'chill' } }, r, jest.fn());
    expect(searchService.performGlobalSearch).toHaveBeenCalledWith('chill', undefined, 10, 0, null, expect.any(Object));
  });

  test('globalSearch — passes licenseType filter', async () => {
    searchService.performGlobalSearch.mockResolvedValue({ tracks: [], users: [], playlists: [] });
    const r = mkRes();
    await searchController.globalSearch({ user: { _id: UID }, query: { q: 'beat', licenseType: 'CC' } }, r, jest.fn());
    expect(searchService.performGlobalSearch).toHaveBeenCalledWith('beat', undefined, 10, 0, UID, { licenseType: 'CC' });
  });

  test('autocomplete — 200 with results', async () => {
    searchService.autocompleteSearch.mockResolvedValue({ tracks: [], users: [] });
    const r = mkRes();
    await searchController.autocomplete({ query: { q: 'be' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('autocomplete — 400 when no query', async () => {
    const r = mkRes();
    await searchController.autocomplete({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

// ─── discoveryController ──────────────────────────────────────────────────────
describe('discoveryController', () => {
  test('getTrendingCharts — 200', async () => {
    discoveryService.getTrendingTracks.mockResolvedValue([{ title: 'Hit' }]);
    const r = mkRes();
    await discoveryController.getTrendingCharts({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ results: 1 }));
  });

  test('getTrendingCharts — passes genre filter', async () => {
    discoveryService.getTrendingTracks.mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getTrendingCharts({ query: { genre: 'Electronic', limit: '10' } }, r, jest.fn());
    expect(discoveryService.getTrendingTracks).toHaveBeenCalledWith(10, 'Electronic');
  });

  test('getStationBasedOnLikes — 200', async () => {
    discoveryService.getRecommendedBasedOnLikes.mockResolvedValue([{ title: 'Chill' }]);
    const r = mkRes();
    await discoveryController.getStationBasedOnLikes({ user: { _id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getStationByGenre — 200', async () => {
    discoveryService.getStationByGenre.mockResolvedValue([{ title: 'House' }]);
    const r = mkRes();
    await discoveryController.getStationByGenre({ params: { genre: 'Electronic' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getStationByArtist — 200', async () => {
    discoveryService.getStationByArtist.mockResolvedValue([{ title: 'Track' }]);
    const r = mkRes();
    await discoveryController.getStationByArtist({ params: { artistId: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getRelatedTracks — 200', async () => {
    discoveryService.getRelatedTracks.mockResolvedValue([{ title: 'Related' }]);
    const r = mkRes();
    await discoveryController.getRelatedTracks({ params: { trackId: TID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getUsersWhoLikedAlsoLiked — 200', async () => {
    discoveryService.getUsersWhoLikedAlsoLiked.mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getUsersWhoLikedAlsoLiked({ params: { trackId: TID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getMoreOfWhatYouLike — 200', async () => {
    discoveryService.getMoreOfWhatYouLike.mockResolvedValue({ tracks: [], basedOn: 'trending', genres: [] });
    const r = mkRes();
    await discoveryController.getMoreOfWhatYouLike({ user: { _id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getMixedForYou — 200', async () => {
    discoveryService.getMixedForYou.mockResolvedValue([{ id: 'trending_mix', tracks: [] }]);
    const r = mkRes();
    await discoveryController.getMixedForYou({ user: { _id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getCuratedByPlatform — 200', async () => {
    discoveryService.getCuratedByPlatform.mockResolvedValue([{ id: 'fresh_finds', tracks: [] }]);
    const r = mkRes();
    await discoveryController.getCuratedByPlatform({}, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

// ─── feedService REAL unit tests ─────────────────────────────────────────────
describe('feedService (real)', () => {
  jest.unmock('../services/feedService');
  const realFeedService = jest.requireActual('../services/feedService');

  const mkFeedItem = (overrides = {}) => ({
    actorId: { _id: { toString: () => 'actor1' }, displayName: 'Fan' },
    targetId: { _id: { toString: () => TID }, title: 'Beat', isPublic: true, artist: { _id: { toString: () => UID } } },
    activityType: 'LIKE',
    activityDate: new Date('2024-01-01'),
    targetModel: 'Track',
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  test('getUserFeed — returns grouped activities', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem()]),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    expect(result.feedActivities).toHaveLength(1);
  });

  test('getUserFeed — filters out private tracks', async () => {
    const item = mkFeedItem({ targetId: { _id: { toString: () => TID }, isPublic: false, artist: { _id: { toString: () => UID } } } });
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([item]),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('getUserFeed — filters out blocked actor content', async () => {
    const blockedActorId = 'actor1';
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem()]),
    });
    Block.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ blocker: { toString: () => UID }, blocked: { toString: () => blockedActorId } }]),
    });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    expect(result.feedActivities).toHaveLength(0);
  });

  test('getUserFeed — groups multiple actors for same target', async () => {
    const items = [
      mkFeedItem({ actorId: { _id: { toString: () => 'actor1' }, displayName: 'A1' } }),
      mkFeedItem({ actorId: { _id: { toString: () => 'actor2' }, displayName: 'A2' } }),
    ];
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    expect(result.feedActivities[0].actors).toHaveLength(2);
  });

  test('getUserFeed — injects promoted ad at position 4 when feed >= 5 items', async () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      mkFeedItem({ actorId: { _id: { toString: () => `actor${i}` }, displayName: `A${i}` }, targetId: { _id: { toString: () => `tid${i}` }, isPublic: true, title: `Track${i}`, artist: { _id: { toString: () => `artist${i}` } } } })
    );
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: 'promo', title: 'Promo', isPublic: true, artist: { _id: { toString: () => 'artist0' } } }),
    });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    const adItem = result.feedActivities.find((f) => f.activityType === 'PROMOTED');
    expect(adItem).toBeDefined();
    expect(adItem.isAd).toBe(true);
  });

  test('getUserFeed — returns nextCursor', async () => {
    const activityDate = new Date('2024-06-01T10:00:00Z');
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mkFeedItem({ activityDate })]),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    const result = await realFeedService.getUserFeed(UID, null, 40);
    expect(result.nextCursor).toBe(activityDate.toISOString());
  });

  test('getUserFeed — applies cursor filter when provided', async () => {
    FeedItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Block.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    Track.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
    await realFeedService.getUserFeed(UID, '2024-01-01', 10);
    const queryArg = FeedItem.find.mock.calls[0][0];
    expect(queryArg.activityDate).toBeDefined();
  });
});

// ─── searchService REAL unit tests ───────────────────────────────────────────
describe('searchService (real)', () => {
  jest.unmock('../services/searchService');
  const realSearchService = jest.requireActual('../services/searchService');

  const mkQueryChain = (data) => ({
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(data),
  });

  beforeEach(() => jest.clearAllMocks());

  test('autocompleteSearch — returns matching tracks and users', async () => {
    Track.find.mockReturnValue({ select: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ title: 'Beat' }]) });
    User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ displayName: 'DJ' }]) });
    const result = await realSearchService.autocompleteSearch('be');
    expect(result.tracks).toHaveLength(1);
    expect(result.users).toHaveLength(1);
  });

  test('performGlobalSearch — returns tracks, users, playlists', async () => {
    Block.find.mockResolvedValue([]);
    Track.find.mockReturnValue(mkQueryChain([{ title: 'Beat' }]));
    User.find.mockReturnValue(mkQueryChain([{ displayName: 'DJ' }]));
    Playlist.find.mockReturnValue(mkQueryChain([{ title: 'My Set' }]));
    const result = await realSearchService.performGlobalSearch('beat', null, 10, 0, UID);
    expect(result.tracks).toBeDefined();
    expect(result.users).toBeDefined();
    expect(result.playlists).toBeDefined();
  });

  test('performGlobalSearch — applies licenseType filter when provided', async () => {
    Block.find.mockResolvedValue([]);
    Track.find.mockReturnValue(mkQueryChain([]));
    User.find.mockReturnValue(mkQueryChain([]));
    Playlist.find.mockReturnValue(mkQueryChain([]));
    await realSearchService.performGlobalSearch('beat', null, 10, 0, null, { licenseType: 'CC' });
    const trackFilter = Track.find.mock.calls[0][0];
    expect(trackFilter.licenseType).toBe('CC');
  });

  test('performGlobalSearch — handles unauthenticated user (no block check)', async () => {
    Track.find.mockReturnValue(mkQueryChain([]));
    User.find.mockReturnValue(mkQueryChain([]));
    Playlist.find.mockReturnValue(mkQueryChain([]));
    await realSearchService.performGlobalSearch('beat', null, 10, 0, null);
    expect(Block.find).not.toHaveBeenCalled();
  });
});

// ─── discoveryService REAL unit tests ────────────────────────────────────────
describe('discoveryService (real)', () => {
  jest.unmock('../services/discoveryService');
  const realDiscoveryService = jest.requireActual('../services/discoveryService');

  const mkTrackChain = (data) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    allowDiskUse: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(data),
  });

  const mkTrackFind = (data) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue(data),
  });

  beforeEach(() => jest.clearAllMocks());

  test('getTrendingTracks — returns from cache when hit', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ key: 'trending_all_20', data: [{ title: 'Cached' }] }) });
    const result = await realDiscoveryService.getTrendingTracks(20, null);
    expect(result).toEqual([{ title: 'Cached' }]);
    expect(Track.find).not.toHaveBeenCalled();
  });

  test('getTrendingTracks — fetches from DB on cache miss and saves cache', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkTrackChain([{ title: 'Trending' }]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    const result = await realDiscoveryService.getTrendingTracks(20, null);
    expect(result).toEqual([{ title: 'Trending' }]);
    expect(Cache.findOneAndUpdate).toHaveBeenCalled();
  });

  test('getTrendingTracks — filters by genre', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkTrackChain([]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    await realDiscoveryService.getTrendingTracks(20, 'Electronic');
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Electronic' }));
  });

  test('getTrendingTracks — handles invalid limit with safe default', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkTrackChain([]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    await realDiscoveryService.getTrendingTracks('invalid', null);
    // Should not throw; uses default of 20
    expect(Track.find).toHaveBeenCalled();
  });

  test('getTrendingTracks — ignores cache duplicate key error gracefully', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkTrackChain([{ title: 'T' }]));
    const dupErr = new Error('dup'); dupErr.code = 11000;
    Cache.findOneAndUpdate.mockRejectedValue(dupErr);
    const result = await realDiscoveryService.getTrendingTracks(20, null);
    expect(result).toEqual([{ title: 'T' }]);
  });

  test('getRecommendedBasedOnLikes — returns liked-genre tracks', async () => {
    Interaction.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([{ targetId: { genre: 'Electronic', _id: TID } }]),
    });
    Track.find.mockReturnValue(mkTrackFind([{ title: 'Electronic Beat' }]));
    const result = await realDiscoveryService.getRecommendedBasedOnLikes(UID);
    expect(result).toBeDefined();
  });

  test('getRecommendedBasedOnLikes — falls back to trending when no liked genres', async () => {
    Interaction.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    });
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkTrackChain([]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    await realDiscoveryService.getRecommendedBasedOnLikes(UID);
    // Should call getTrendingTracks as fallback
    expect(Track.find).toHaveBeenCalled();
  });

  test('getStationByGenre — returns tracks for genre', async () => {
    Track.find.mockReturnValue(mkTrackFind([{ title: 'House Track' }]));
    const result = await realDiscoveryService.getStationByGenre('Electronic');
    expect(result).toHaveLength(1);
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Electronic' }));
  });

  test('getStationByArtist — returns tracks by artist', async () => {
    Track.find.mockReturnValue(mkTrackFind([{ title: 'Artist Track' }]));
    const result = await realDiscoveryService.getStationByArtist(UID);
    expect(result).toHaveLength(1);
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ artist: UID }));
  });

  test('getUsersWhoLikedAlsoLiked — returns recommended tracks', async () => {
    Interaction.find.mockResolvedValueOnce([{ actorId: 'user2' }]);
    Interaction.find.mockReturnValueOnce({
      populate: jest.fn().mockResolvedValue([{
        targetId: { _id: 'other-track', isPublic: true, moderationStatus: 'Approved', toString: () => 'other-track', artist: {} },
      }]),
    });
    const result = await realDiscoveryService.getUsersWhoLikedAlsoLiked(TID);
    expect(Array.isArray(result)).toBe(true);
  });

  test('getUsersWhoLikedAlsoLiked — returns empty array when no users liked the track', async () => {
    Interaction.find.mockResolvedValueOnce([]);
    const result = await realDiscoveryService.getUsersWhoLikedAlsoLiked(TID);
    expect(result).toEqual([]);
  });

  test('getMoreOfWhatYouLike — returns likes-based result with metadata', async () => {
    Interaction.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([{ targetId: { genre: 'Jazz' } }]),
    });
    // Mock getRecommendedBasedOnLikes path
    Interaction.find.mockImplementation(() => ({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([{ targetId: { genre: 'Jazz', _id: TID } }]),
    }));
    Track.find.mockReturnValue(mkTrackFind([{ title: 'Jazz Track' }]));
    const result = await realDiscoveryService.getMoreOfWhatYouLike(UID);
    expect(result.basedOn).toBeDefined();
    expect(Array.isArray(result.tracks)).toBe(true);
  });
});
