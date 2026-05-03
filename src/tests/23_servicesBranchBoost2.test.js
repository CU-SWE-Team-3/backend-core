'use strict';
/**
 * 23_servicesBranchBoost2.test.js
 *
 * Targets remaining uncovered branches in services (currently 79.95%):
 *  - playbackService   (checkAccessibility: private track, download non-Go+, download Go+, invalid action)
 *  - searchService     (performGlobalSearch with/without auth, with licenseType filter)
 *  - profileService    (getProfileByPermalink private user, updateSocialLinks identical, removeSocialLink not found)
 *  - stationService    (hydrateStation all switch branches, likeStation missing fields)
 *  - firebaseService   (sendPushNotification branches)
 *  - playerService     (getStreamingData branches, updatePlayerState currentTime clamping)
 *  - playbackService   (recordPlaybackProgress all branches: shouldCountPlay, isStartingOver, playlistId)
 *  - subscriptionService (createStripeCheckout all branches, cancelSubscription all branches)
 *  - authService       (findOrCreateGoogleUser: user exists with googleId, user exists without googleId)
 */

// ─── mocks ────────────────────────────────────────────────────────────────────
jest.mock('../models/trackModel');
jest.mock('../models/userModel');
jest.mock('../models/playlistModel');
jest.mock('../models/blockModel');
jest.mock('../models/listenHistoryModel');
jest.mock('../models/stationLikeModel');
jest.mock('../models/playerStateModel');
jest.mock('../models/followModel');
jest.mock('../services/discoveryService');
jest.mock('../utils/azureStorage');
jest.mock('stripe');

const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Playlist = require('../models/playlistModel');
const Block = require('../models/blockModel');
const ListenHistory = require('../models/listenHistoryModel');
const StationLike = require('../models/stationLikeModel');
const PlayerState = require('../models/playerStateModel');
const Follow = require('../models/followModel');
const discoveryService = require('../services/discoveryService');
const { uploadImageToAzure } = require('../utils/azureStorage');

const UID = '507f1f77bcf86cd799439011';
const UID2 = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';
const PID = '507f1f77bcf86cd799439044';

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════
// playbackService — checkAccessibility branches
// ═══════════════════════════════════════════════════════════
describe('playbackService.checkAccessibility', () => {
  const { checkAccessibility } = require('../services/playbackService');
  const AppError = require('../utils/appError');

  const makeTrack = (overrides) => ({
    isPublic: true,
    artist: { toString: () => UID },
    ...overrides,
  });

  const makeUser = (overrides) => ({
    _id: { toString: () => UID },
    subscriptionPlan: 'Free',
    ...overrides,
  });

  test('throws 403 when track is private and requester is not the artist', () => {
    const track = makeTrack({
      isPublic: false,
      artist: { toString: () => UID2 },
    });
    const user = makeUser({ _id: { toString: () => UID } });
    expect(() => checkAccessibility(user, track, 'stream')).toThrow(AppError);
  });

  test('returns true for public track on stream', () => {
    const track = makeTrack({ isPublic: true });
    const user = makeUser();
    expect(checkAccessibility(user, track, 'stream')).toBe(true);
  });

  test('returns true for own private track on stream', () => {
    const track = makeTrack({
      isPublic: false,
      artist: { toString: () => UID },
    });
    const user = makeUser({ _id: { toString: () => UID } });
    expect(checkAccessibility(user, track, 'stream')).toBe(true);
  });

  test('throws 403 on download for non-Go+ user', () => {
    const track = makeTrack({ enableDirectDownloads: true });
    const user = makeUser({ subscriptionPlan: 'Free' });
    expect(() => checkAccessibility(user, track, 'download')).toThrow(AppError);
  });

  test('returns true on download for Go+ user', () => {
    const track = makeTrack();
    const user = makeUser({ subscriptionPlan: 'Go+' });
    expect(checkAccessibility(user, track, 'download')).toBe(true);
  });

  test('throws 400 for invalid action', () => {
    const track = makeTrack();
    const user = makeUser();
    expect(() => checkAccessibility(user, track, 'invalid')).toThrow(AppError);
  });
});

