'use strict';
/**
 * 17_trackCommentService.test.js
 * Covers: trackService (metadata, visibility, delete, permalink, etc.) and commentService
 */

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        getBlobClient: jest.fn().mockReturnValue({
          deleteIfExists: jest.fn().mockResolvedValue(true),
          download: jest
            .fn()
            .mockResolvedValue({
              readableStreamBody: {},
              contentType: 'audio/mpeg',
              contentLength: 1000,
            }),
        }),
      }),
    }),
  },
  generateBlobSASQueryParameters: jest
    .fn()
    .mockReturnValue({ toString: () => 'sas=token123' }),
  BlobSASPermissions: { parse: jest.fn().mockReturnValue({}) },
  StorageSharedKeyCredential: jest.fn(),
}));

jest.mock('../models/trackModel');
jest.mock('../models/commentModel');
jest.mock('../models/blockModel');
jest.mock('../models/userModel');
jest.mock('../models/followModel');
jest.mock('../utils/azureStorage');
jest.mock('../utils/queueProducer');
jest.mock('../services/notificationService');

const Track = require('../models/trackModel');
const Comment = require('../models/commentModel');
const Block = require('../models/blockModel');
const User = require('../models/userModel');
const Follow = require('../models/followModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const { publishToQueue } = require('../utils/queueProducer');
const notificationService = require('../services/notificationService');

const UID = '507f1f77bcf86cd799439011';
const AID = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';
const CID = '507f1f77bcf86cd799439044';

const mkTrack = (ov = {}) => ({
  _id: TID,
  title: 'My Track',
  artist: { _id: UID, toString: () => UID },
  isPublic: true,
  moderationStatus: 'Approved',
  processingState: 'Finished',
  playCount: 0,
  likeCount: 0,
  repostCount: 0,
  commentCount: 0,
  displayStatsPublicly: true,
  enableDirectDownloads: true,
  allowComments: true,
  duration: 200,
  releaseDate: new Date(Date.now() - 1000),
  audioUrl: 'https://az.com/container/track-123.mp3',
  hlsUrl: 'hls://track',
  viralScore: 5,
  toObject: jest.fn().mockReturnThis(),
  deleteOne: jest.fn().mockResolvedValue(true),
  save: jest.fn().mockResolvedValue(true),
  ...ov,
});

const mkComment = (ov = {}) => ({
  _id: CID,
  user: { toString: () => UID },
  track: TID,
  content: 'Great!',
  timestamp: 30,
  parentComment: null,
  save: jest.fn().mockResolvedValue(true),
  ...ov,
});

beforeEach(() => {
  jest.clearAllMocks();
  notificationService.notifyComment = jest.fn();
  notificationService.notifyMention = jest.fn();
  notificationService.retractNotification = jest.fn();
  notificationService.notifyNewTrack = jest.fn();
  publishToQueue.mockResolvedValue(true);
  process.env.AZURE_ACCOUNT_NAME = 'testaccount';
  process.env.AZURE_ACCOUNT_KEY = 'dGVzdGtleQ=='; // base64 of "testkey"
  process.env.AZURE_CONTAINER_NAME = 'biobeats-audio';
  process.env.AZURE_STORAGE_CONNECTION_STRING =
    'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdGtleQ==;';
});

// ════════════════════════════════════════════════════════════
// TRACK SERVICE
// ════════════════════════════════════════════════════════════
const trackService = require('../services/trackService');

describe('trackService.updateTrackMetadata', () => {
  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(
      trackService.updateTrackMetadata(TID, { _id: UID }, {})
    ).rejects.toThrow('Track not found');
  });

  test('throws 403 when user is not owner', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => AID } })
    );
    await expect(
      trackService.updateTrackMetadata(TID, { _id: UID }, {})
    ).rejects.toThrow('permission');
  });

  test('throws 403 for future release without Pro', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => UID } })
    );
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const user = { _id: UID, subscriptionPlan: 'Free' };
    await expect(
      trackService.updateTrackMetadata(TID, user, { releaseDate: futureDate })
    ).rejects.toThrow('Artist Pro subscription');
  });

  test('allows future release for Pro user', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => UID } })
    );
    Track.findByIdAndUpdate.mockResolvedValue(mkTrack());
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const user = { _id: UID, subscriptionPlan: 'Pro' };
    const result = await trackService.updateTrackMetadata(TID, user, {
      releaseDate: futureDate,
      title: 'New Title',
    });
    expect(Track.findByIdAndUpdate).toHaveBeenCalled();
  });

  test('updates metadata successfully', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => UID } })
    );
    Track.findByIdAndUpdate.mockResolvedValue(mkTrack({ title: 'Updated' }));
    const result = await trackService.updateTrackMetadata(
      TID,
      { _id: UID },
      { title: 'Updated', genre: 'Pop' }
    );
    expect(Track.findByIdAndUpdate).toHaveBeenCalledWith(
      TID,
      { $set: expect.objectContaining({ title: 'Updated', genre: 'Pop' }) },
      expect.any(Object)
    );
  });
});

