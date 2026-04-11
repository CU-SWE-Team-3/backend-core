'use strict';
/**
 * 02_profileNetwork.test.js
 * Tests for profileService and networkService — imports real files.
 */

jest.mock('../models/userModel');
jest.mock('../models/followModel');
jest.mock('../models/blockModel');
jest.mock('../models/trackModel');
jest.mock('../utils/azureStorage');

const User = require('../models/userModel');
const Follow = require('../models/followModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');
const { uploadImageToAzure } = require('../utils/azureStorage');

const profileService = require('../services/profileService');
const networkService = require('../services/networkService');

const UID = '507f1f77bcf86cd799439011';
const UID2 = '507f1f77bcf86cd799439022';

const mkChain = (resolved) => ({
  select: jest.fn().mockResolvedValue(resolved),
});

const mkTrackChain = (resolved) => ({
  populate: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(resolved),
});

beforeEach(() => jest.clearAllMocks());

// ─── profileService ───────────────────────────────────────────────────────────

describe('profileService.getProfileByPermalink', () => {
  test('returns full user when public', async () => {
    const user = { displayName: 'DJ', isPrivate: false };
    User.findOne.mockReturnValue(mkChain(user));
    expect(await profileService.getProfileByPermalink('dj')).toBe(user);
  });

  test('returns limited fields when private', async () => {
    const user = { displayName: 'DJ', avatarUrl: 'a.png', permalink: 'dj', role: 'Artist', isPrivate: true };
    User.findOne.mockReturnValue(mkChain(user));
    const r = await profileService.getProfileByPermalink('dj');
    expect(r.isPrivate).toBe(true);
    expect(r.bio).toBeUndefined();
  });

  test('throws 404 when not found', async () => {
    User.findOne.mockReturnValue(mkChain(null));
    await expect(profileService.getProfileByPermalink('nobody')).rejects.toThrow('Profile not found.');
  });
});

describe('profileService.updatePrivacy', () => {
  test('updates isPrivate field', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain({ isPrivate: true }));
    expect((await profileService.updatePrivacy(UID, true)).isPrivate).toBe(true);
  });

  test('throws when user not found', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain(null));
    await expect(profileService.updatePrivacy('bad', false)).rejects.toThrow('User not found');
  });
});

describe('profileService.updateSocialLinks', () => {
  const newLinks = [{ platform: 'IG', url: 'https://ig.com/dj' }];

  test('updates links when changed', async () => {
    const user = { socialLinks: [{ platform: 'TW', url: 'https://tw.com' }], save: jest.fn().mockResolvedValue(true) };
    user.socialLinks.map = Array.prototype.map.bind(user.socialLinks);
    User.findById.mockReturnValue(mkChain(user));
    await profileService.updateSocialLinks(UID, newLinks);
    expect(user.socialLinks).toEqual(newLinks);
  });

  test('throws 404 when user not found', async () => {
    User.findById.mockReturnValue(mkChain(null));
    await expect(profileService.updateSocialLinks(UID, newLinks)).rejects.toThrow('User not found');
  });

  test('throws 400 when links identical', async () => {
    const user = { socialLinks: newLinks };
    user.socialLinks.map = Array.prototype.map.bind(user.socialLinks);
    User.findById.mockReturnValue(mkChain(user));
    await expect(profileService.updateSocialLinks(UID, newLinks)).rejects.toThrow('No changes detected');
  });
});

describe('profileService.removeSocialLink', () => {
  test('removes existing link', async () => {
    const user = { socialLinks: { id: jest.fn().mockReturnValue({ platform: 'IG' }), pull: jest.fn() }, save: jest.fn().mockResolvedValue(true) };
    User.findById.mockReturnValue(mkChain(user));
    await profileService.removeSocialLink(UID, 'link-id');
    expect(user.socialLinks.pull).toHaveBeenCalledWith('link-id');
  });

  test('throws 404 when link not found', async () => {
    const user = { socialLinks: { id: jest.fn().mockReturnValue(null) } };
    User.findById.mockReturnValue(mkChain(user));
    await expect(profileService.removeSocialLink(UID, 'bad')).rejects.toThrow('Social link not found');
  });

  test('throws 404 when user not found', async () => {
    User.findById.mockReturnValue(mkChain(null));
    await expect(profileService.removeSocialLink(UID, 'link')).rejects.toThrow('User not found');
  });
});

describe('profileService.updateTier', () => {
  test('updates role', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain({ role: 'Artist' }));
    expect((await profileService.updateTier(UID, 'Artist')).role).toBe('Artist');
  });

  test('throws when user not found', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain(null));
    await expect(profileService.updateTier('bad', 'Artist')).rejects.toThrow('User not found');
  });
});

