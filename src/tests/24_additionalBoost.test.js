const stripeMocks = {
  webhooks: {
    constructEvent: jest.fn(),
  },
};
global.mockStripeInstance = stripeMocks;

global.mockAmqpConnection = null;
global.mockChannelWrapper = null;
global.mockFfmpegStream = null;
global.mockAmqpOptions = null;
global.mockFfmpegErrorHandler = null;

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return global.mockStripeInstance;
  });
});

jest.mock('multer', () => {
  const multer = jest.fn((options) => ({ options }));
  multer.memoryStorage = jest.fn(() => 'memory');
  return multer;
});

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('amqp-connection-manager', () => ({
  connect: jest.fn(() => global.mockAmqpConnection),
}));

jest.mock('fluent-ffmpeg', () => {
  return jest.fn(() => {
    const chain = {
      format: jest.fn().mockReturnThis(),
      audioChannels: jest.fn().mockReturnThis(),
      audioFrequency: jest.fn().mockReturnThis(),
      on: jest.fn((event, handler) => {
        if (event === 'error') {
          global.mockFfmpegErrorHandler = handler;
        }
        return chain;
      }),
      pipe: jest.fn(() => global.mockFfmpegStream),
    };
    return chain;
  });
});

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
}));

jest.mock('../models/userModel');
jest.mock('../models/trackModel');
jest.mock('../services/discoveryService', () => ({
  getRecommendedBasedOnLikes: jest.fn(),
}));
jest.mock('../services/notificationService', () => ({
  notifyRecommended: jest.fn(),
}));
jest.mock('../services/networkService');
jest.mock('../services/interactionService', () => {
  return {
    addRepost: jest.fn(),
    removeRepost: jest.fn(),
    addLike: jest.fn(),
    removeLike: jest.fn(),
    getTrackEngagers: jest.fn(),
    getUserReposts: jest.fn(),
    getUserLikes: jest.fn(),
  };
});

const User = require('../models/userModel');
const Track = require('../models/trackModel');
const discoveryService = require('../services/discoveryService');
const notificationService = require('../services/notificationService');
const networkService = require('../services/networkService');
const interactionService = require('../services/interactionService');
const nodeCron = require('node-cron');
const nodemailer = require('nodemailer');
const amqp = require('amqp-connection-manager');
const ffmpeg = require('fluent-ffmpeg');
const { BlobServiceClient } = require('@azure/storage-blob');

global.mockAmqpConnection = {
  on: jest.fn(),
  createChannel: jest.fn((options) => {
    global.mockAmqpOptions = options;
    return global.mockChannelWrapper;
  }),
};
global.mockChannelWrapper = {
  sendToQueue: jest.fn(),
};
global.mockFfmpegStream = null;