describe('trackService.toggleTrackVisibility', () => {
  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(
      trackService.toggleTrackVisibility(TID, UID, false)
    ).rejects.toThrow('Track not found');
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => AID } })
    );
    await expect(
      trackService.toggleTrackVisibility(TID, UID, false)
    ).rejects.toThrow('permission');
  });

  test('toggles visibility', async () => {
    const track = mkTrack({ artist: { toString: () => UID } });
    Track.findById.mockResolvedValue(track);
    const result = await trackService.toggleTrackVisibility(TID, UID, false);
    expect(result.isPublic).toBe(false);
    expect(track.save).toHaveBeenCalled();
  });
});

describe('trackService.updateTrackArtwork', () => {
  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(
      trackService.updateTrackArtwork(TID, UID, {
        buffer: Buffer.from(''),
        originalname: 'art.jpg',
      })
    ).rejects.toThrow('Track not found');
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => AID } })
    );
    await expect(trackService.updateTrackArtwork(TID, UID, {})).rejects.toThrow(
      'permission'
    );
  });

  test('updates artwork', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => UID } })
    );
    uploadImageToAzure.mockResolvedValue('https://azure.com/artwork.jpg');
    const result = await trackService.updateTrackArtwork(TID, UID, {
      buffer: Buffer.from('img'),
      originalname: 'art.jpg',
    });
    expect(result.artworkUrl).toBe('https://azure.com/artwork.jpg');
  });
});

describe('trackService.getTrackByPermalink', () => {
  const setupFindOne = (track) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(track),
    };
    Track.findOne.mockReturnValue(chain);
  };

  test('throws 404 when track not found', async () => {
    setupFindOne(null);
    await expect(trackService.getTrackByPermalink('bad-track')).rejects.toThrow(
      'Track not found'
    );
  });

  test('throws 404 when still processing', async () => {
    setupFindOne(mkTrack({ processingState: 'Processing' }));
    await expect(trackService.getTrackByPermalink('my-track')).rejects.toThrow(
      'Track not found'
    );
  });

  test('throws 404 for future release date', async () => {
    const track = mkTrack({ releaseDate: new Date(Date.now() + 1000000) });
    setupFindOne(track);
    await expect(trackService.getTrackByPermalink('my-track')).rejects.toThrow(
      'Track not found'
    );
  });

  test('throws 403 for hidden track (non-owner)', async () => {
    const track = mkTrack({
      moderationStatus: 'Hidden_By_Admin',
      artist: { _id: { toString: () => AID }, toString: () => AID },
    });
    track.toObject = jest.fn().mockReturnValue({ ...track });
    setupFindOne(track);
    await expect(
      trackService.getTrackByPermalink('my-track', UID)
    ).rejects.toThrow('removed by an Administrator');
  });

  test('throws 403 for private track (non-owner)', async () => {
    const track = mkTrack({
      isPublic: false,
      artist: { _id: { toString: () => AID }, toString: () => AID },
    });
    setupFindOne(track);
    await expect(
      trackService.getTrackByPermalink('my-track', UID)
    ).rejects.toThrow('private');
  });

  test('hides stats when displayStatsPublicly is false', async () => {
    const track = mkTrack({
      displayStatsPublicly: false,
      artist: { _id: { toString: () => UID }, toString: () => UID },
    });
    const trackObj = { ...track, playCount: 100, likeCount: 50 };
    track.toObject = jest.fn().mockReturnValue(trackObj);
    setupFindOne(track);
    const result = await trackService.getTrackByPermalink('my-track', UID);
    expect(result.playCount).toBeNull();
    expect(result.likeCount).toBeNull();
  });
});

