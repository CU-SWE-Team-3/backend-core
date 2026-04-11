'use strict';
/**
 * 03_trackInteractionComment.test.js
 */

jest.mock('../models/trackModel');
jest.mock('../models/interactionModel');
jest.mock('../models/commentModel');
jest.mock('../utils/azureStorage');
jest.mock('../utils/queueProducer');
jest.mock('@azure/storage-blob', () => {
  const mockDeleteIfExists = jest.fn().mockResolvedValue(true);
  const mockDownload = jest.fn().mockResolvedValue({
    readableStreamBody: 'stream', contentType: 'audio/mp3', contentLength: 5000,
  });
  const mockGetBlobClient = jest.fn().mockReturnValue({ download: mockDownload, deleteIfExists: mockDeleteIfExists, url: 'https://blob/track.mp3' });
  const mockGetBlockBlobClient = jest.fn().mockReturnValue({ uploadData: jest.fn().mockResolvedValue(true), url: 'https://blob/pl.m3u8' });
  const mockContainerClient = { getBlobClient: mockGetBlobClient, getBlockBlobClient: mockGetBlockBlobClient, createIfNotExists: jest.fn().mockResolvedValue(true) };
  return {
    BlobServiceClient: { fromConnectionString: jest.fn().mockReturnValue({ getContainerClient: jest.fn().mockReturnValue(mockContainerClient) }) },
    generateBlobSASQueryParameters: jest.fn().mockReturnValue({ toString: () => 'sas' }),
    BlobSASPermissions: { parse: jest.fn().mockReturnValue({}) },
    StorageSharedKeyCredential: jest.fn(),
    _mockDeleteIfExists: mockDeleteIfExists,
    _mockDownload: mockDownload,
  };
});

const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Comment = require('../models/commentModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const { publishToQueue } = require('../utils/queueProducer');
const azureBlob = require('@azure/storage-blob');

const trackService = require('../services/trackService');
const interactionService = require('../services/interactionService');
const commentService = require('../services/commentService');

const UID = '507f1f77bcf86cd799439011';
const TID = '507f1f77bcf86cd799439022';
const CID = '507f1f77bcf86cd799439033';

const ARTIST = { _id: UID, role: 'Artist', isPremium: false };
const PREMIUM = { _id: UID, role: 'Artist', isPremium: true };
const TRACK = {
  _id: TID, title: 'Beat', artist: { toString: () => UID, _id: { toString: () => UID } },
  processingState: 'Finished', isPublic: true, audioUrl: 'https://blob/song.mp3',
  releaseDate: new Date('2020-01-01'), duration: 200, hlsUrl: 'https://blob/pl.m3u8', format: 'audio/mp3',
  save: jest.fn().mockResolvedValue(true), deleteOne: jest.fn().mockResolvedValue(true),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AZURE_ACCOUNT_NAME = 'testaccount';
  process.env.AZURE_ACCOUNT_KEY = 'dGVzdA==';
  process.env.AZURE_CONTAINER_NAME = 'biobeats';
  process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
});

// ─── trackService ─────────────────────────────────────────────────────────────

describe('trackService.updateTrackMetadata', () => {
  test('updates allowed fields', async () => {
    Track.findOneAndUpdate.mockResolvedValue({ ...TRACK, title: 'New' });
    const r = await trackService.updateTrackMetadata(TID, ARTIST, { title: 'New' });
    expect(r.title).toBe('New');
  });

  test('blocks free user from scheduling future release', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    await expect(trackService.updateTrackMetadata(TID, ARTIST, { releaseDate: future })).rejects.toThrow('Artist Pro subscription');
  });

  test('allows premium user to schedule future release', async () => {
    Track.findOneAndUpdate.mockResolvedValue(TRACK);
    const future = new Date(Date.now() + 86400000).toISOString();
    await expect(trackService.updateTrackMetadata(TID, PREMIUM, { releaseDate: future })).resolves.toBeDefined();
  });

  test('throws 404 when track not found', async () => {
    Track.findOneAndUpdate.mockResolvedValue(null);
    await expect(trackService.updateTrackMetadata(TID, ARTIST, { title: 'x' })).rejects.toThrow('Track not found');
  });
});