const webhookController = require('../controllers/webhookController');
const networkController = require('../controllers/networkController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const cronJobs = require('../utils/cronJobs');
const interactionController = require('../controllers/interactionController');
const sendEmail = require('../utils/sendEmail');
const { publishToQueue } = require('../utils/queueProducer');
const { generateRealWaveform } = require('../utils/audioUtils');
const { uploadImageToAzure } = require('../utils/azureStorage');

describe('Additional Boost Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.mockFfmpegErrorHandler = null;
    global.mockFfmpegStream = null;
  });

  const mkRes = () => {
    const r = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    r.send = jest.fn().mockReturnValue(r);
    return r;
  };

  describe('webhookController', () => {
    test('handles valid webhook signature', async () => {
      stripeMocks.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user123',
            metadata: { planType: 'Premium' },
            customer: 'cus_123',
            subscription: 'sub_123',
          },
        },
      });
      User.findByIdAndUpdate.mockResolvedValue({});

      const res = mkRes();
      await webhookController.stripeWebhook(
        { headers: { 'stripe-signature': 'sig' }, body: 'raw' },
        res
      );

      expect(res.json).toHaveBeenCalledWith({ received: true });
      expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('returns 400 on error', async () => {
      stripeMocks.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad sig');
      });

      const res = mkRes();
      await webhookController.stripeWebhook({ headers: {}, body: 'raw' }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Webhook Error: bad sig');
    });

    test('ignores other event types', async () => {
      stripeMocks.webhooks.constructEvent.mockReturnValue({
        type: 'other.event',
        data: { object: {} },
      });

      const res = mkRes();
      await webhookController.stripeWebhook({ headers: {}, body: 'raw' }, res);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('networkController', () => {
    test('uses req.user.id and default pagination', async () => {
      const res = mkRes();
      networkService.getSuggestedUsers.mockResolvedValue([1, 2]);
      await networkController.getSuggestedUsers(
        { user: { id: 'u1' }, query: {} },
        res,
        jest.fn()
      );
      expect(networkService.getSuggestedUsers).toHaveBeenCalledWith(
        'u1',
        1,
        10
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: [1, 2], count: 2 })
      );
    });

    test('uses req.user.id fallback for follow', async () => {
      const res = mkRes();
      networkService.followUser.mockResolvedValue({});
      await networkController.followUser(
        { user: { id: 'u1' }, params: { id: 'u2' } },
        res,
        jest.fn()
      );
      expect(networkService.followUser).toHaveBeenCalledWith('u1', 'u2');
    });

    test('uses req.user.id fallback for unfollow', async () => {
      const res = mkRes();
      networkService.unfollowUser.mockResolvedValue({});
      await networkController.unfollowUser(
        { user: { id: 'u1' }, params: { id: 'u2' } },
        res,
        jest.fn()
      );
      expect(networkService.unfollowUser).toHaveBeenCalledWith('u1', 'u2');
    });
  });

  describe('uploadMiddleware', () => {
    test('accepts images', () => {
      const cb = jest.fn();
      const fileFilter = uploadMiddleware.options.fileFilter;
      fileFilter({}, { mimetype: 'image/png' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    test('rejects non-image files', () => {
      const cb = jest.fn();
      const fileFilter = uploadMiddleware.options.fileFilter;
      fileFilter({}, { mimetype: 'text/plain' }, cb);
      const err = cb.mock.calls[0][0];
      expect(err.message).toBe('Invalid file type. Only images are allowed.');
      expect(err.statusCode).toBe(400);
      expect(cb).toHaveBeenCalledWith(err, false);
    });
  });

  describe('interactionController', () => {
    test('createRepost uses params.id or body.targetId', async () => {
      const res = mkRes();
      interactionService.addRepost.mockResolvedValue({});
      await interactionController.createRepost(
        { user: { id: 'u1' }, params: {}, body: { targetId: 't1' } },
        res,
        jest.fn()
      );
      expect(interactionService.addRepost).toHaveBeenCalledWith(
        'u1',
        't1',
        'Track'
      );
    });

    test('deleteRepost uses params.id or body.targetId', async () => {
      const res = mkRes();
      interactionService.removeRepost.mockResolvedValue({});
      await interactionController.deleteRepost(
        { user: { id: 'u1' }, params: {}, body: { targetId: 't1' } },
        res,
        jest.fn()
      );
      expect(interactionService.removeRepost).toHaveBeenCalledWith(
        'u1',
        't1',
        'Track'
      );
    });

    test('createLike uses params.id or body.targetId', async () => {
      const res = mkRes();
      interactionService.addLike.mockResolvedValue({});
      await interactionController.createLike(
        { user: { id: 'u1' }, params: {}, body: { targetId: 't1' } },
        res,
        jest.fn()
      );
      expect(interactionService.addLike).toHaveBeenCalledWith(
        'u1',
        't1',
        'Track'
      );
    });

    test('deleteLike uses params.id or body.targetId', async () => {
      const res = mkRes();
      interactionService.removeLike.mockResolvedValue({});
      await interactionController.deleteLike(
        { user: { id: 'u1' }, params: {}, body: { targetId: 't1' } },
        res,
        jest.fn()
      );
      expect(interactionService.removeLike).toHaveBeenCalledWith(
        'u1',
        't1',
        'Track'
      );
    });
  });

  describe('cronJobs', () => {
    test('registers cron schedules', () => {
      nodeCron.schedule.mockImplementation(() => {});
      cronJobs();
      expect(nodeCron.schedule).toHaveBeenCalled();
    });

    test('runs scheduled jobs and handles branches', async () => {
      const scheduled = [];
      nodeCron.schedule.mockImplementation((_, fn) => {
        scheduled.push(fn);
      });

      Track.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      Track.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      User.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      User.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'u1' }, { _id: 'u2' }]),
      });
      discoveryService.getRecommendedBasedOnLikes
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ _id: 't1' }]);
      notificationService.notifyRecommended.mockResolvedValue(undefined);

      cronJobs();
      await scheduled[0]();
      await scheduled[1]();
      await scheduled[2]();
      await scheduled[3]();

      expect(Track.deleteMany).toHaveBeenCalled();
      expect(User.updateMany).toHaveBeenCalled();
      expect(notificationService.notifyRecommended).toHaveBeenCalledWith('u2', [
        't1',
      ]);
    });

    test('handles cron job failures without throwing', async () => {
      const scheduled = [];
      nodeCron.schedule.mockImplementation((_, fn) => {
        scheduled.push(fn);
      });

      Track.deleteMany = jest.fn().mockRejectedValue(new Error('db down'));
      User.updateMany = jest.fn().mockRejectedValue(new Error('db down'));
      Track.updateMany = jest.fn().mockRejectedValue(new Error('db down'));
      User.find = jest.fn().mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('db down')),
      });

      cronJobs();
      await scheduled[0]();
      await scheduled[1]();
      await scheduled[2]();
      await scheduled[3]();

      expect(Track.deleteMany).toHaveBeenCalled();
      expect(User.updateMany).toHaveBeenCalled();
      expect(Track.updateMany).toHaveBeenCalled();
    });
  });

  describe('sendEmail', () => {
    test('sends mail with pooled transporter', async () => {
      const sendMail = jest.fn().mockResolvedValue({});
      nodemailer.createTransport.mockReturnValue({ sendMail });
      process.env.EMAIL_HOST = 'smtp.test';
      process.env.EMAIL_PORT = '587';
      process.env.EMAIL_USERNAME = 'bot@test.com';
      process.env.EMAIL_PASSWORD = 'secret';

      await sendEmail({ email: 'a@test.com', subject: 'Hi', message: 'Hello' });
      await sendEmail({ email: 'b@test.com', subject: 'Yo', message: 'Sup' });

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith({
        from: 'BioBeats Support <bot@test.com>',
        to: 'a@test.com',
        subject: 'Hi',
        text: 'Hello',
      });
      expect(sendMail).toHaveBeenCalledWith({
        from: 'BioBeats Support <bot@test.com>',
        to: 'b@test.com',
        subject: 'Yo',
        text: 'Sup',
      });
    });
  });

  describe('queueProducer', () => {
    test('initializes queue setup', async () => {
      const channel = {
        assertExchange: jest.fn().mockResolvedValue(undefined),
        assertQueue: jest.fn().mockResolvedValue(undefined),
        bindQueue: jest.fn().mockResolvedValue(undefined),
      };
      await global.mockAmqpOptions.setup(channel);
      expect(channel.assertExchange).toHaveBeenCalled();
      expect(channel.assertQueue).toHaveBeenCalled();
      expect(channel.bindQueue).toHaveBeenCalled();
    });

    test('publishes a message successfully', async () => {
      global.mockChannelWrapper.sendToQueue.mockResolvedValue(true);
      await publishToQueue('test-queue', { trackId: 't1' });
      expect(global.mockChannelWrapper.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        { trackId: 't1' },
        { persistent: true }
      );
    });

    test('publishes with targetId and unknown id paths', async () => {
      global.mockChannelWrapper.sendToQueue.mockResolvedValue(true);
      await publishToQueue('test-queue', { targetId: 'x1' });
      await publishToQueue('test-queue', {});
      expect(global.mockChannelWrapper.sendToQueue).toHaveBeenCalledTimes(2);
    });

    test('throws AppError on publish failure', async () => {
      global.mockChannelWrapper.sendToQueue.mockRejectedValue(
        new Error('down')
      );
      await expect(
        publishToQueue('test-queue', { targetId: 'x1' })
      ).rejects.toThrow('Failed to publish processing message to queue.');
    });
  });

  describe('audioUtils', () => {
    test('returns zero waveform when no peaks', async () => {
      const { EventEmitter } = require('events');
      global.mockFfmpegStream = new EventEmitter();
      const waveformPromise = generateRealWaveform('in.wav', 3);
      global.mockFfmpegStream.emit('end');
      const waveform = await waveformPromise;
      expect(waveform).toEqual([0, 0, 0]);
    });

    test('normalizes waveform data', async () => {
      const { EventEmitter } = require('events');
      global.mockFfmpegStream = new EventEmitter();
      const waveformPromise = generateRealWaveform('in.wav', 2);
      const buf = Buffer.alloc(4);
      buf.writeInt16LE(100, 0);
      buf.writeInt16LE(300, 2);
      global.mockFfmpegStream.emit('data', buf);
      global.mockFfmpegStream.emit('end');
      const waveform = await waveformPromise;
      expect(waveform).toEqual([33, 100]);
    });

    test('rejects on ffmpeg error', async () => {
      const { EventEmitter } = require('events');
      global.mockFfmpegStream = new EventEmitter();
      const waveformPromise = generateRealWaveform('in.wav', 2);
      global.mockFfmpegErrorHandler(new Error('ffmpeg fail'));
      await expect(waveformPromise).rejects.toThrow('ffmpeg fail');
    });
  });

  describe('azureStorage', () => {
    test('throws when connection string is missing', async () => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
      await expect(
        uploadImageToAzure(Buffer.from('x'), 'a.jpg')
      ).rejects.toThrow('Azure Storage connection string is missing in .env');
    });

    test('uploads and returns URL', async () => {
      const containerClient = {
        createIfNotExists: jest.fn().mockResolvedValue(undefined),
        getBlockBlobClient: jest.fn(),
      };
      const blockBlobClient = {
        uploadData: jest.fn().mockResolvedValue(undefined),
        url: 'https://example.com/blob',
      };
      containerClient.getBlockBlobClient.mockReturnValue(blockBlobClient);
      BlobServiceClient.fromConnectionString.mockReturnValue({
        getContainerClient: jest.fn().mockReturnValue(containerClient),
      });

      process.env.AZURE_STORAGE_CONNECTION_STRING =
        'UseDevelopmentStorage=true';
      process.env.AZURE_CONTAINER_NAME = 'assets';
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

      const url = await uploadImageToAzure(
        Buffer.from('x'),
        'a.jpg',
        'artworks'
      );
      expect(url).toBe('https://example.com/blob');
      expect(containerClient.createIfNotExists).toHaveBeenCalledWith({
        access: 'blob',
      });
      expect(blockBlobClient.uploadData).toHaveBeenCalled();
      Date.now.mockRestore();
    });
  });
});