describe('trackService.deleteTrack', () => {
  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(trackService.deleteTrack(TID, UID)).rejects.toThrow(
      'Track not found'
    );
  });

  test('throws 403 when not owner', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ artist: { toString: () => AID } })
    );
    await expect(trackService.deleteTrack(TID, UID)).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('deletes track with azure cleanup', async () => {
    const track = mkTrack({ artist: { toString: () => UID } });
    Track.findById.mockResolvedValue(track);
    const result = await trackService.deleteTrack(TID, UID);
    expect(result).toBe(true);
    expect(track.deleteOne).toHaveBeenCalled();
  });

  test('still deletes db record when azure fails', async () => {
    const { BlobServiceClient } = require('@azure/storage-blob');
    BlobServiceClient.fromConnectionString.mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        getBlobClient: jest.fn().mockReturnValue({
          deleteIfExists: jest.fn().mockRejectedValue(new Error('Azure error')),
        }),
      }),
    });
    const track = mkTrack({ artist: { toString: () => UID } });
    Track.findById.mockResolvedValue(track);
    const result = await trackService.deleteTrack(TID, UID);
    expect(result).toBe(true);
    expect(track.deleteOne).toHaveBeenCalled();
  });
});

describe('trackService.confirmUpload', () => {
  test('throws 404 when track not found', async () => {
    Track.findOne.mockResolvedValue(null);
    await expect(trackService.confirmUpload(TID, UID)).rejects.toThrow(
      'Track not found'
    );
  });

  test('publishes to queue and notifies followers', async () => {
    const track = mkTrack({ artist: { toString: () => UID }, isPublic: true });
    Track.findOne.mockResolvedValue(track);
    Follow.find.mockResolvedValue([{ follower: AID }]);

    const result = await trackService.confirmUpload(TID, UID);
    expect(publishToQueue).toHaveBeenCalledWith(
      'audio_processing_queue_v5',
      expect.any(Object)
    );
    expect(result).toBeDefined();
  });

  test('skips notification for private tracks', async () => {
    const track = mkTrack({ artist: { toString: () => UID }, isPublic: false });
    Track.findOne.mockResolvedValue(track);

    await trackService.confirmUpload(TID, UID);
    expect(Follow.find).not.toHaveBeenCalled();
  });
});

describe('trackService.generateUploadUrl', () => {
  test('throws 403 when free user exceeds track limit', async () => {
    Track.countDocuments.mockResolvedValue(3);
    const user = { _id: UID, subscriptionPlan: 'Free' };
    await expect(
      trackService.generateUploadUrl(user, { format: 'audio/mpeg', title: 't' })
    ).rejects.toThrow('Upload limit reached');
  });

  test('throws 400 for unsupported format', async () => {
    const user = { _id: UID, subscriptionPlan: 'Pro' };
    await expect(
      trackService.generateUploadUrl(user, { format: 'video/mp4', title: 't' })
    ).rejects.toThrow('Unsupported format');
  });

  test('throws 400 for missing format', async () => {
    const user = { _id: UID, subscriptionPlan: 'Pro' };
    await expect(
      trackService.generateUploadUrl(user, { title: 't' })
    ).rejects.toThrow('Unsupported format');
  });

  test('creates track for Pro user', async () => {
    const user = { _id: UID, subscriptionPlan: 'Pro' };
    Track.create.mockResolvedValue(mkTrack());
    const result = await trackService.generateUploadUrl(user, {
      format: 'audio/mpeg',
      title: 'My Track',
      size: 1000,
      duration: 180,
    });
    expect(result.trackId).toBeDefined();
    expect(result.uploadUrl).toContain('blob.core.windows.net');
  });

  test('creates wav track', async () => {
    const user = { _id: UID, subscriptionPlan: 'Pro' };
    Track.create.mockResolvedValue(mkTrack());
    const result = await trackService.generateUploadUrl(user, {
      format: 'audio/wav',
      title: 'WAV Track',
      size: 5000,
      duration: 200,
    });
    expect(result.uploadUrl).toBeDefined();
  });
});