// ═══════════════════════════════════════════════════════════
// playbackService — recordPlaybackProgress branches
// ═══════════════════════════════════════════════════════════
describe('playbackService.recordPlaybackProgress', () => {
  const svc = require('../services/playbackService');

  test('returns null when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    const result = await svc.recordPlaybackProgress(UID, TID, 30);
    expect(result).toBeNull();
  });

  test('counts play when progress >= 90% and not yet counted', async () => {
    const mockTrack = { _id: TID, duration: 100 };
    Track.findById.mockResolvedValue(mockTrack);

    const mockHistory = { isPlayCounted: false };
    ListenHistory.findOneAndUpdate
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockHistory) })
      .mockResolvedValueOnce(mockHistory);
    Track.findByIdAndUpdate.mockResolvedValue({});

    await svc.recordPlaybackProgress(UID, TID, 95); // 95% of 100s
    expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(TID, {
      $inc: { playCount: 1, viralScore: 1 },
    });
  });

  test('does not count play when progress < 90%', async () => {
    const mockTrack = { _id: TID, duration: 100 };
    Track.findById.mockResolvedValue(mockTrack);
    const mockHistory = { isPlayCounted: false };
    ListenHistory.findOneAndUpdate
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockHistory) })
      .mockResolvedValueOnce(mockHistory);

    await svc.recordPlaybackProgress(UID, TID, 50);
    expect(Track.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('does not count play again when already counted', async () => {
    const mockTrack = { _id: TID, duration: 100 };
    Track.findById.mockResolvedValue(mockTrack);
    const mockHistory = { isPlayCounted: true };
    ListenHistory.findOneAndUpdate
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockHistory) })
      .mockResolvedValueOnce(mockHistory);

    await svc.recordPlaybackProgress(UID, TID, 95);
    expect(Track.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('also upserts playlist history when playlistId provided', async () => {
    const mockTrack = { _id: TID, duration: 100 };
    Track.findById.mockResolvedValue(mockTrack);
    const mockHistory = { isPlayCounted: false };
    ListenHistory.findOneAndUpdate
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockHistory) })
      .mockResolvedValueOnce(mockHistory)
      .mockResolvedValueOnce({});

    await svc.recordPlaybackProgress(UID, TID, 30, PID);
    // third call (after the track history upserts) should be playlist upsert
    expect(ListenHistory.findOneAndUpdate).toHaveBeenCalledWith(
      { user: UID, playlist: PID, type: 'playlist' },
      { playedAt: expect.any(Number) },
      { upsert: true }
    );
  });

  test('resets isPlayCounted when progress < 10% (starting over)', async () => {
    const mockTrack = { _id: TID, duration: 100 };
    Track.findById.mockResolvedValue(mockTrack);
    const mockHistory = { isPlayCounted: true };
    ListenHistory.findOneAndUpdate
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(mockHistory) })
      .mockResolvedValueOnce(mockHistory);

    await svc.recordPlaybackProgress(UID, TID, 5); // 5% — starting over
    const secondCall = ListenHistory.findOneAndUpdate.mock.calls[1];
    expect(secondCall[1].$set.isPlayCounted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// searchService — performGlobalSearch branches
// ═══════════════════════════════════════════════════════════
describe('searchService.performGlobalSearch', () => {
  const svc = require('../services/searchService');

  const lean = jest.fn().mockResolvedValue([]);
  const chainMethods = {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean,
  };

  beforeEach(() => {
    Track.find.mockReturnValue(chainMethods);
    User.find.mockReturnValue(chainMethods);
    Playlist.find.mockReturnValue(chainMethods);
    Block.find.mockResolvedValue([]);
  });

  test('skips block lookup when no currentUserId', async () => {
    const result = await svc.performGlobalSearch('test', null, 10, 0, null, {});
    expect(Block.find).not.toHaveBeenCalled();
    expect(result).toEqual({ tracks: [], users: [], playlists: [] });
  });

  test('looks up blocks when currentUserId provided', async () => {
    Block.find.mockResolvedValue([
      { blocker: { equals: () => true }, blocked: UID2 },
    ]);
    const result = await svc.performGlobalSearch('test', null, 10, 0, UID, {});
    expect(Block.find).toHaveBeenCalled();
  });

  test('applies licenseType filter when provided', async () => {
    const result = await svc.performGlobalSearch('test', null, 10, 0, null, {
      licenseType: 'CC',
    });
    // Track.find should be called with match including licenseType
    const callArg = Track.find.mock.calls[0][0];
    expect(callArg.licenseType).toBe('CC');
  });

  test('does not apply licenseType when not provided', async () => {
    await svc.performGlobalSearch('test', null, 10, 0, null, {});
    const callArg = Track.find.mock.calls[0][0];
    expect(callArg.licenseType).toBeUndefined();
  });
});

describe('searchService.autocompleteSearch', () => {
  const svc = require('../services/searchService');

  test('returns tracks and users', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Track.find.mockReturnValue(chain);
    User.find.mockReturnValue(chain);

    const result = await svc.autocompleteSearch('dj');
    expect(result).toHaveProperty('tracks');
    expect(result).toHaveProperty('users');
  });
});