describe('trackService.getMyTracks', () => {
  test('returns finished tracks', async () => {
    Track.find.mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([TRACK]) });
    expect(await trackService.getMyTracks(UID)).toHaveLength(1);
  });
});

describe('trackService.toggleTrackVisibility', () => {
  test('sets track private', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, save: jest.fn().mockResolvedValue(true) });
    const r = await trackService.toggleTrackVisibility(TID, UID, false);
    expect(r.isPublic).toBe(false);
  });

  test('throws 404 when not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(trackService.toggleTrackVisibility('bad', UID, true)).rejects.toThrow('Track not found');
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, artist: { toString: () => 'other' } });
    await expect(trackService.toggleTrackVisibility(TID, UID, true)).rejects.toThrow('permission');
  });
});

describe('trackService.updateTrackArtwork', () => {
  test('uploads artwork and saves', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, save: jest.fn().mockResolvedValue(true) });
    uploadImageToAzure.mockResolvedValue('https://blob/art.png');
    const r = await trackService.updateTrackArtwork(TID, UID, { buffer: Buffer.from('x'), originalname: 'a.jpg' });
    expect(r.artworkUrl).toBe('https://blob/art.png');
  });

  test('throws 404 when not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(trackService.updateTrackArtwork('bad', UID, {})).rejects.toThrow('Track not found');
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, artist: { toString: () => 'other' } });
    await expect(trackService.updateTrackArtwork(TID, UID, {})).rejects.toThrow('permission');
  });
});

describe('trackService.generateUploadUrl', () => {
  test('generates URL for premium user', async () => {
    Track.create.mockResolvedValue({ ...TRACK, _id: 'new-id' });
    const r = await trackService.generateUploadUrl(PREMIUM, { title: 'S', format: 'audio/mp3', size: 1000, duration: 60 });
    expect(r.trackId).toBe('new-id');
    expect(r.uploadUrl).toContain('testaccount');
  });

  test('throws 403 when free user hits 3-track limit', async () => {
    Track.countDocuments.mockResolvedValue(3);
    await expect(trackService.generateUploadUrl(ARTIST, { format: 'audio/mp3', size: 1000, duration: 60 })).rejects.toThrow('Upload limit reached');
  });

  test('allows free user under the limit', async () => {
    Track.countDocuments.mockResolvedValue(2);
    Track.create.mockResolvedValue({ _id: 'id' });
    await expect(trackService.generateUploadUrl(ARTIST, { title: 'S', format: 'audio/mp3', size: 1000, duration: 60 })).resolves.toBeDefined();
  });

  test('throws 400 for unsupported format', async () => {
    Track.countDocuments.mockResolvedValue(0);
    await expect(trackService.generateUploadUrl(ARTIST, { format: 'video/mp4', size: 1000, duration: 60 })).rejects.toThrow('Unsupported format');
  });

  test('generates .wav extension for wav format', async () => {
    Track.countDocuments.mockResolvedValue(0);
    Track.create.mockResolvedValue({ _id: 'id' });
    const r = await trackService.generateUploadUrl(ARTIST, { format: 'audio/wav', size: 1000, duration: 60 });
    expect(r.uploadUrl).toContain('.wav');
  });

  test('honours releaseDate for premium user', async () => {
    Track.create.mockResolvedValue({ _id: 'id' });
    const future = new Date(Date.now() + 86400000).toISOString();
    await trackService.generateUploadUrl(PREMIUM, { format: 'audio/mp3', size: 1000, duration: 60, releaseDate: future });
    expect(Track.create.mock.calls[0][0].releaseDate).toBe(future);
  });

  test('overrides releaseDate to now for non-Artist Listener', async () => {
    Track.countDocuments.mockResolvedValue(0);
    Track.create.mockResolvedValue({ _id: 'id' });
    const future = new Date(Date.now() + 86400000).toISOString();
    await trackService.generateUploadUrl({ _id: UID, role: 'Listener', isPremium: false }, { format: 'audio/mp3', size: 1000, duration: 60, releaseDate: future });
    expect(Track.create.mock.calls[0][0].releaseDate).not.toBe(future);
  });
});