describe('trackService.getMyTracks', () => {
  test('returns artist tracks', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([mkTrack()]),
    };
    Track.find.mockReturnValue(chain);
    const result = await trackService.getMyTracks(UID);
    expect(result).toHaveLength(1);
  });
});

describe('trackService.getUserTracks', () => {
  test('returns paginated user tracks', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([mkTrack()]),
    };
    Track.find.mockReturnValue(chain);
    Track.countDocuments.mockResolvedValue(1);
    const result = await trackService.getUserTracks(UID, 1, 20);
    expect(result.total).toBe(1);
    expect(result.tracks).toHaveLength(1);
  });
});

describe('trackService.downloadTrackAudio', () => {
  test('throws 403 for non-Go+ user', async () => {
    const user = { subscriptionPlan: 'Pro' };
    await expect(trackService.downloadTrackAudio(TID, user)).rejects.toThrow(
      'Go+ Subscription'
    );
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    const user = { subscriptionPlan: 'Go+' };
    await expect(trackService.downloadTrackAudio(TID, user)).rejects.toThrow(
      'Track not found'
    );
  });

  test('throws 403 when downloads not enabled', async () => {
    Track.findById.mockResolvedValue(
      mkTrack({ enableDirectDownloads: false, processingState: 'Finished' })
    );
    const user = { subscriptionPlan: 'Go+' };
    await expect(trackService.downloadTrackAudio(TID, user)).rejects.toThrow(
      'not enabled direct downloads'
    );
  });
});

// ════════════════════════════════════════════════════════════
// COMMENT SERVICE
// ════════════════════════════════════════════════════════════
const commentService = require('../services/commentService');

describe('commentService.addComment', () => {
  const mkFullTrack = (ov = {}) => ({
    _id: TID,
    artist: { _id: AID, toString: () => AID },
    allowComments: true,
    ...ov,
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockResolvedValue(null);
    await expect(
      commentService.addComment(UID, TID, 'test', 10)
    ).rejects.toThrow('Track not found');
  });

  test('throws 403 when comments disabled', async () => {
    Track.findById.mockResolvedValue(mkFullTrack({ allowComments: false }));
    await expect(
      commentService.addComment(UID, TID, 'test', 10)
    ).rejects.toThrow('disabled');
  });

  test('throws 403 when blocked', async () => {
    Track.findById.mockResolvedValue(mkFullTrack());
    Block.findOne.mockResolvedValue({ _id: 'block' });
    await expect(
      commentService.addComment(UID, TID, 'test', 10)
    ).rejects.toThrow('blocked');
  });

  test('throws 404 when parent comment not found', async () => {
    Track.findById.mockResolvedValue(mkFullTrack());
    Block.findOne.mockResolvedValue(null);
    Comment.findById.mockResolvedValue(null);
    await expect(
      commentService.addComment(UID, TID, 'test', 10, CID)
    ).rejects.toThrow('Parent comment not found');
  });

  test('throws 400 when reply is more than 1 level deep', async () => {
    Track.findById.mockResolvedValue(mkFullTrack());
    Block.findOne.mockResolvedValue(null);
    Comment.findById.mockResolvedValue({
      parentComment: 'someParentId',
      track: { toString: () => TID },
    });
    await expect(
      commentService.addComment(UID, TID, 'test', 10, CID)
    ).rejects.toThrow('one level deep');
  });

  test('throws 400 when parent comment belongs to different track', async () => {
    Track.findById.mockResolvedValue(mkFullTrack());
    Block.findOne.mockResolvedValue(null);
    Comment.findById.mockResolvedValue({
      parentComment: null,
      track: { toString: () => 'different' },
    });
    await expect(
      commentService.addComment(UID, TID, 'test', 10, CID)
    ).rejects.toThrow('different track');
  });

  test('creates comment and notifies artist', async () => {
    const track = mkFullTrack({ artist: { _id: AID, toString: () => AID } });
    Track.findById.mockResolvedValue(track);
    Block.findOne.mockResolvedValue(null);
    Comment.create.mockResolvedValue(mkComment());
    Track.findByIdAndUpdate.mockResolvedValue({});

    const result = await commentService.addComment(UID, TID, 'Great!', 30);
    expect(result).toBeDefined();
    expect(notificationService.notifyComment).toHaveBeenCalledWith(
      track.artist,
      UID,
      TID,
      'Great!'
    );
  });

  test('does not notify artist when artist is commenter', async () => {
    const track = mkFullTrack({ artist: { _id: UID, toString: () => UID } });
    Track.findById.mockResolvedValue(track);
    Block.findOne.mockResolvedValue(null);
    Comment.create.mockResolvedValue(mkComment());
    Track.findByIdAndUpdate.mockResolvedValue({});

    await commentService.addComment(UID, TID, 'My own', 30);
    expect(notificationService.notifyComment).not.toHaveBeenCalled();
  });

  test('notifies parent comment author on reply', async () => {
    const track = mkFullTrack({ artist: { _id: AID, toString: () => AID } });
    Track.findById.mockResolvedValue(track);
    Block.findOne.mockResolvedValue(null);
    const parentComment = {
      parentComment: null,
      track: { toString: () => TID },
      user: { toString: () => 'parent-user-id' },
    };
    Comment.findById.mockResolvedValue(parentComment);
    Comment.create.mockResolvedValue(mkComment());
    Track.findByIdAndUpdate.mockResolvedValue({});

    await commentService.addComment(UID, TID, 'Reply!', 30, CID);
    // Should notify both artist and parent author
    expect(notificationService.notifyComment).toHaveBeenCalledTimes(2);
  });

  test('handles @mention notifications', async () => {
    const track = mkFullTrack({ artist: { _id: AID, toString: () => AID } });
    Track.findById.mockResolvedValue(track);
    Block.findOne.mockResolvedValue(null);
    Comment.create.mockResolvedValue(mkComment({ content: '@dj_user great!' }));
    Track.findByIdAndUpdate.mockResolvedValue({});
    const mentionedUser = {
      _id: 'mentioned-uid',
      toString: () => 'mentioned-uid',
    };
    User.find.mockResolvedValue([mentionedUser]);

    await commentService.addComment(UID, TID, '@dj_user great!', 30);
    expect(notificationService.notifyMention).toHaveBeenCalled();
  });
});