describe('profileService.updateProfileData', () => {
  test('only passes allowed fields', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain({ bio: 'New' }));
    await profileService.updateProfileData(UID, { bio: 'New', password: 'ignored' });
    const payload = User.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(payload).not.toHaveProperty('password');
    expect(payload.bio).toBe('New');
  });

  test('omits undefined fields', async () => {
    User.findByIdAndUpdate.mockReturnValue(mkChain({}));
    await profileService.updateProfileData(UID, { bio: 'x' });
    const payload = User.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(Object.keys(payload)).toEqual(['bio']);
  });
});

describe('profileService.updateProfileImages', () => {
  test('uploads avatar to Azure', async () => {
    uploadImageToAzure.mockResolvedValue('https://blob/av.png');
    User.findByIdAndUpdate.mockReturnValue(mkChain({ avatarUrl: 'https://blob/av.png' }));
    const r = await profileService.updateProfileImages(UID, { avatar: [{ buffer: Buffer.from('x'), mimetype: 'image/jpeg' }] });
    expect(uploadImageToAzure).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'avatars');
    expect(r.avatarUrl).toBe('https://blob/av.png');
  });

  test('uploads cover to Azure', async () => {
    uploadImageToAzure.mockResolvedValue('https://blob/co.png');
    User.findByIdAndUpdate.mockReturnValue(mkChain({ coverUrl: 'https://blob/co.png' }));
    await profileService.updateProfileImages(UID, { cover: [{ buffer: Buffer.from('x'), mimetype: 'image/png' }] });
    expect(uploadImageToAzure).toHaveBeenCalledWith(expect.any(Buffer), 'image/png', 'covers');
  });

  test('uploads both avatar and cover', async () => {
    uploadImageToAzure.mockResolvedValueOnce('av').mockResolvedValueOnce('co');
    User.findByIdAndUpdate.mockReturnValue(mkChain({}));
    await profileService.updateProfileImages(UID, {
      avatar: [{ buffer: Buffer.from('a'), mimetype: 'image/jpeg' }],
      cover: [{ buffer: Buffer.from('c'), mimetype: 'image/jpeg' }],
    });
    expect(uploadImageToAzure).toHaveBeenCalledTimes(2);
  });

  test('throws when no valid files', async () => {
    await expect(profileService.updateProfileImages(UID, {})).rejects.toThrow('No valid image fields provided');
  });
});

// ─── networkService ───────────────────────────────────────────────────────────

const mkFollowChain = (data) => ({
  populate: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockResolvedValue(data),
});

describe('networkService.followUser', () => {
  test('follows successfully', async () => {
    User.findById.mockResolvedValue({ _id: UID2 });
    Block.findOne.mockResolvedValue(null);
    Follow.findOne.mockResolvedValue(null);
    Follow.create.mockResolvedValue({});
    User.findByIdAndUpdate
      .mockReturnValueOnce(mkChain({ followingCount: 1 }))
      .mockReturnValueOnce(mkChain({ followerCount: 1 }));
    const r = await networkService.followUser(UID, UID2);
    expect(r.myFollowingCount).toBe(1);
    expect(r.theirFollowerCount).toBe(1);
  });

  test('throws when following self', async () => {
    await expect(networkService.followUser(UID, UID)).rejects.toThrow('You cannot follow yourself.');
  });

  test('throws when target not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(networkService.followUser(UID, UID2)).rejects.toThrow('User not found.');
  });

  test('throws 403 when block exists', async () => {
    User.findById.mockResolvedValue({ _id: UID2 });
    Block.findOne.mockResolvedValue({ _id: 'blk' });
    await expect(networkService.followUser(UID, UID2)).rejects.toThrow('active block');
  });

  test('throws when already following', async () => {
    User.findById.mockResolvedValue({ _id: UID2 });
    Block.findOne.mockResolvedValue(null);
    Follow.findOne.mockResolvedValue({ follower: UID });
    await expect(networkService.followUser(UID, UID2)).rejects.toThrow('already following');
  });
});

describe('networkService.unfollowUser', () => {
  test('unfollows and returns updated counts', async () => {
    Follow.findOneAndDelete.mockResolvedValue({ follower: UID });
    User.findByIdAndUpdate
      .mockReturnValueOnce(mkChain({ followingCount: 0 }))
      .mockReturnValueOnce(mkChain({ followerCount: 0 }));
    const r = await networkService.unfollowUser(UID, UID2);
    expect(r.myFollowingCount).toBe(0);
  });

  test('throws when not following', async () => {
    Follow.findOneAndDelete.mockResolvedValue(null);
    await expect(networkService.unfollowUser(UID, UID2)).rejects.toThrow('not following');
  });
});