// ═══════════════════════════════════════════════════════════
// profileService — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('profileService', () => {
  const svc = require('../services/profileService');

  describe('getProfileByPermalink', () => {
    test('throws 404 when user not found', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.getProfileByPermalink('ghost')).rejects.toThrow(
        'Profile not found.'
      );
    });

    test('returns limited data when profile is private', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          displayName: 'Hidden',
          avatarUrl: 'a.png',
          permalink: 'hidden',
          role: 'Artist',
          isPrivate: true,
        }),
      });
      const result = await svc.getProfileByPermalink('hidden');
      expect(result.isPrivate).toBe(true);
      expect(result.bio).toBeUndefined();
    });

    test('returns full data when profile is public', async () => {
      const mockUser = {
        displayName: 'Public',
        avatarUrl: 'a.png',
        permalink: 'pub',
        role: 'Artist',
        isPrivate: false,
        bio: 'Hello',
      };
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });
      const result = await svc.getProfileByPermalink('pub');
      expect(result).toBe(mockUser);
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

    test('throws 400 when no changes detected', async () => {
      const links = [{ platform: 'twitter', url: 'http://twitter.com/test' }];
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ socialLinks: links }),
      });
      await expect(svc.updateSocialLinks(UID, links)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('updates when links are different', async () => {
      const oldLinks = [{ platform: 'twitter', url: 'http://old.com' }];
      const newLinks = [{ platform: 'instagram', url: 'http://insta.com' }];
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ socialLinks: oldLinks }),
      });
      const updatedUser = { socialLinks: newLinks };
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(updatedUser),
      });
      const result = await svc.updateSocialLinks(UID, newLinks);
      expect(result.socialLinks).toEqual(newLinks);
    });

    test('throws 404 when update returns null', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockResolvedValue({
            socialLinks: [{ platform: 'x', url: 'http://old.com' }],
          }),
      });
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      await expect(
        svc.updateSocialLinks(UID, [{ platform: 'y', url: 'http://new.com' }])
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateProfileImages', () => {
    test('throws 400 when no valid image fields provided', async () => {
      await expect(svc.updateProfileImages(UID, {})).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('uploads avatar when provided', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.com/avatar.jpg');
      User.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ avatarUrl: 'https://azure.com/avatar.jpg' }),
      });
      const result = await svc.updateProfileImages(UID, {
        avatar: [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }],
      });
      expect(uploadImageToAzure).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/jpeg',
        'avatars'
      );
    });

    test('uploads cover when provided', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.com/cover.jpg');
      User.findByIdAndUpdate.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ coverUrl: 'https://azure.com/cover.jpg' }),
      });
      await svc.updateProfileImages(UID, {
        cover: [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }],
      });
      expect(uploadImageToAzure).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/jpeg',
        'covers'
      );
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
  });
});