describe('trackService.confirmUpload', () => {
  test('saves Processing state and publishes to queue', async () => {
    const track = { ...TRACK, save: jest.fn().mockResolvedValue(true), _id: { toString: () => TID } };
    Track.findOne.mockResolvedValue(track);
    publishToQueue.mockResolvedValue(true);
    const r = await trackService.confirmUpload(TID, UID);
    expect(r.processingState).toBe('Processing');
    expect(publishToQueue).toHaveBeenCalled();
  });

  test('throws 404 when track not found', async () => {
    Track.findOne.mockResolvedValue(null);
    await expect(trackService.confirmUpload('bad', UID)).rejects.toThrow('Track not found.');
  });
});

describe('trackService.getTrackByPermalink', () => {
  const chain = (t) => ({ select: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(t) }) });

  test('returns public finished track', async () => {
    Track.findOne.mockReturnValue(chain(TRACK));
    expect(await trackService.getTrackByPermalink('beat', null)).toBe(TRACK);
  });

  test('throws 404 when null', async () => {
    Track.findOne.mockReturnValue(chain(null));
    await expect(trackService.getTrackByPermalink('slug')).rejects.toThrow('not found');
  });

  test('throws 404 for processing track', async () => {
    Track.findOne.mockReturnValue(chain({ ...TRACK, processingState: 'Processing' }));
    await expect(trackService.getTrackByPermalink('slug')).rejects.toThrow('still processing');
  });

  test('throws 404 for future release', async () => {
    Track.findOne.mockReturnValue(chain({ ...TRACK, releaseDate: new Date(Date.now() + 86400000) }));
    await expect(trackService.getTrackByPermalink('slug')).rejects.toThrow('Track not found.');
  });

  test('throws 403 for private track by non-owner', async () => {
    const t = { ...TRACK, isPublic: false, artist: { _id: { toString: () => 'owner' } } };
    Track.findOne.mockReturnValue(chain(t));
    await expect(trackService.getTrackByPermalink('slug', 'other')).rejects.toThrow('private');
  });

  test('allows owner to access own private track', async () => {
    const t = { ...TRACK, isPublic: false, artist: { _id: { toString: () => UID } } };
    Track.findOne.mockReturnValue(chain(t));
    expect(await trackService.getTrackByPermalink('slug', UID)).toBe(t);
  });
});

describe('trackService.downloadTrackAudio', () => {
  test('throws 403 for non-premium user', async () => {
    await expect(trackService.downloadTrackAudio(TID, ARTIST)).rejects.toThrow('Premium Subscription');
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(trackService.downloadTrackAudio(TID, PREMIUM)).rejects.toThrow('not found or not ready');
  });

  test('returns stream for premium user', async () => {
    Track.findById.mockResolvedValue(TRACK);
    const r = await trackService.downloadTrackAudio(TID, PREMIUM);
    expect(r.stream).toBe('stream');
    expect(r.filename).toContain('.mp3');
  });
});

describe('trackService.deleteTrack', () => {
  test('deletes from DB and Azure', async () => {
    const track = { ...TRACK, artist: { toString: () => UID }, deleteOne: jest.fn().mockResolvedValue(true) };
    Track.findById.mockResolvedValue(track);
    expect(await trackService.deleteTrack(TID, UID)).toBe(true);
    expect(azureBlob._mockDeleteIfExists).toHaveBeenCalled();
    expect(track.deleteOne).toHaveBeenCalled();
  });

  test('still deletes from DB when Azure fails', async () => {
    const track = { ...TRACK, artist: { toString: () => UID }, deleteOne: jest.fn().mockResolvedValue(true) };
    Track.findById.mockResolvedValue(track);
    azureBlob._mockDeleteIfExists.mockRejectedValueOnce(new Error('Azure down'));
    expect(await trackService.deleteTrack(TID, UID)).toBe(true);
    expect(track.deleteOne).toHaveBeenCalled();
  });

  test('throws 404 when not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(trackService.deleteTrack('bad', UID)).rejects.toThrow('Track not found.');
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue({ ...TRACK, artist: { toString: () => 'other' } });
    await expect(trackService.deleteTrack(TID, UID)).rejects.toThrow('Unauthorized');
  });
});