describe('commentService.getTrackComments', () => {
  test('returns paginated comments', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.then = (cb) => cb([mkComment()]);
    Comment.find.mockReturnValue(chain);
    Comment.countDocuments.mockResolvedValue(1);
    const result = await commentService.getTrackComments(TID, 1, 50);
    expect(result.total).toBe(1);
  });
});

describe('commentService.deleteComment', () => {
  test('throws 404 when comment not found', async () => {
    Comment.findById.mockResolvedValue(null);
    await expect(commentService.deleteComment(UID, CID)).rejects.toThrow(
      'Comment not found'
    );
  });

  test('throws 403 when not comment author', async () => {
    Comment.findById.mockResolvedValue(
      mkComment({ user: { toString: () => AID } })
    );
    await expect(commentService.deleteComment(UID, CID)).rejects.toThrow(
      'permission'
    );
  });

  test('deletes parent comment and replies', async () => {
    const comment = mkComment({
      user: { toString: () => UID },
      parentComment: null,
    });
    Comment.findById.mockResolvedValue(comment);
    Comment.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Comment.deleteOne.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});

    await commentService.deleteComment(UID, CID);
    expect(Comment.deleteMany).toHaveBeenCalled();
    expect(Comment.deleteOne).toHaveBeenCalled();
    expect(notificationService.retractNotification).toHaveBeenCalled();
  });

  test('deletes reply comment without deleting sub-replies', async () => {
    const comment = mkComment({
      user: { toString: () => UID },
      parentComment: 'parent-id',
    });
    Comment.findById.mockResolvedValue(comment);
    Comment.deleteOne.mockResolvedValue({});
    Track.findByIdAndUpdate.mockResolvedValue({});

    await commentService.deleteComment(UID, CID);
    expect(Comment.deleteMany).not.toHaveBeenCalled();
    expect(Comment.deleteOne).toHaveBeenCalled();
  });
});