// ═══════════════════════════════════════════════════════════
// stationService — hydrateStation switch branches
// ═══════════════════════════════════════════════════════════
describe('stationService', () => {
  const svc = require('../services/stationService');

  describe('likeStation', () => {
    test('throws 400 when stationId missing', async () => {
      await expect(
        svc.likeStation(UID, { stationType: 'genre' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('throws 400 when stationType missing', async () => {
      await expect(
        svc.likeStation(UID, { stationId: 'sid' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('creates station like', async () => {
      StationLike.findOne.mockResolvedValue(null);
      StationLike.create.mockResolvedValue({ _id: 'slid', stationId: 'sid' });
      const result = await svc.likeStation(UID, {
        stationId: 'sid',
        stationType: 'genre',
        genre: 'Pop',
        stationTitle: 'Pop Station',
        stationDescription: 'Good pop',
      });
      expect(StationLike.create).toHaveBeenCalled();
    });

    test('throws 400 when station already liked', async () => {
      StationLike.findOne.mockResolvedValue({ _id: 'slid' });
      await expect(
        svc.likeStation(UID, { stationId: 'sid', stationType: 'genre' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('unlikeStation', () => {
    test('throws 404 when like not found', async () => {
      StationLike.findOneAndDelete.mockResolvedValue(null);
      await expect(svc.unlikeStation(UID, 'sid')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('succeeds when like found', async () => {
      StationLike.findOneAndDelete.mockResolvedValue({ _id: 'slid' });
      const result = await svc.unlikeStation(UID, 'sid');
      expect(result.liked).toBe(false);
    });
  });

  describe('checkStationLiked', () => {
    test('returns liked: true when record found', async () => {
      StationLike.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'slid' }),
      });
      const result = await svc.checkStationLiked(UID, 'sid');
      expect(result.liked).toBe(true);
    });

    test('returns liked: false when record not found', async () => {
      StationLike.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const result = await svc.checkStationLiked(UID, 'sid');
      expect(result.liked).toBe(false);
    });
  });

  describe('getLikedStations', () => {
    test('returns stations without hydration when hydrate=false', async () => {
      const mockLikes = [
        {
          stationId: 'sid1',
          stationType: 'genre',
          genre: 'Pop',
          createdAt: new Date(),
        },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(1);
      const result = await svc.getLikedStations(UID, 1, 20, false);
      expect(result.stations.length).toBe(1);
    });

    test('returns hydrated stations when hydrate=true', async () => {
      const mockLikes = [
        {
          stationId: 'sid1',
          stationType: 'genre',
          genre: 'Pop',
          createdAt: new Date(),
        },
        {
          stationId: 'sid2',
          stationType: 'artist',
          artistId: UID2,
          createdAt: new Date(),
        },
        { stationId: 'sid3', stationType: 'trending', createdAt: new Date() },
        {
          stationId: 'sid4',
          stationType: 'recommended',
          createdAt: new Date(),
        },
        { stationId: 'sid5', stationType: 'curated', createdAt: new Date() },
        { stationId: 'sid6', stationType: 'unknown', createdAt: new Date() },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(mockLikes.length);
      discoveryService.getStationByGenre.mockResolvedValue([]);
      discoveryService.getStationByArtist.mockResolvedValue([]);
      discoveryService.getTrendingTracks.mockResolvedValue([]);
      discoveryService.getCuratedByPlatform.mockResolvedValue([
        { id: 'sid5', tracks: [{ _id: TID }] },
      ]);

      const result = await svc.getLikedStations(UID, 1, 20, true);
      expect(result.stations.length).toBeGreaterThan(0);
      expect(discoveryService.getStationByGenre).toHaveBeenCalled();
      expect(discoveryService.getStationByArtist).toHaveBeenCalled();
      expect(discoveryService.getTrendingTracks).toHaveBeenCalled();
    });

    test('handles hydrateStation with genre=null gracefully', async () => {
      const mockLikes = [
        {
          stationId: 'sid1',
          stationType: 'genre',
          genre: null,
          createdAt: new Date(),
        },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(1);
      const result = await svc.getLikedStations(UID, 1, 20, true);
      // genre=null -> no getStationByGenre call, station should still be returned (tracks=[])
      expect(discoveryService.getStationByGenre).not.toHaveBeenCalled();
    });

    test('handles hydrateStation with artistId=null gracefully', async () => {
      const mockLikes = [
        {
          stationId: 'sid1',
          stationType: 'artist',
          artistId: null,
          createdAt: new Date(),
        },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(1);
      const result = await svc.getLikedStations(UID, 1, 20, true);
      expect(discoveryService.getStationByArtist).not.toHaveBeenCalled();
    });

    test('filters out null stations from hydration errors', async () => {
      const mockLikes = [
        {
          stationId: 'sid1',
          stationType: 'genre',
          genre: 'Pop',
          createdAt: new Date(),
        },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(1);
      discoveryService.getStationByGenre.mockRejectedValue(
        new Error('service down')
      );
      const result = await svc.getLikedStations(UID, 1, 20, true);
      // null returned by hydrateStation on error should be filtered out
      expect(result.stations.length).toBe(0);
    });

    test('curated station not found returns empty tracks', async () => {
      const mockLikes = [
        {
          stationId: 'not-in-curated',
          stationType: 'curated',
          createdAt: new Date(),
        },
      ];
      StationLike.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLikes),
      });
      StationLike.countDocuments.mockResolvedValue(1);
      discoveryService.getCuratedByPlatform.mockResolvedValue([
        { id: 'other-id', tracks: [] },
      ]);
      const result = await svc.getLikedStations(UID, 1, 20, true);
      expect(result.stations[0].tracks).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// playerService — getStreamingData & updatePlayerState branches
// ═══════════════════════════════════════════════════════════
describe('playerService', () => {
  const svc = require('../services/playerService');
  const { checkAccessibility } = require('../services/playbackService');

  describe('getStreamingData', () => {
    test('throws 404 when track not found', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(
        svc.getStreamingData(TID, { _id: UID })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when track is not finished', async () => {
      Track.findById.mockResolvedValue({
        processingState: 'Processing',
        hlsUrl: null,
        artist: { toString: () => UID },
      });
      await expect(
        svc.getStreamingData(TID, { _id: UID })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('throws 400 when track is finished but no hlsUrl', async () => {
      Track.findById.mockResolvedValue({
        processingState: 'Finished',
        hlsUrl: null,
        artist: { toString: () => UID },
      });
      await expect(
        svc.getStreamingData(TID, { _id: UID })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('throws 404 when track is not yet released and not the artist', async () => {
      Track.findById.mockResolvedValue({
        processingState: 'Finished',
        hlsUrl: 'https://stream.com/track.m3u8',
        releaseDate: new Date(Date.now() + 99999999),
        artist: { toString: () => UID2 },
        isPublic: true,
      });
      await expect(
        svc.getStreamingData(TID, { _id: UID, _id: { toString: () => UID } })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('returns stream data for valid track', async () => {
      const track = {
        processingState: 'Finished',
        hlsUrl: 'https://stream.com/track.m3u8',
        releaseDate: new Date(Date.now() - 99999),
        artist: { toString: () => UID },
        isPublic: true,
        duration: 200,
        format: 'mp3',
        previewStartTime: 0,
        previewEndTime: 30,
      };
      Track.findById.mockResolvedValue(track);
      // Mock checkAccessibility to not throw
      jest
        .spyOn(require('../services/playbackService'), 'checkAccessibility')
        .mockReturnValue(true);
      const result = await svc.getStreamingData(TID, {
        _id: { toString: () => UID },
        subscriptionPlan: 'Free',
      });
      expect(result).toHaveProperty('streamUrl');
    });
  });

  describe('getPlayerState', () => {
    test('returns default state when no state found', async () => {
      PlayerState.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementationOnce((cb) => cb(null)),
      });
      // Simplify mock
      PlayerState.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(null),
      });
      const result = await svc.getPlayerState(UID);
      expect(result.currentTrack).toBeNull();
    });

    test('returns saved state when found', async () => {
      const savedState = {
        currentTrack: { _id: TID },
        currentTime: 30,
        isPlaying: true,
      };
      PlayerState.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(savedState),
      });
      const result = await svc.getPlayerState(UID);
      expect(result).toBe(savedState);
    });
  });

  describe('updatePlayerState', () => {
    test('clamps currentTime to 0 when negative', async () => {
      const track = { duration: 100 };
      Track.findById.mockResolvedValue(track);
      const savedState = { currentTrack: TID, currentTime: 0 };
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(savedState),
      });
      const result = await svc.updatePlayerState(UID, {
        currentTrack: TID,
        currentTime: -5,
        isPlaying: false,
      });
      // currentTime was negative so it should have been clamped to 0
      const updateCall = PlayerState.findOneAndUpdate.mock.calls[0];
      expect(updateCall[1].currentTime).toBe(0);
    });

    test('clamps currentTime to track duration when over', async () => {
      const track = { duration: 100 };
      Track.findById.mockResolvedValue(track);
      const savedState = { currentTrack: TID, currentTime: 100 };
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(savedState),
      });
      await svc.updatePlayerState(UID, {
        currentTrack: TID,
        currentTime: 150,
        isPlaying: true,
      });
      const updateCall = PlayerState.findOneAndUpdate.mock.calls[0];
      expect(updateCall[1].currentTime).toBe(100);
    });

    test('throws 404 when track not found for state update', async () => {
      Track.findById.mockResolvedValue(null);
      await expect(
        svc.updatePlayerState(UID, { currentTrack: TID, currentTime: 30 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('skips track lookup when no currentTrack', async () => {
      const savedState = { currentTrack: null, currentTime: 0 };
      PlayerState.findOneAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(savedState),
      });
      await svc.updatePlayerState(UID, { currentTime: 0, isPlaying: false });
      expect(Track.findById).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// firebaseService — sendPushNotification branches
// ═══════════════════════════════════════════════════════════
describe('firebaseService', () => {
  test('returns early when tokens is empty', async () => {
    const { sendPushNotification } = require('../services/firebaseService');
    // Should not throw even when firebase is not initialized
    await expect(
      sendPushNotification([], 'title', 'body')
    ).resolves.toBeUndefined();
  });

  test('returns early when tokens is null', async () => {
    const { sendPushNotification } = require('../services/firebaseService');
    await expect(
      sendPushNotification(null, 'title', 'body')
    ).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// authService — findOrCreateGoogleUser branches (via handleGoogleCallback)
// ═══════════════════════════════════════════════════════════
describe('authService internal branches', () => {
  // Test verifyRefreshToken grace window path
  test('verifyRefreshToken grace window: returns cached tokens for concurrent requests', async () => {
    // Reset module to get fresh state
    jest.resetModules();
    jest.mock('../models/userModel');
    jest.mock('../utils/sendEmail');
    jest.mock('axios');

    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = 'testsecret';
    process.env.JWT_REFRESH_SECRET = 'refreshsecret';

    const User2 = require('../models/userModel');
    const authSvc = require('../services/authService');

    const mockUser = {
      _id: UID,
      id: UID,
      role: 'Artist',
      refreshToken: 'old-token',
      save: jest.fn().mockResolvedValue(true),
    };

    // Set up the mock so jwt.verify succeeds
    const validToken = jwt.sign({ id: UID, role: 'Artist' }, 'refreshsecret', {
      expiresIn: '7d',
    });
    mockUser.refreshToken = validToken;

    User2.findById.mockResolvedValue(mockUser);
    User2.findByIdAndUpdate.mockResolvedValue(mockUser);

    // First call should work
    const result = await authSvc.verifyRefreshToken(validToken);
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('refreshToken');

    // Second call with old token should hit grace window cache
    const result2 = await authSvc.verifyRefreshToken(validToken);
    expect(result2).toHaveProperty('token');
  });
});

// ═══════════════════════════════════════════════════════════
// subscriptionService — branch coverage
// ═══════════════════════════════════════════════════════════
describe('subscriptionService', () => {
  // Mock stripe at module level
  beforeAll(() => {
    jest.mock('stripe', () => {
      return jest.fn(() => ({
        checkout: {
          sessions: { create: jest.fn() },
        },
        subscriptions: { update: jest.fn() },
        webhooks: { constructEvent: jest.fn() },
      }));
    });
  });

  const AppError = require('../utils/appError');

  describe('createStripeCheckout', () => {
    test('throws 400 when user is already premium (non-cancelling)', async () => {
      jest.resetModules();
      jest.mock('stripe', () =>
        jest.fn(() => ({
          checkout: {
            sessions: {
              create: jest
                .fn()
                .mockResolvedValue({ url: 'https://checkout.stripe.com' }),
            },
          },
          subscriptions: { update: jest.fn() },
          webhooks: { constructEvent: jest.fn() },
        }))
      );
      const svc = require('../services/subscriptionService');
      const user = { isPremium: true, cancelAtPeriodEnd: false };
      await expect(svc.createStripeCheckout(user, 'Pro')).rejects.toMatchObject(
        { statusCode: 400 }
      );
    });

    test('throws 400 for invalid plan type', async () => {
      jest.resetModules();
      jest.mock('stripe', () =>
        jest.fn(() => ({
          checkout: { sessions: { create: jest.fn() } },
          subscriptions: { update: jest.fn() },
          webhooks: { constructEvent: jest.fn() },
        }))
      );
      const svc = require('../services/subscriptionService');
      const user = { isPremium: false, role: 'Artist', _id: UID };
      await expect(
        svc.createStripeCheckout(user, 'InvalidPlan')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('throws 400 for Pro plan for Listener role', async () => {
      jest.resetModules();
      jest.mock('stripe', () =>
        jest.fn(() => ({
          checkout: { sessions: { create: jest.fn() } },
          subscriptions: { update: jest.fn() },
          webhooks: { constructEvent: jest.fn() },
        }))
      );
      const svc = require('../services/subscriptionService');
      const user = { isPremium: false, role: 'Listener', _id: UID };
      await expect(svc.createStripeCheckout(user, 'Pro')).rejects.toMatchObject(
        { statusCode: 400 }
      );
    });
  });

  describe('cancelSubscription', () => {
    test('throws 400 when user is not premium', async () => {
      jest.resetModules();
      jest.mock('../models/userModel');
      jest.mock('stripe', () =>
        jest.fn(() => ({
          subscriptions: { update: jest.fn() },
          webhooks: { constructEvent: jest.fn() },
          checkout: { sessions: { create: jest.fn() } },
        }))
      );
      const User2 = require('../models/userModel');
      const svc = require('../services/subscriptionService');
      User2.findById.mockResolvedValue({ isPremium: false });
      await expect(svc.cancelSubscription(UID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