// ─── interactionService ───────────────────────────────────────────────────────

describe('interactionService.addRepost', () => {
  test('reposts track', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Interaction.findOne.mockResolvedValue(null);
    Interaction.create.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    expect((await interactionService.addRepost(UID, TID)).reposted).toBe(true);
  });
  test('throws 404 when track missing', async () => { Track.findById.mockResolvedValue(null); await expect(interactionService.addRepost(UID, TID)).rejects.toThrow('Track not found'); });
  test('throws 400 when already reposted', async () => { Track.findById.mockResolvedValue(TRACK); Interaction.findOne.mockResolvedValue({ _id: 'e' }); await expect(interactionService.addRepost(UID, TID)).rejects.toThrow('already reposted'); });
});

describe('interactionService.removeRepost', () => {
  test('removes repost', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Interaction.findOne.mockResolvedValue({ _id: 'rid' });
    Interaction.findByIdAndDelete.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    expect((await interactionService.removeRepost(UID, TID)).reposted).toBe(false);
  });
  test('throws 404 when track missing', async () => { Track.findById.mockResolvedValue(null); await expect(interactionService.removeRepost(UID, TID)).rejects.toThrow('Track not found'); });
  test('throws 400 when not reposted', async () => { Track.findById.mockResolvedValue(TRACK); Interaction.findOne.mockResolvedValue(null); await expect(interactionService.removeRepost(UID, TID)).rejects.toThrow('not reposted'); });
});

describe('interactionService.addLike', () => {
  test('likes track', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Interaction.findOne.mockResolvedValue(null);
    Interaction.create.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    expect((await interactionService.addLike(UID, TID)).liked).toBe(true);
  });
  test('throws 404 when track missing', async () => { Track.findById.mockResolvedValue(null); await expect(interactionService.addLike(UID, TID)).rejects.toThrow('Track not found'); });
  test('throws 400 when already liked', async () => { Track.findById.mockResolvedValue(TRACK); Interaction.findOne.mockResolvedValue({ _id: 'e' }); await expect(interactionService.addLike(UID, TID)).rejects.toThrow('already liked'); });
});

describe('interactionService.removeLike', () => {
  test('removes like', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Interaction.findOne.mockResolvedValue({ _id: 'lid' });
    Interaction.findByIdAndDelete.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    expect((await interactionService.removeLike(UID, TID)).liked).toBe(false);
  });
  test('throws 404 when track missing', async () => { Track.findById.mockResolvedValue(null); await expect(interactionService.removeLike(UID, TID)).rejects.toThrow('Track not found'); });
  test('throws 400 when not liked', async () => { Track.findById.mockResolvedValue(TRACK); Interaction.findOne.mockResolvedValue(null); await expect(interactionService.removeLike(UID, TID)).rejects.toThrow('not liked'); });
});

describe('interactionService.getTrackEngagers', () => {
  test('returns paginated users', async () => {
    Interaction.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue([{ actorId: { displayName: 'A' } }]) });
    Interaction.countDocuments.mockResolvedValue(45);
    const r = await interactionService.getTrackEngagers(TID, 'LIKE', 1, 20);
    expect(r.users).toHaveLength(1);
    expect(r.totalPages).toBe(3);
  });
});

describe('interactionService.getUserReposts', () => {
  test('filters null tracks', async () => {
    Interaction.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue([{ targetId: { title: 'A' }, createdAt: new Date() }, { targetId: null, createdAt: new Date() }]) });
    Interaction.countDocuments.mockResolvedValue(2);
    expect((await interactionService.getUserReposts(UID)).repostedTracks).toHaveLength(1);
  });
});

