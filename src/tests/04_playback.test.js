'use strict';
/**
 * 04_playback.test.js
 */

jest.mock('../models/trackModel');
jest.mock('../models/listenHistoryModel');
jest.mock('../models/playerStateModel');

const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const PlayerState = require('../models/playerStateModel');

const playbackService = require('../services/playbackService');
const playerService = require('../services/playerService');

const UID = '507f1f77bcf86cd799439011';
const TID = '507f1f77bcf86cd799439022';
const TRACK = {
  _id: TID, title: 'Beat', duration: 200, isPublic: true,
  hlsUrl: 'https://blob/pl.m3u8', format: 'audio/mp3', processingState: 'Finished',
  releaseDate: new Date('2020-01-01'),
  artist: { toString: () => 'artist-id', _id: { toString: () => 'artist-id' } },
};

beforeEach(() => jest.clearAllMocks());

// ─── checkAccessibility ───────────────────────────────────────────────────────

describe('playbackService.checkAccessibility', () => {
  test('allows streaming public track', () => {
    expect(playbackService.checkAccessibility({ _id: 'u', isPremium: false }, TRACK, 'stream')).toBe(true);
  });
  test('throws 403 for private track by non-owner', () => {
    const pt = { isPublic: false, artist: { toString: () => 'other' } };
    expect(() => playbackService.checkAccessibility({ _id: 'u' }, pt, 'stream')).toThrow('private');
  });
  test('allows owner to stream own private track', () => {
    const pt = { isPublic: false, artist: { toString: () => 'me' } };
    expect(playbackService.checkAccessibility({ _id: 'me' }, pt, 'stream')).toBe(true);
  });
  test('allows download for premium user', () => {
    expect(playbackService.checkAccessibility({ _id: 'u', isPremium: true }, TRACK, 'download')).toBe(true);
  });
  test('throws 403 download for non-premium', () => {
    expect(() => playbackService.checkAccessibility({ _id: 'u', isPremium: false }, TRACK, 'download')).toThrow('Premium Plan');
  });
  test('throws 400 for invalid action', () => {
    expect(() => playbackService.checkAccessibility({ _id: 'u' }, TRACK, 'burn')).toThrow('Invalid action');
  });
});

// ─── recordPlaybackProgress ───────────────────────────────────────────────────

describe('playbackService.recordPlaybackProgress', () => {
  const mockHistory = (first, second) => {
    let call = 0;
    ListenHistory.findOneAndUpdate.mockImplementation(() => {
      call++;
      if (call === 1) return { select: jest.fn().mockResolvedValue(first) };
      return Promise.resolve(second);
    });
  };

  test('returns null when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    expect(await playbackService.recordPlaybackProgress(UID, TID, 50)).toBeNull();
  });

  test('increments playCount at > 90%', async () => {
    Track.findById.mockResolvedValue(TRACK);
    mockHistory({ isPlayCounted: false }, { isPlayCounted: true });
    Track.findByIdAndUpdate.mockResolvedValue({});
    await playbackService.recordPlaybackProgress(UID, TID, 185);
    expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(TID, { $inc: { playCount: 1 } });
  });

  test('does NOT increment playCount at 50%', async () => {
    Track.findById.mockResolvedValue(TRACK);
    mockHistory({ isPlayCounted: false }, { isPlayCounted: false });
    await playbackService.recordPlaybackProgress(UID, TID, 100);
    expect(Track.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('sets isPlayCounted=false on restart < 10%', async () => {
    Track.findById.mockResolvedValue(TRACK);
    mockHistory({ isPlayCounted: true }, { isPlayCounted: false });
    await playbackService.recordPlaybackProgress(UID, TID, 5);
    expect(ListenHistory.findOneAndUpdate.mock.calls[1][1].$set.isPlayCounted).toBe(false);
  });

  test('sets isPlayCounted=true on completion > 90%', async () => {
    Track.findById.mockResolvedValue(TRACK);
    mockHistory({ isPlayCounted: false }, { isPlayCounted: true });
    Track.findByIdAndUpdate.mockResolvedValue({});
    await playbackService.recordPlaybackProgress(UID, TID, 185);
    expect(ListenHistory.findOneAndUpdate.mock.calls[1][1].$set.isPlayCounted).toBe(true);
  });

  test('does not double-count already-counted plays', async () => {
    Track.findById.mockResolvedValue(TRACK);
    mockHistory({ isPlayCounted: true }, { isPlayCounted: true });
    await playbackService.recordPlaybackProgress(UID, TID, 185);
    expect(Track.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// ─── getRecentlyPlayed ────────────────────────────────────────────────────────

describe('playbackService.getRecentlyPlayed', () => {
  const mkChain = () => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue([{ track: TRACK }]),
  });

  test('returns paginated history', async () => {
    ListenHistory.find.mockReturnValue(mkChain());
    const r = await playbackService.getRecentlyPlayed(UID, 1, 20);
    expect(r).toHaveLength(1);
  });

  test('applies correct skip for page 2', async () => {
    const chain = mkChain();
    ListenHistory.find.mockReturnValue(chain);
    await playbackService.getRecentlyPlayed(UID, 2, 10);
    expect(chain.skip).toHaveBeenCalledWith(10);
  });
});

// ─── playerService ────────────────────────────────────────────────────────────

describe('playerService.getStreamingData', () => {
  test('returns stream data for valid track', async () => {
    Track.findById.mockResolvedValue(TRACK);
    const r = await playerService.getStreamingData(TID, { _id: 'u', isPremium: false });
    expect(r.streamUrl).toBe(TRACK.hlsUrl);
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(playerService.getStreamingData('bad', { _id: 'u' })).rejects.toThrow('Track not found');
  });

  test('throws 400 when still processing', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, processingState: 'Processing' });
    await expect(playerService.getStreamingData(TID, { _id: 'u' })).rejects.toThrow('processing or unavailable');
  });

  test('throws 400 when no hlsUrl', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, hlsUrl: null });
    await expect(playerService.getStreamingData(TID, { _id: 'u' })).rejects.toThrow('processing or unavailable');
  });

  test('throws 404 for future release by non-owner', async () => {
    const ft = { ...TRACK, releaseDate: new Date(Date.now() + 86400000), artist: { toString: () => 'owner' } };
    Track.findById.mockResolvedValue(ft);
    await expect(playerService.getStreamingData(TID, { _id: 'other' })).rejects.toThrow('Track not found');
  });
});

