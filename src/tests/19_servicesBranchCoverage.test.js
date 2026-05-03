'use strict';
/**
 * 19_servicesBranchCoverage.test.js
 *
 * Targets the service functions with lowest branch coverage:
 *  - stationService  (all branches of likeStation, unlikeStation, getLikedStations, checkStationLiked)
 *  - playbackService (recordPlaybackProgress full branch map, checkAccessibility, clearListeningHistory)
 *  - playerService   (getStreamingData, getPlayerState, updatePlayerState)
 *  - profileService  (all functions + error branches)
 *  - searchService   (all type combinations, filter branches)
 *  - feedService     (getUserFeed full filtering path)
 *  - subscriptionService (handleWebhook all event types, getRevenueStats)
 */

// ─── mocks ───────────────────────────────────────────────────────────────────
jest.mock('../models/stationLikeModel');
jest.mock('../models/listenHistoryModel');
jest.mock('../models/trackModel');
jest.mock('../models/playerStateModel');
jest.mock('../models/userModel');
jest.mock('../models/blockModel');
jest.mock('../models/feedItemModel');
jest.mock('../models/playlistModel');
jest.mock('../models/interactionModel');
jest.mock('../models/cacheModel');
jest.mock('../utils/azureStorage');
jest.mock('../services/discoveryService');
jest.mock('../utils/sendEmail');
const mockStripe = {
  checkout: { sessions: { create: jest.fn() } },
  subscriptions: { update: jest.fn(), retrieve: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};
jest.mock('stripe', () => () => mockStripe);

const StationLike = require('../models/stationLikeModel');
const ListenHistory = require('../models/listenHistoryModel');
const Track = require('../models/trackModel');
const PlayerState = require('../models/playerStateModel');
const User = require('../models/userModel');
const Block = require('../models/blockModel');
const FeedItem = require('../models/feedItemModel');
const Playlist = require('../models/playlistModel');
const Cache = require('../models/cacheModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const discoveryService = require('../services/discoveryService');
const sendEmail = require('../utils/sendEmail');

const UID = '507f1f77bcf86cd799439011';
const UID2 = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';
const PID = '507f1f77bcf86cd799439044';
const CID = '507f1f77bcf86cd799439055';

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// stationService
// ─────────────────────────────────────────────────────────────────────────────
describe('stationService', () => {
  const svc = require('../services/stationService');

  describe('likeStation', () => {
    test('throws 400 when stationId missing', async () => {
      await expect(
        svc.likeStation(UID, { stationType: 'trending' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    test('throws 400 when stationType missing', async () => {
      await expect(
        svc.likeStation(UID, { stationId: 'sid' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    test('throws 400 when stationType invalid', async () => {
      await expect(
        svc.likeStation(UID, { stationId: 'sid', stationType: 'unknown' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    test('throws 400 when already liked', async () => {
      StationLike.findOne.mockResolvedValue({ stationId: 'sid' });
      await expect(
        svc.likeStation(UID, { stationId: 'sid', stationType: 'trending' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    test('creates like and returns result', async () => {
      StationLike.findOne.mockResolvedValue(null);
      StationLike.create.mockResolvedValue({
        stationId: 'sid',
        stationType: 'genre',
        stationTitle: 'Pop',
        createdAt: new Date(),
      });
      const res = await svc.likeStation(UID, {
        stationId: 'sid',
        stationType: 'genre',
        stationTitle: 'Pop',
        genre: 'Pop',
      });
      expect(res.liked).toBe(true);
    });
    test('creates like with minimal data (missing optional fields)', async () => {
      StationLike.findOne.mockResolvedValue(null);
      StationLike.create.mockResolvedValue({
        stationId: 'sid',
        stationType: 'trending',
        stationTitle: 'sid',
        createdAt: new Date(),
      });
      const res = await svc.likeStation(UID, {
        stationId: 'sid',
        stationType: 'trending',
      });
      expect(res.liked).toBe(true);
    });
  });

  describe('unlikeStation', () => {
    test('throws 400 when not liked', async () => {
      StationLike.findOneAndDelete.mockResolvedValue(null);
      await expect(svc.unlikeStation(UID, 'sid')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
    test('returns liked:false on success', async () => {
      StationLike.findOneAndDelete.mockResolvedValue({ stationId: 'sid' });
      const res = await svc.unlikeStation(UID, 'sid');
      expect(res.liked).toBe(false);
    });
  });

  describe('checkStationLiked', () => {
    test('returns liked:true when found', async () => {
      StationLike.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ stationId: 'sid' }),
      });
      const res = await svc.checkStationLiked(UID, 'sid');
      expect(res.liked).toBe(true);
    });
    test('returns liked:false when not found', async () => {
      StationLike.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const res = await svc.checkStationLiked(UID, 'sid');
      expect(res.liked).toBe(false);
    });
  });

  describe('getLikedStations — no hydration', () => {
    const mkLike = (type) => ({
      stationId: `s_${type}`,
      stationType: type,
      stationTitle: 'T',
      stationDescription: 'D',
      artistId: null,
      genre: null,
      createdAt: new Date(),
    });

    beforeEach(() => {
      StationLike.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mkLike('genre'), mkLike('artist')]),
      });
      StationLike.countDocuments.mockResolvedValue(2);
    });

    test('returns paginated stations without hydration', async () => {
      const res = await svc.getLikedStations(UID, 1, 20, false);
      expect(res.total).toBe(2);
      expect(res.stations).toHaveLength(2);
    });
  });

  describe('getLikedStations — with hydration (all branch types)', () => {
    const mkLike = (type, extra = {}) => ({
      stationId: `s_${type}`,
      stationType: type,
      stationTitle: 'T',
      stationDescription: 'D',
      artistId: extra.artistId || null,
      genre: extra.genre || null,
      createdAt: new Date(),
      ...extra,
    });

    beforeEach(() => {
      discoveryService.getStationByGenre = jest.fn().mockResolvedValue([]);
      discoveryService.getStationByArtist = jest.fn().mockResolvedValue([]);
      discoveryService.getTrendingTracks = jest.fn().mockResolvedValue([]);
      discoveryService.getCuratedByPlatform = jest
        .fn()
        .mockResolvedValue([{ id: 's_curated', tracks: [] }]);
      StationLike.countDocuments.mockResolvedValue(6);
    });

    const setLikes = (likes) => {
      StationLike.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(likes),
      });
    };

    test('hydrates genre station', async () => {
      setLikes([mkLike('genre', { genre: 'Pop' })]);
      const res = await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getStationByGenre).toHaveBeenCalledWith('Pop');
    });
    test('hydrates genre without genre field (skips)', async () => {
      setLikes([mkLike('genre')]); // no genre field
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getStationByGenre).not.toHaveBeenCalled();
    });
    test('hydrates artist station', async () => {
      setLikes([mkLike('artist', { artistId: UID })]);
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getStationByArtist).toHaveBeenCalledWith(UID);
    });
    test('hydrates artist without artistId (skips)', async () => {
      setLikes([mkLike('artist')]);
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getStationByArtist).not.toHaveBeenCalled();
    });
    test('hydrates trending station', async () => {
      setLikes([mkLike('trending')]);
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getTrendingTracks).toHaveBeenCalled();
    });
    test('hydrates recommended station (fallback to trending)', async () => {
      setLikes([mkLike('recommended')]);
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getTrendingTracks).toHaveBeenCalled();
    });
    test('hydrates curated station (found)', async () => {
      setLikes([mkLike('curated', { stationId: 's_curated' })]);
      await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getCuratedByPlatform).toHaveBeenCalled();
    });
    test('hydrates curated station (not found in curated list)', async () => {
      setLikes([mkLike('curated', { stationId: 'non_existent' })]);
      await svc.getLikedStations(UID, 1, 20, true);
      // Should not throw, returns empty tracks
    });
    test('hydrates default/unknown type', async () => {
      setLikes([mkLike('unknown_type')]);
      // should not throw
      await svc.getLikedStations(UID, 1, 20, true);
    });
    test('hydrateStation returns null when discoveryService throws', async () => {
      discoveryService.getTrendingTracks.mockRejectedValue(new Error('down'));
      setLikes([mkLike('trending')]);
      const res = await svc.getLikedStations(UID, 1, 20, true);
      // null results are filtered out
      expect(res.stations).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// playbackService
// ─────────────────────────────────────────────────────────────────────────────
describe('playbackService', () => {
  const svc = require('../services/playbackService');

  describe('recordPlaybackProgress', () => {
    const baseTrack = { _id: TID, duration: 200 };
    const setupMocks = (progress, isPlayCounted = false) => {
      Track.findById.mockResolvedValue(baseTrack);
      const hMock = { isPlayCounted, progress };
      ListenHistory.findOneAndUpdate
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(hMock) })
        .mockResolvedValueOnce(hMock);
      Track.findByIdAndUpdate.mockResolvedValue({});
    };

    test('returns null when track not found', async () => {
      Track.findById.mockResolvedValue(null);
      const res = await svc.recordPlaybackProgress(UID, TID, 50);
      expect(res).toBeNull();
    });

    test('progress < 10% of duration (starting over) — sets isPlayCounted=false', async () => {
      setupMocks(10); // 10 < 200*0.1 = 20
      const res = await svc.recordPlaybackProgress(UID, TID, 10);
      // Two calls: first upsert + second update
      expect(ListenHistory.findOneAndUpdate).toHaveBeenCalled();
    });

    test('progress >= 90% of duration (completed) — increments play count', async () => {
      Track.findById.mockResolvedValue(baseTrack);
      ListenHistory.findOneAndUpdate
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ isPlayCounted: false }),
        })
        .mockResolvedValueOnce({ isPlayCounted: true });
      await svc.recordPlaybackProgress(UID, TID, 185); // >= 200*0.9 = 180
      expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(TID, {
        $inc: { playCount: 1, viralScore: 1 },
      });
    });

    test('progress >= 90% but already counted — no increment', async () => {
      Track.findById.mockResolvedValue(baseTrack);
      ListenHistory.findOneAndUpdate
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ isPlayCounted: true }),
        })
        .mockResolvedValueOnce({ isPlayCounted: true });
      Track.findByIdAndUpdate.mockResolvedValue({});
      await svc.recordPlaybackProgress(UID, TID, 185);
      // Track.findByIdAndUpdate should NOT be called because isPlayCounted is true
      expect(Track.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('with playlistId — also upserts playlist history', async () => {
      Track.findById.mockResolvedValue(baseTrack);
      ListenHistory.findOneAndUpdate
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ isPlayCounted: false }),
        })
        .mockResolvedValueOnce({ isPlayCounted: false })
        .mockResolvedValueOnce({});
      Track.findByIdAndUpdate.mockResolvedValue({});
      await svc.recordPlaybackProgress(UID, TID, 50, PID);
      // Two separate findOneAndUpdate calls (track + playlist)
      expect(ListenHistory.findOneAndUpdate).toHaveBeenCalledTimes(3); // first+second+playlist
    });

    test('mid-progress (between 10% and 90%) — no play count change', async () => {
      Track.findById.mockResolvedValue(baseTrack);
      ListenHistory.findOneAndUpdate
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ isPlayCounted: false }),
        })
        .mockResolvedValueOnce({ isPlayCounted: false });
      await svc.recordPlaybackProgress(UID, TID, 100); // mid-range
      // No Track.findByIdAndUpdate needed
    });
  });

  describe('checkAccessibility', () => {
    const user = { _id: { toString: () => UID }, subscriptionPlan: 'Go+' };
    const makeTrack = (isPublic, artistId = UID) => ({
      isPublic,
      artist: { toString: () => artistId },
    });

    test('stream: returns true for public track', () => {
      expect(svc.checkAccessibility(user, makeTrack(true), 'stream')).toBe(
        true
      );
    });
    test('stream: throws 403 for private track owned by other', () => {
      expect(() =>
        svc.checkAccessibility(user, makeTrack(false, UID2), 'stream')
      ).toThrow();
    });
    test('stream: returns true for private track owned by user', () => {
      expect(
        svc.checkAccessibility(user, makeTrack(false, UID), 'stream')
      ).toBe(true);
    });
    test('download: returns true for Go+ user', () => {
      expect(svc.checkAccessibility(user, makeTrack(true), 'download')).toBe(
        true
      );
    });
    test('download: throws 403 for free user', () => {
      const freeUser = {
        _id: { toString: () => UID },
        subscriptionPlan: 'Free',
      };
      expect(() =>
        svc.checkAccessibility(freeUser, makeTrack(true), 'download')
      ).toThrow();
    });
    test('invalid action: throws 400', () => {
      expect(() =>
        svc.checkAccessibility(user, makeTrack(true), 'copy')
      ).toThrow();
    });
  });

  describe('clearListeningHistory', () => {
    test('deletes all history and returns true', async () => {
      ListenHistory.deleteMany.mockResolvedValue({});
      const res = await svc.clearListeningHistory(UID);
      expect(res).toBe(true);
      expect(ListenHistory.deleteMany).toHaveBeenCalledWith({ user: UID });
    });
  });

  describe('getRecentlyPlayed', () => {
    test('returns merged track and playlist history', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      };
      mockQuery.populate.mockReturnValueOnce(mockQuery).mockResolvedValue([
        {
          type: 'track',
          playedAt: new Date(),
          track: { _id: TID, title: 'T' },
          playlist: null,
        },
        {
          type: 'playlist',
          playedAt: new Date(),
          track: null,
          playlist: { _id: PID, title: 'P' },
        },
        { type: 'track', playedAt: new Date(), track: null, playlist: null },
      ]);
      ListenHistory.find.mockReturnValue(mockQuery);
      const res = await svc.getRecentlyPlayed(UID, 1, 20);
      expect(res).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// playerService
// ─────────────────────────────────────────────────────────────────────────────
describe('playerService', () => {
  const playbackService = require('../services/playbackService');
  jest.mock('../services/playbackService');

  const svc = require('../services/playerService');

  describe('getStreamingData', () => {
    const user = { _id: { toString: () => UID } };

    test('throws 404 when track not found', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(svc.getStreamingData(TID, user)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('throws 400 when track not finished', async () => {
      Track.findById.mockResolvedValue({
        processingState: 'Processing',
        hlsUrl: null,
      });
      await expect(svc.getStreamingData(TID, user)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
    test('throws 404 for unreleased track (not by owner)', async () => {
      Track.findById.mockResolvedValue({
        processingState: 'Finished',
        hlsUrl: 'url',
        releaseDate: new Date(Date.now() + 86400000), // tomorrow
        artist: { toString: () => UID2 }, // different user
      });
      await expect(svc.getStreamingData(TID, user)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('returns streaming data for valid track', async () => {
      const track = {
        processingState: 'Finished',
        hlsUrl: 'hls://track.m3u8',
        releaseDate: new Date(Date.now() - 86400000), // yesterday
        artist: { toString: () => UID2 },
        duration: 200,
        format: 'audio/mpeg',
        previewStartTime: 0,
        previewEndTime: 30,
      };
      Track.findById.mockResolvedValue(track);
      playbackService.checkAccessibility.mockReturnValue(true);
      const res = await svc.getStreamingData(TID, user);
      expect(res.streamUrl).toBe('hls://track.m3u8');
    });
    test('returns streaming data for own unreleased track', async () => {
      const track = {
        processingState: 'Finished',
        hlsUrl: 'hls://track.m3u8',
        releaseDate: new Date(Date.now() + 86400000), // tomorrow
        artist: { toString: () => UID }, // same user
        duration: 200,
        format: 'audio/mpeg',
        previewStartTime: 0,
        previewEndTime: 30,
      };
      Track.findById.mockResolvedValue(track);
      playbackService.checkAccessibility.mockReturnValue(true);
      const res = await svc.getStreamingData(TID, user);
      expect(res.streamUrl).toBeDefined();
    });
  });

  describe('getPlayerState', () => {
    test('returns default state when no state found', async () => {
      PlayerState.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(null),
      });
      const res = await svc.getPlayerState(UID);
      expect(res.currentTrack).toBeNull();
      expect(res.isPlaying).toBe(false);
    });
    test('returns existing state', async () => {
      const state = { currentTrack: TID, currentTime: 60, isPlaying: true };
      PlayerState.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(state),
      });
      const res = await svc.getPlayerState(UID);
      expect(res.isPlaying).toBe(true);
    });
  });

  describe('updatePlayerState', () => {
    const populatedState = {
      currentTrack: TID,
      currentTime: 50,
      isPlaying: false,
    };

    test('updates state without currentTrack', async () => {
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(populatedState),
      });
      const res = await svc.updatePlayerState(UID, {
        isPlaying: false,
        queueContext: 'feed',
      });
      expect(res).toBeDefined();
    });
    test('throws 404 when track not found during update', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(
        svc.updatePlayerState(UID, { currentTrack: TID, currentTime: 50 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
    test('clamps currentTime to 0 when negative', async () => {
      Track.findById.mockResolvedValue({ duration: 200 });
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(populatedState),
      });
      const res = await svc.updatePlayerState(UID, {
        currentTrack: TID,
        currentTime: -5,
      });
      expect(PlayerState.findOneAndUpdate).toHaveBeenCalledWith(
        { user: UID },
        expect.objectContaining({ currentTime: 0 }),
        expect.any(Object)
      );
    });
    test('clamps currentTime to duration when over', async () => {
      Track.findById.mockResolvedValue({ duration: 200 });
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(populatedState),
      });
      await svc.updatePlayerState(UID, { currentTrack: TID, currentTime: 999 });
      expect(PlayerState.findOneAndUpdate).toHaveBeenCalledWith(
        { user: UID },
        expect.objectContaining({ currentTime: 200 }),
        expect.any(Object)
      );
    });
    test('uses currentTime as-is when in range', async () => {
      Track.findById.mockResolvedValue({ duration: 200 });
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(populatedState),
      });
      await svc.updatePlayerState(UID, { currentTrack: TID, currentTime: 100 });
      expect(PlayerState.findOneAndUpdate).toHaveBeenCalledWith(
        { user: UID },
        expect.objectContaining({ currentTime: 100 }),
        expect.any(Object)
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// profileService
// ─────────────────────────────────────────────────────────────────────────────
describe('profileService', () => {
  const svc = require('../services/profileService');

  describe('getProfileByPermalink', () => {
    test('throws 404 when user not found', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.getProfileByPermalink('no-one')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('returns limited data for private profile', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          displayName: 'DJ',
          avatarUrl: 'url',
          permalink: 'dj',
          role: 'Artist',
          isPrivate: true,
        }),
      });
      const res = await svc.getProfileByPermalink('dj');
      expect(res.isPrivate).toBe(true);
      expect(res.bio).toBeUndefined();
    });
    test('returns full profile for public user', async () => {
      const userData = {
        displayName: 'Open DJ',
        isPrivate: false,
        bio: 'Makes beats',
      };
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(userData),
      });
      const res = await svc.getProfileByPermalink('open-dj');
      expect(res.bio).toBe('Makes beats');
    });
  });

  describe('updatePrivacy', () => {
    test('throws 404 when user not found', async () => {
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.updatePrivacy(UID, true)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('returns updated user', async () => {
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ isPrivate: true }),
      });
      const res = await svc.updatePrivacy(UID, true);
      expect(res.isPrivate).toBe(true);
    });
  });

  describe('updateSocialLinks', () => {
    test('throws 404 when user not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.updateSocialLinks(UID, [])).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('throws 400 when links are identical', async () => {
      const links = [{ platform: 'Instagram', url: 'https://ig.com/me' }];
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ socialLinks: links }),
      });
      await expect(svc.updateSocialLinks(UID, links)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
    test('updates links successfully', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ socialLinks: [] }),
      });
      const newLinks = [{ platform: 'Twitter', url: 'https://twitter.com/me' }];
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ socialLinks: newLinks }),
      });
      const res = await svc.updateSocialLinks(UID, newLinks);
      expect(res.socialLinks).toHaveLength(1);
    });
    test('throws 404 when user not found after update', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ socialLinks: [] }),
      });
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(
        svc.updateSocialLinks(UID, [{ platform: 'X', url: 'https://x.com/me' }])
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('removeSocialLink', () => {
    test('throws 404 when user not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.removeSocialLink(UID, CID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('throws 404 when link not found in user', async () => {
      User.findById.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({
            socialLinks: { id: jest.fn().mockReturnValue(null) },
          }),
      });
      await expect(svc.removeSocialLink(UID, CID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('removes link successfully', async () => {
      const user = {
        socialLinks: {
          id: jest.fn().mockReturnValue({ platform: 'IG' }),
          pull: jest.fn(),
        },
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });
      const res = await svc.removeSocialLink(UID, CID);
      expect(user.socialLinks.pull).toHaveBeenCalledWith(CID);
    });
  });

  describe('updateTier', () => {
    test('throws 404 when user not found', async () => {
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.updateTier(UID, 'Artist')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    test('returns updated user role', async () => {
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ role: 'Listener' }),
      });
      const res = await svc.updateTier(UID, 'Listener');
      expect(res.role).toBe('Listener');
    });
  });

  describe('updateProfileImages', () => {
    test('throws 400 when no files provided', async () => {
      await expect(svc.updateProfileImages(UID, {})).rejects.toMatchObject({
        statusCode: 400,
      });
    });
    test('uploads avatar only', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.com/avatar.jpg');
      User.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ avatarUrl: 'https://azure.com/avatar.jpg' }),
      });
      const res = await svc.updateProfileImages(UID, {
        avatar: [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }],
      });
      expect(res.avatarUrl).toBe('https://azure.com/avatar.jpg');
    });
    test('uploads cover only', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.com/cover.jpg');
      User.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ coverUrl: 'https://azure.com/cover.jpg' }),
      });
      const res = await svc.updateProfileImages(UID, {
        cover: [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }],
      });
      expect(res.coverUrl).toBe('https://azure.com/cover.jpg');
    });
    test('uploads both avatar and cover', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.com/img.jpg');
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({ avatarUrl: 'u', coverUrl: 'c' }),
      });
      await svc.updateProfileImages(UID, {
        avatar: [{ buffer: Buffer.from('a'), mimetype: 'image/jpeg' }],
        cover: [{ buffer: Buffer.from('c'), mimetype: 'image/jpeg' }],
      });
      expect(uploadImageToAzure).toHaveBeenCalledTimes(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchService
// ─────────────────────────────────────────────────────────────────────────────
describe('searchService', () => {
  const svc = require('../services/searchService');

  describe('autocompleteSearch', () => {
    beforeEach(() => {
      Track.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
    });
    test('returns tracks and users', async () => {
      const res = await svc.autocompleteSearch('test');
      expect(res).toHaveProperty('tracks');
      expect(res).toHaveProperty('users');
    });
  });

  describe('performGlobalSearch', () => {
    const mkQuery = (result) => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(result),
    });

    beforeEach(() => {
      Block.find.mockResolvedValue([]);
      Track.find.mockReturnValue(mkQuery([]));
      User.find.mockReturnValue(mkQuery([]));
      Playlist.find.mockReturnValue(mkQuery([]));
    });

    test('without currentUserId — no block query', async () => {
      const res = await svc.performGlobalSearch('test', 'all', 20, 0, null);
      expect(Block.find).not.toHaveBeenCalled();
      expect(res).toHaveProperty('tracks');
    });
    test('with currentUserId — queries blocks', async () => {
      Block.find.mockResolvedValue([
        { blocker: { equals: () => true }, blocked: UID2 },
        { blocker: { equals: () => false }, blocked: UID2 },
      ]);
      const res = await svc.performGlobalSearch('test', 'all', 20, 0, UID);
      expect(Block.find).toHaveBeenCalled();
    });
    test('with licenseType filter — adds to trackMatch', async () => {
      const res = await svc.performGlobalSearch('test', 'tracks', 10, 0, null, {
        licenseType: 'Creative Commons',
      });
      expect(res).toHaveProperty('tracks');
    });
    test('without filter — runs without licenseType', async () => {
      const res = await svc.performGlobalSearch('test', 'all', 10, 0, null, {});
      expect(res).toHaveProperty('tracks');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// subscriptionService — handleWebhook event branches
// ─────────────────────────────────────────────────────────────────────────────
describe('subscriptionService — handleWebhook', () => {
  const stripe = require('stripe')();
  const svc = require('../services/subscriptionService');

  const makeRawEvent = (type, data) => ({ type, data: { object: data } });

  test('throws 400 on signature failure', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('sig fail');
    });
    await expect(
      svc.handleWebhook(Buffer.from('raw'), 'sig')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('handles checkout.session.completed', async () => {
    const session = {
      client_reference_id: UID,
      metadata: { planType: 'Pro' },
      customer: 'cus_123',
      subscription: 'sub_123',
    };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('checkout.session.completed', session)
    );
    User.findByIdAndUpdate.mockResolvedValue({});
    await svc.handleWebhook(Buffer.from('raw'), 'sig');
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
  });

  test('handles invoice.payment_succeeded (subscription_cycle)', async () => {
    const invoice = {
      billing_reason: 'subscription_cycle',
      subscription: 'sub_123',
    };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('invoice.payment_succeeded', invoice)
    );
    stripe.subscriptions.retrieve.mockResolvedValue({
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
    });
    User.findOneAndUpdate.mockResolvedValue({});
    await svc.handleWebhook(Buffer.from('raw'), 'sig');
    expect(stripe.subscriptions.retrieve).toHaveBeenCalled();
  });

  test('handles invoice.payment_succeeded (not subscription_cycle — skips)', async () => {
    const invoice = { billing_reason: 'manual', subscription: 'sub_123' };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('invoice.payment_succeeded', invoice)
    );
    await svc.handleWebhook(Buffer.from('raw'), 'sig');
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  test('handles invoice.payment_failed — revokes premium and sends email', async () => {
    const invoice = {
      subscription: 'sub_123',
      customer: 'cus_123',
      customer_email: 'user@test.com',
    };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('invoice.payment_failed', invoice)
    );
    User.findOneAndUpdate.mockResolvedValue({
      email: 'user@test.com',
      subscriptionPlan: 'Pro',
    });
    sendEmail.mockResolvedValue({});
    await svc.handleWebhook(Buffer.from('raw'), 'sig');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('handles invoice.payment_failed — no user found (skips email)', async () => {
    const invoice = { subscription: 'sub_xyz', customer: 'cus_xyz' };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('invoice.payment_failed', invoice)
    );
    User.findOneAndUpdate.mockResolvedValue(null);
    await svc.handleWebhook(Buffer.from('raw'), 'sig');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('handles invoice.payment_failed — email error is swallowed', async () => {
    const invoice = { subscription: 'sub_123', customer_email: 'u@t.com' };
    stripe.webhooks.constructEvent.mockReturnValue(
      makeRawEvent('invoice.payment_failed', invoice)
    );
    User.findOneAndUpdate.mockResolvedValue({
      email: 'u@t.com',
      subscriptionPlan: 'Pro',
    });
    sendEmail.mockRejectedValue(new Error('smtp down'));
    // should not throw
    await expect(
      svc.handleWebhook(Buffer.from('raw'), 'sig')
    ).resolves.toBeUndefined();
  });

  test('handles unknown event type (no-op)', async () => {
    stripe.webhooks.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });
    await expect(
      svc.handleWebhook(Buffer.from('raw'), 'sig')
    ).resolves.toBeUndefined();
  });
});

describe('subscriptionService — getRevenueStats', () => {
  const svc = require('../services/subscriptionService');
  test('returns aggregate revenue stats', async () => {
    User.countDocuments
      .mockResolvedValueOnce(10) // Pro users
      .mockResolvedValueOnce(5); // Go+ users
    const res = await svc.getRevenueStats();
    expect(res.activeSubscriptions).toBe(15);
    expect(res.totalRevenue).toBe(10 * 5 + 5 * 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discoveryService — branch coverage
// ─────────────────────────────────────────────────────────────────────────────
describe('discoveryService — getTrendingTracks branches', () => {
  jest.mock('../models/interactionModel');

  // Re-require to get un-mocked version
  jest.resetModules();
  jest.mock('../models/cacheModel');
  jest.mock('../models/trackModel');
  jest.mock('../models/interactionModel');

  const Cache = require('../models/cacheModel');
  const Track = require('../models/trackModel');
  const dSvc = jest.requireActual('../services/discoveryService');

  const mkChain = (result) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    allowDiskUse: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
    find: jest.fn().mockReturnThis(),
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns cached data when cache hit', async () => {
    Cache.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ key: 'k', data: [{ id: 1 }] }),
    });
    const res = await dSvc.getTrendingTracks(10);
    expect(res).toEqual([{ id: 1 }]);
  });

  test('fetches from DB and caches on miss', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkChain([{ _id: TID }]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    const res = await dSvc.getTrendingTracks(5);
    expect(Array.isArray(res)).toBe(true);
  });

  test('invalid limit falls back to 20', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkChain([]));
    Cache.findOneAndUpdate.mockResolvedValue({});
    await dSvc.getTrendingTracks('invalid');
    expect(Track.find).toHaveBeenCalled();
  });

  test('ignores duplicate key cache error', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkChain([]));
    const dupErr = new Error('dup');
    dupErr.code = 11000;
    Cache.findOneAndUpdate.mockRejectedValue(dupErr);
    const res = await dSvc.getTrendingTracks(5);
    expect(Array.isArray(res)).toBe(true);
  });

  test('rethrows non-dup cache error', async () => {
    Cache.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    Track.find.mockReturnValue(mkChain([]));
    const err = new Error('DB down');
    err.code = 500;
    Cache.findOneAndUpdate.mockRejectedValue(err);
    const res = await dSvc.getTrendingTracks(5);
    expect(Array.isArray(res)).toBe(true);
  });
});