describe('interactionService.getUserLikes', () => {
  test('filters null tracks', async () => {
    Interaction.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue([{ targetId: { title: 'B' }, createdAt: new Date() }, { targetId: null, createdAt: new Date() }]) });
    Interaction.countDocuments.mockResolvedValue(2);
    expect((await interactionService.getUserLikes(UID)).likedTracks).toHaveLength(1);
  });
});

// ─── commentService ───────────────────────────────────────────────────────────

describe('commentService.addComment', () => {
  test('creates top-level comment', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Comment.create.mockResolvedValue({ _id: CID });
    Track.findByIdAndUpdate.mockResolvedValue({});
    const r = await commentService.addComment(UID, TID, 'Nice!', 30);
    expect(r._id).toBe(CID);
  });
  test('throws 404 when track missing', async () => { Track.findById.mockResolvedValue(null); await expect(commentService.addComment(UID, TID, 'x', 0)).rejects.toThrow('Track not found'); });
  test('creates reply to valid parent', async () => {
    Track.findById.mockResolvedValue(TRACK);
    Comment.findById.mockResolvedValue({ _id: 'par', parentComment: null, track: { toString: () => TID } });
    Comment.create.mockResolvedValue({ _id: 'rep' });
    Track.findByIdAndUpdate.mockResolvedValue({});
    expect((await commentService.addComment(UID, TID, 'Reply', 10, 'par'))._id).toBe('rep');
  });
  test('throws 404 when parent not found', async () => { Track.findById.mockResolvedValue(TRACK); Comment.findById.mockResolvedValue(null); await expect(commentService.addComment(UID, TID, 'x', 0, 'bad')).rejects.toThrow('Parent comment not found'); });
  test('throws 400 for nested reply > 1 level', async () => { Track.findById.mockResolvedValue(TRACK); Comment.findById.mockResolvedValue({ _id: 'p', parentComment: 'gp', track: { toString: () => TID } }); await expect(commentService.addComment(UID, TID, 'x', 0, 'p')).rejects.toThrow('one level deep'); });
  test('throws 400 when parent belongs to different track', async () => { Track.findById.mockResolvedValue(TRACK); Comment.findById.mockResolvedValue({ _id: 'p', parentComment: null, track: { toString: () => 'other' } }); await expect(commentService.addComment(UID, TID, 'x', 0, 'p')).rejects.toThrow('different track'); });
});

describe('commentService.getTrackComments', () => {
  test('returns paginated results', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis() };
    chain.populate.mockReturnValueOnce(chain).mockResolvedValueOnce([{ _id: CID }]);
    Comment.find.mockReturnValue(chain);
    Comment.countDocuments.mockResolvedValue(1);
    const r = await commentService.getTrackComments(TID);
    expect(r.total).toBe(1);
    expect(r.totalPages).toBe(1);
  });
});

describe('commentService.deleteComment', () => {
  test('deletes parent + replies', async () => {
    Comment.findById.mockResolvedValue({ _id: CID, user: { toString: () => UID }, track: TID, parentComment: null });
    Comment.deleteMany.mockResolvedValue({ deletedCount: 3 });
    Comment.deleteOne.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    await commentService.deleteComment(UID, CID);
    expect(Comment.deleteMany).toHaveBeenCalledWith({ parentComment: CID });
    expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(TID, { $inc: { commentCount: -4 } });
  });
  test('deletes reply without cascade', async () => {
    Comment.findById.mockResolvedValue({ _id: CID, user: { toString: () => UID }, track: TID, parentComment: 'par' });
    Comment.deleteOne.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});
    await commentService.deleteComment(UID, CID);
    expect(Comment.deleteMany).not.toHaveBeenCalled();
    expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(TID, { $inc: { commentCount: -1 } });
  });
  test('throws 404 when comment not found', async () => { Comment.findById.mockResolvedValue(null); await expect(commentService.deleteComment(UID, CID)).rejects.toThrow('Comment not found'); });
  test('throws 403 when not author', async () => { Comment.findById.mockResolvedValue({ _id: CID, user: { toString: () => 'other' } }); await expect(commentService.deleteComment(UID, CID)).rejects.toThrow('permission'); });
});