describe('playerService.getPlayerState', () => {
  test('returns default when no saved state', async () => {
    PlayerState.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(null) });
    const r = await playerService.getPlayerState(UID);
    expect(r.currentTrack).toBeNull();
    expect(r.isPlaying).toBe(false);
    expect(r.queueContext).toBe('none');
  });

  test('returns saved state', async () => {
    const state = { currentTrack: TRACK, isPlaying: true };
    PlayerState.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(state) });
    expect(await playerService.getPlayerState(UID)).toBe(state);
  });
});

describe('playerService.updatePlayerState', () => {
  const mkPSChain = (result) => ({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(result) });

  test('updates state with valid track', async () => {
    Track.findById.mockResolvedValue(TRACK);
    PlayerState.findOneAndUpdate.mockReturnValue(mkPSChain({ currentTrack: TID, isPlaying: true }));
    const r = await playerService.updatePlayerState(UID, { currentTrack: TID, currentTime: 50, isPlaying: true });
    expect(r.isPlaying).toBe(true);
  });

  test('clamps negative currentTime to 0', async () => {
    Track.findById.mockResolvedValue(TRACK);
    PlayerState.findOneAndUpdate.mockReturnValue(mkPSChain({}));
    await playerService.updatePlayerState(UID, { currentTrack: TID, currentTime: -5 });
    expect(PlayerState.findOneAndUpdate.mock.calls[0][1].currentTime).toBe(0);
  });

  test('clamps currentTime above duration to duration', async () => {
    Track.findById.mockResolvedValue(TRACK);
    PlayerState.findOneAndUpdate.mockReturnValue(mkPSChain({}));
    await playerService.updatePlayerState(UID, { currentTrack: TID, currentTime: 9999 });
    expect(PlayerState.findOneAndUpdate.mock.calls[0][1].currentTime).toBe(TRACK.duration);
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(playerService.updatePlayerState(UID, { currentTrack: 'bad', currentTime: 0 })).rejects.toThrow('Track not found');
  });

  test('skips track validation when no currentTrack provided', async () => {
    PlayerState.findOneAndUpdate.mockReturnValue(mkPSChain({ isPlaying: false }));
    const r = await playerService.updatePlayerState(UID, { isPlaying: false });
    expect(Track.findById).not.toHaveBeenCalled();
    expect(r.isPlaying).toBe(false);
  });
});