describe('networkService.getUserFeed', () => {
  test('returns empty array when no follows', async () => {
    Follow.find.mockResolvedValue([]);
    expect(await networkService.getUserFeed(UID)).toEqual([]);
  });

  test('returns tracks from followed artists', async () => {
    Follow.find.mockResolvedValue([{ following: UID2 }]);
    Track.find.mockReturnValue(mkTrackChain([{ title: 'Beat' }]));
    const r = await networkService.getUserFeed(UID);
    expect(r).toHaveLength(1);
  });
});

describe('networkService.getFollowers', () => {
  test('returns follower list', async () => {
    Follow.find.mockReturnValue(mkFollowChain([{ follower: { displayName: 'Fan' } }]));
    const r = await networkService.getFollowers(UID);
    expect(r).toHaveLength(1);
  });

  test('applies correct pagination skip', async () => {
    Follow.find.mockReturnValue(mkFollowChain([]));
    await networkService.getFollowers(UID, 3, 10);
    const chain = Follow.find.mock.results[0].value;
    expect(chain.skip).toHaveBeenCalledWith(20);
  });
});

describe('networkService.getFollowing', () => {
  test('returns following list', async () => {
    Follow.find.mockReturnValue(mkFollowChain([{ following: { displayName: 'Artist' } }]));
    const r = await networkService.getFollowing(UID);
    expect(r).toHaveLength(1);
  });
});

describe('networkService.getSuggestedUsers', () => {
  const mkUserFindChain = (data) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(data),
  });

  // Follow.find in getSuggestedUsers uses .select('following') — need chainable mock
  const mkFollowSelectChain = (data) => ({
    select: jest.fn().mockResolvedValue(data),
  });

  test('returns popular fallback when user follows nobody', async () => {
    Follow.find.mockReturnValue(mkFollowSelectChain([]));
    Block.find.mockResolvedValue([]);
    User.find.mockReturnValue(mkUserFindChain([{ _id: UID2, displayName: 'Popular' }]));
    const r = await networkService.getSuggestedUsers(UID, 1, 10);
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].displayName).toBe('Popular');
  });

  test('uses aggregate for mutual follows then popularity fallback', async () => {
    const mutualId = '507f1f77bcf86cd799439033';
    Follow.find.mockReturnValue(mkFollowSelectChain([{ following: UID2 }]));
    Block.find.mockResolvedValue([]);
    Follow.aggregate = jest.fn().mockResolvedValue([{ _id: mutualId, mutualCount: 2 }]);
    // User.find for mutual users needs .select() chain; fallback also needs full chain
    const mkSelectChain = (data) => ({ select: jest.fn().mockResolvedValue(data) });
    User.find
      .mockReturnValueOnce(mkSelectChain([{ _id: mutualId, displayName: 'Mutual' }]))
      .mockReturnValueOnce(mkUserFindChain([]));
    const r = await networkService.getSuggestedUsers(UID, 1, 10);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('networkService.getBlockedUsers', () => {
  test('returns blocked users', async () => {
    Block.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([{ blocked: { displayName: 'Blocked' } }]),
    });
    const r = await networkService.getBlockedUsers(UID);
    expect(r[0].displayName).toBe('Blocked');
  });
});

describe('networkService.blockUser', () => {
  test('blocks user and removes mutual follows', async () => {
    Block.findOne.mockResolvedValue(null);
    Block.create.mockResolvedValue({});
    Follow.findOneAndDelete
      .mockResolvedValueOnce({ follower: UID })
      .mockResolvedValueOnce({ follower: UID2 });
    User.findByIdAndUpdate.mockResolvedValue({});
    expect((await networkService.blockUser(UID, UID2)).status).toBe('blocked');
    expect(Follow.findOneAndDelete).toHaveBeenCalledTimes(2);
  });

  test('blocks with no follow cleanup when no mutual follows', async () => {
    Block.findOne.mockResolvedValue(null);
    Block.create.mockResolvedValue({});
    Follow.findOneAndDelete.mockResolvedValue(null);
    expect((await networkService.blockUser(UID, UID2)).status).toBe('blocked');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('throws 400 when blocking self', async () => {
    await expect(networkService.blockUser(UID, UID)).rejects.toThrow('You cannot block yourself');
  });

  test('throws 409 when already blocked', async () => {
    Block.findOne.mockResolvedValue({ _id: 'blk' });
    await expect(networkService.blockUser(UID, UID2)).rejects.toThrow('already blocked');
  });
});

describe('networkService.unblockUser', () => {
  test('unblocks user', async () => {
    Block.findOne.mockResolvedValue({ _id: 'blkid' });
    Block.findByIdAndDelete.mockResolvedValue(true);
    expect((await networkService.unblockUser(UID, UID2)).status).toBe('unblocked');
  });

  test('throws 404 when not blocked', async () => {
    Block.findOne.mockResolvedValue(null);
    await expect(networkService.unblockUser(UID, UID2)).rejects.toThrow('User is not blocked');
  });
});
