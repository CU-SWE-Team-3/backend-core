'use strict';
/**
 * 07_playlist.test.js
 * Module 7: Sets & Playlists
 * Tests playlistService and playlistController
 */

jest.mock('../models/playlistModel');
jest.mock('../models/trackModel');
jest.mock('../models/userModel');
jest.mock('../models/followModel');
jest.mock('../utils/azureStorage');
jest.mock('../services/notificationService');

const Playlist = require('../models/playlistModel');
const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Follow = require('../models/followModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const notificationService = require('../services/notificationService');

jest.mock('../services/playlistService');
const playlistService = require('../services/playlistService');
const playlistController = require('../controllers/playlistController');

const UID = '507f1f77bcf86cd799439011';
const PID = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const PLAYLIST = {
  _id: PID, title: 'My Set', creator: UID, isPrivate: false,
  tracks: [TID], trackCount: 1, secretToken: 'secret123',
  toObject: jest.fn().mockReturnValue({ _id: PID, title: 'My Set', creator: UID, isPrivate: false, tracks: [TID] }),
  save: jest.fn().mockResolvedValue(true),
};

beforeEach(() => jest.clearAllMocks());

// ─── playlistService (real implementation, mocked deps) ──────────────────────
// We test the real service by re-requiring it without the service mock

describe('playlistService (real) — via service mock approach', () => {
  // Use the controller-level service mock for controller tests,
  // and separately test service logic via unit tests below.

  test('createPlaylist — 201', async () => {
    playlistService.createPlaylist.mockResolvedValue({ _id: PID, title: 'New Set' });
    const r = mkRes();
    await playlistController.createPlaylist({ user: { _id: UID }, body: { title: 'New Set' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  test('getPlaylist — 200', async () => {
    playlistService.getPlaylist.mockResolvedValue(PLAYLIST);
    const r = mkRes();
    await playlistController.getPlaylist({ user: { _id: UID }, params: { id: PID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('updatePlaylist — 200', async () => {
    playlistService.updatePlaylist.mockResolvedValue({ ...PLAYLIST, title: 'Updated' });
    const r = mkRes();
    await playlistController.updatePlaylist({ user: { _id: UID }, params: { id: PID }, body: { title: 'Updated' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('deletePlaylist — 204', async () => {
    playlistService.deletePlaylist.mockResolvedValue(PLAYLIST);
    const r = mkRes();
    await playlistController.deletePlaylist({ user: { _id: UID }, params: { id: PID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(204);
  });

  test('updateTracks — 200', async () => {
    playlistService.updateTracks.mockResolvedValue({ ...PLAYLIST, tracks: [TID] });
    const r = mkRes();
    await playlistController.updateTracks({ user: { _id: UID }, params: { id: PID }, body: { tracks: [TID] } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getEmbedCode — 200', async () => {
    playlistService.getEmbedCode.mockResolvedValue({ iframeCode: '<iframe/>', playlistId: PID });
    const r = mkRes();
    await playlistController.getEmbedCode({ user: { _id: UID }, params: { id: PID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getAllPlaylists — 200', async () => {
    playlistService.getAllPlaylists.mockResolvedValue([PLAYLIST]);
    const r = mkRes();
    await playlistController.getAllPlaylists({ user: { _id: UID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ results: 1 }));
  });

  test('uploadArtwork — 200', async () => {
    playlistService.uploadArtwork.mockResolvedValue({ ...PLAYLIST, artworkUrl: 'art.png' });
    const r = mkRes();
    await playlistController.uploadArtwork({ user: { _id: UID }, params: { id: PID }, file: { buffer: Buffer.from('x'), originalname: 'art.jpg' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('uploadArtwork — 400 when no file', async () => {
    const next = jest.fn();
    await playlistController.uploadArtwork({ user: { _id: UID }, params: { id: PID }, file: null }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── playlistService REAL unit tests ─────────────────────────────────────────
// Unmock the service and test its internals directly

describe('playlistService (real service logic)', () => {
  // Re-require the REAL service (not the mock)
  jest.unmock('../services/playlistService');
  jest.unmock('../services/notificationService');

  // We still mock the models and azureStorage
  const realPlaylistService = jest.requireActual('../services/playlistService');

  const mkPlaylist = (overrides = {}) => ({
    _id: PID, title: 'My Set', creator: UID, isPrivate: false,
    tracks: [TID], trackCount: 1, totalDuration: 200,
    secretToken: 'secret123',
    toObject: jest.fn().mockReturnValue({ _id: PID, title: 'My Set' }),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  test('createPlaylist — creates playlist for free user under limit', async () => {
    User.findById.mockResolvedValue({ _id: UID, subscriptionPlan: 'Free' });
    Playlist.countDocuments.mockResolvedValue(1); // under limit of 2
    const saved = mkPlaylist();
    Playlist.mockImplementation(() => saved);
    Follow.find.mockResolvedValue([]);
    notificationService.notifyNewPlaylist = jest.fn();
    const result = await realPlaylistService.createPlaylist(UID, { title: 'My Set', isPrivate: false });
    expect(saved.save).toHaveBeenCalled();
  });

  test('createPlaylist — throws 403 when free user hits 2-playlist limit', async () => {
    User.findById.mockResolvedValue({ _id: UID, subscriptionPlan: 'Free' });
    Playlist.countDocuments.mockResolvedValue(2);
    await expect(realPlaylistService.createPlaylist(UID, { title: 'Too Many' })).rejects.toThrow('limited to 2 playlists');
  });

  test('createPlaylist — throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(realPlaylistService.createPlaylist(UID, {})).rejects.toThrow('User not found');
  });

  test('getPlaylist — returns public playlist', async () => {
    const pl = mkPlaylist();
    pl.tracks = [{ _id: TID, duration: 200 }];
    Playlist.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(pl) });
    const result = await realPlaylistService.getPlaylist(PID, { _id: UID }, null);
    expect(result.totalDuration).toBe(200);
  });

  test('getPlaylist — throws 404 when not found', async () => {
    Playlist.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(realPlaylistService.getPlaylist(PID, null, null)).rejects.toThrow('Playlist not found');
  });

  test('getPlaylist — throws 403 for private playlist without token or ownership', async () => {
    const pl = mkPlaylist({ isPrivate: true, creator: { toString: () => 'other' } });
    pl.tracks = [];
    Playlist.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(pl) });
    await expect(realPlaylistService.getPlaylist(PID, { _id: UID }, null)).rejects.toThrow('private');
  });

  test('getPlaylist — allows access with valid secret token', async () => {
    const pl = mkPlaylist({ isPrivate: true, creator: { toString: () => 'other' }, secretToken: 'validtoken' });
    pl.tracks = [];
    Playlist.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(pl) });
    const result = await realPlaylistService.getPlaylist(PID, null, 'validtoken');
    expect(result).toBeDefined();
  });

  test('getPlaylist — owner can access own private playlist', async () => {
    const pl = mkPlaylist({ isPrivate: true, creator: { toString: () => UID } });
    pl.tracks = [];
    Playlist.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(pl) });
    const result = await realPlaylistService.getPlaylist(PID, { _id: UID }, null);
    expect(result).toBeDefined();
  });

  test('updatePlaylist — updates metadata', async () => {
    const pl = mkPlaylist();
    Playlist.findOne.mockResolvedValue(pl);
    const result = await realPlaylistService.updatePlaylist(PID, UID, { title: 'New Title' });
    expect(pl.save).toHaveBeenCalled();
  });

  test('updatePlaylist — throws 403 when not owner', async () => {
    Playlist.findOne.mockResolvedValue(null);
    await expect(realPlaylistService.updatePlaylist(PID, UID, {})).rejects.toThrow('not authorized');
  });

  test('deletePlaylist — deletes playlist', async () => {
    Playlist.findOneAndDelete.mockResolvedValue(mkPlaylist());
    const result = await realPlaylistService.deletePlaylist(PID, UID);
    expect(result).toBeDefined();
  });

  test('deletePlaylist — throws 403 when not owner', async () => {
    Playlist.findOneAndDelete.mockResolvedValue(null);
    await expect(realPlaylistService.deletePlaylist(PID, UID)).rejects.toThrow('not authorized');
  });

  test('updateTracks — recalculates duration and saves', async () => {
    const pl = mkPlaylist();
    Playlist.findOne.mockResolvedValue(pl);
    Track.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: TID, duration: 180 }]) });
    const result = await realPlaylistService.updateTracks(PID, UID, [TID]);
    expect(pl.save).toHaveBeenCalled();
    expect(pl.totalDuration).toBe(180);
  });

  test('updateTracks — throws 403 when unauthorized', async () => {
    Playlist.findOne.mockResolvedValue(null);
    await expect(realPlaylistService.updateTracks(PID, UID, [TID])).rejects.toThrow('unauthorized');
  });

  test('getEmbedCode — returns iframe for public playlist', async () => {
    process.env.FRONTEND_URL = 'https://biobeats.app';
    const pl = mkPlaylist({ isPrivate: false });
    Playlist.findById.mockResolvedValue(pl);
    const result = await realPlaylistService.getEmbedCode(PID, { _id: UID }, null);
    expect(result.iframeCode).toContain('<iframe');
    expect(result.iframeCode).not.toContain('secretToken');
  });

  test('getEmbedCode — includes secretToken param for private playlist', async () => {
    process.env.FRONTEND_URL = 'https://biobeats.app';
    const pl = mkPlaylist({ isPrivate: true, creator: { toString: () => UID } });
    Playlist.findById.mockResolvedValue(pl);
    const result = await realPlaylistService.getEmbedCode(PID, { _id: UID }, null);
    expect(result.iframeCode).toContain('secretToken=secret123');
  });

  test('getEmbedCode — throws 404 when not found', async () => {
    Playlist.findById.mockResolvedValue(null);
    await expect(realPlaylistService.getEmbedCode(PID, null, null)).rejects.toThrow('Playlist not found');
  });

  test('getEmbedCode — throws 403 for private without auth', async () => {
    const pl = mkPlaylist({ isPrivate: true, creator: { toString: () => 'other' } });
    Playlist.findById.mockResolvedValue(pl);
    await expect(realPlaylistService.getEmbedCode(PID, null, null)).rejects.toThrow('private');
  });

  test('uploadArtwork — uploads and saves', async () => {
    const pl = mkPlaylist();
    Playlist.findOne.mockResolvedValue(pl);
    uploadImageToAzure.mockResolvedValue('https://blob/art.png');
    const result = await realPlaylistService.uploadArtwork(PID, UID, { buffer: Buffer.from('x'), originalname: 'art.jpg' });
    expect(uploadImageToAzure).toHaveBeenCalled();
    expect(pl.artworkUrl).toBe('https://blob/art.png');
    expect(pl.save).toHaveBeenCalled();
  });

  test('uploadArtwork — throws 403 when not owner', async () => {
    Playlist.findOne.mockResolvedValue(null);
    await expect(realPlaylistService.uploadArtwork(PID, UID, {})).rejects.toThrow('not authorized');
  });

  test('getAllPlaylists — returns public playlists for guest', async () => {
    const chain = { select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([mkPlaylist()]) };
    Playlist.find.mockReturnValue(chain);
    const result = await realPlaylistService.getAllPlaylists({}, null);
    expect(result).toHaveLength(1);
    // Verifies isPrivate:false was enforced
    expect(Playlist.find).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false }));
  });

  test('getAllPlaylists — shows private playlists to their creator', async () => {
    const chain = { select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([mkPlaylist()]) };
    Playlist.find.mockReturnValue(chain);
    await realPlaylistService.getAllPlaylists({ creator: UID }, { _id: { toString: () => UID } });
    // No isPrivate filter applied when creator is the current user
    const filterArg = Playlist.find.mock.calls[0][0];
    expect(filterArg.isPrivate).toBeUndefined();
  });
});
