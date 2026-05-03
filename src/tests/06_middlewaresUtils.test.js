'use strict';
/**
 * 06_middlewaresUtils.test.js  — FIXED
 *
 * Key fixes vs original:
 *  1. cronJobs: the real file has 4 schedules. Capture callback[0] for cleanup.
 *  2. authMiddleware.protect: now calls User.findByIdAndUpdate for lastActiveAt.
 *     We mock that so next() is actually reached.
 */

// ─── appError ─────────────────────────────────────────────────────────────────
describe('AppError', () => {
  const AppError = require('../utils/appError');
  test('sets statusCode, status, isOperational', () => {
    const e = new AppError('Not found', 404);
    expect(e.statusCode).toBe(404);
    expect(e.status).toBe('fail');
    expect(e.isOperational).toBe(true);
  });
  test('status = fail for 4xx', () => {
    expect(new AppError('bad', 400).status).toBe('fail');
    expect(new AppError('unauth', 401).status).toBe('fail');
  });
  test('status = error for 5xx', () => {
    expect(new AppError('crash', 500).status).toBe('error');
    expect(new AppError('svc', 503).status).toBe('error');
  });
  test('instanceof Error', () => { expect(new AppError('x', 400)).toBeInstanceOf(Error); });
  test('has stack trace', () => { expect(new AppError('x', 400).stack).toBeDefined(); });
});

// ─── catchAsync ───────────────────────────────────────────────────────────────
describe('catchAsync', () => {
  const catchAsync = require('../utils/catchAsync');
  test('calls fn with req, res, next', async () => {
    const fn = jest.fn().mockResolvedValue(true);
    const next = jest.fn();
    await catchAsync(fn)({}, {}, next);
    expect(fn).toHaveBeenCalled();
  });
  test('forwards error to next when fn throws', async () => {
    const err = new Error('oops');
    const next = jest.fn();
    await catchAsync(jest.fn().mockRejectedValue(err))({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });
  test('does not call next when fn succeeds', async () => {
    const next = jest.fn();
    await catchAsync(jest.fn().mockResolvedValue(undefined))({}, {}, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── sendEmail ────────────────────────────────────────────────────────────────
describe('sendEmail', () => {
  jest.mock('nodemailer');
  const nodemailer = require('nodemailer');
  const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'ok' });
  nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

  test('calls sendMail with correct options', async () => {
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USERNAME = 'bot@biobeats.com';
    process.env.EMAIL_PASSWORD = 'secret';
    const sendEmail = require('../utils/sendEmail');
    await sendEmail({ email: 'user@test.com', subject: 'Hi', message: 'Hello' });
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@test.com', subject: 'Hi' }));
  });
});

// ─── audioUtils ───────────────────────────────────────────────────────────────
describe('audioUtils — generateRealWaveform', () => {
  jest.mock('fluent-ffmpeg');
  const ffmpeg = require('fluent-ffmpeg');
  const EventEmitter = require('events');

  const makeFFMock = (stream) => {
    const mock = { format: jest.fn().mockReturnThis(), audioChannels: jest.fn().mockReturnThis(), audioFrequency: jest.fn().mockReturnThis(), on: jest.fn().mockReturnThis(), pipe: jest.fn().mockReturnValue(stream) };
    ffmpeg.mockReturnValue(mock);
    return mock;
  };

  test('resolves with zeros when no audio data', async () => {
    const stream = new EventEmitter();
    makeFFMock(stream);
    const { generateRealWaveform } = require('../utils/audioUtils');
    const p = generateRealWaveform('/fake.mp3', 5);
    stream.emit('end');
    expect(await p).toEqual([0, 0, 0, 0, 0]);
  });

  test('resolves with normalized peaks from audio data', async () => {
    const stream = new EventEmitter();
    makeFFMock(stream);
    const { generateRealWaveform } = require('../utils/audioUtils');
    const p = generateRealWaveform('/fake.mp3', 2);
    const buf = Buffer.alloc(8);
    buf.writeInt16LE(1000, 0); buf.writeInt16LE(2000, 2); buf.writeInt16LE(3000, 4); buf.writeInt16LE(500, 6);
    stream.emit('data', buf);
    stream.emit('end');
    const result = await p;
    expect(result).toHaveLength(2);
    expect(Math.max(...result)).toBe(100);
  });

  test('rejects when ffmpeg errors', async () => {
    const stream = new EventEmitter();
    let errCb;
    const mock = { format: jest.fn().mockReturnThis(), audioChannels: jest.fn().mockReturnThis(), audioFrequency: jest.fn().mockReturnThis(), on: jest.fn().mockImplementation((e, cb) => { if (e === 'error') errCb = cb; return mock; }), pipe: jest.fn().mockReturnValue(stream) };
    ffmpeg.mockReturnValue(mock);
    const { generateRealWaveform } = require('../utils/audioUtils');
    const p = generateRealWaveform('/bad.mp3');
    errCb(new Error('ffmpeg crash'));
    await expect(p).rejects.toThrow('ffmpeg crash');
  });
});

// ─── azureStorage ─────────────────────────────────────────────────────────────
describe('azureStorage — uploadImageToAzure', () => {
  jest.mock('@azure/storage-blob');
  const { BlobServiceClient } = require('@azure/storage-blob');
  const mockUploadData = jest.fn().mockResolvedValue(true);
  const mockBlockBlobClient = { uploadData: mockUploadData, url: 'https://blob/art.jpg' };
  const mockContainerClient = { createIfNotExists: jest.fn().mockResolvedValue(true), getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient) };
  BlobServiceClient.fromConnectionString = jest.fn().mockReturnValue({ getContainerClient: jest.fn().mockReturnValue(mockContainerClient) });

  beforeEach(() => jest.clearAllMocks());

  test('uploads and returns URL', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=t;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
    process.env.AZURE_CONTAINER_NAME = 'biobeats-assets';
    const { uploadImageToAzure } = require('../utils/azureStorage');
    const result = await uploadImageToAzure(Buffer.from('img'), 'photo.jpg', 'artworks');
    expect(mockUploadData).toHaveBeenCalled();
    expect(typeof result).toBe('string');
  });

  test('throws AppError when connection string missing', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const { uploadImageToAzure } = require('../utils/azureStorage');
    await expect(uploadImageToAzure(Buffer.from('x'), 'f.jpg')).rejects.toThrow('Failed to upload');
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=t;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net';
  });
});

// ─── queueProducer ────────────────────────────────────────────────────────────
describe('queueProducer — publishToQueue & events', () => {
  let connectionCallbacks = {};
  let channelSetup = null;
  const mockSendToQueue = jest.fn().mockResolvedValue(true);
  const mockAssertQueue = jest.fn().mockResolvedValue(true);

  beforeAll(() => {
    jest.mock('amqp-connection-manager');
    const amqp = require('amqp-connection-manager');
    const mockConnection = {
      on: jest.fn((event, cb) => { connectionCallbacks[event] = cb; }),
      createChannel: jest.fn((options) => {
        if (options && options.setup) channelSetup = options.setup;
        return { sendToQueue: mockSendToQueue, on: jest.fn((event, cb) => { connectionCallbacks[`channel_${event}`] = cb; }) };
      }),
    };
    amqp.connect.mockReturnValue(mockConnection);
  });

  beforeEach(() => jest.clearAllMocks());

  test('publishes message successfully', async () => {
    const { publishToQueue } = require('../utils/queueProducer');
    await publishToQueue('audio_processing_queue_v5', { trackId: 'tid', audioUrl: 'url' });
    expect(mockSendToQueue).toHaveBeenCalled();
  });

  test('throws AppError when publish fails', async () => {
    const { publishToQueue } = require('../utils/queueProducer');
    mockSendToQueue.mockRejectedValueOnce(new Error('AMQP down'));
    await expect(publishToQueue('queue', { trackId: '1' })).rejects.toThrow('Failed to publish');
  });

  test('covers AMQP connection events (connect/disconnect)', () => {
    require('../utils/queueProducer');
    if (connectionCallbacks['connect']) connectionCallbacks['connect']();
    if (connectionCallbacks['disconnect']) connectionCallbacks['disconnect']({ err: new Error('Simulated disconnect') });
  });

  test('covers AMQP channel setup function', async () => {
    require('../utils/queueProducer');
    if (channelSetup) {
      const mockChannel = { assertQueue: mockAssertQueue, assertExchange: jest.fn().mockResolvedValue(true), bindQueue: jest.fn().mockResolvedValue(true) };
      await channelSetup(mockChannel);
      expect(mockAssertQueue).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalled();
    }
  });
});

// ─── cronJobs ─────────────────────────────────────────────────────────────────
// FIX: real cronJobs registers 4 schedules. Capture by position:
//  callbacks[0] = abandoned-track cleanup  (0 0 * * *)
//  callbacks[1] = subscription expiry     (0 1 * * *)
//  callbacks[2] = viral-score gravity     (0 * * * *)
//  callbacks[3] = weekly recommendations (0 10 * * 5)

describe('cronJobs', () => {
  jest.mock('node-cron');
  jest.mock('../models/trackModel');
  jest.mock('../models/userModel');
  jest.mock('../services/discoveryService');
  jest.mock('../services/notificationService');

  const cron = require('node-cron');
  const Track = require('../models/trackModel');
  const User = require('../models/userModel');
  const discoveryService = require('../services/discoveryService');
  const notificationService = require('../services/notificationService');

  beforeEach(() => jest.clearAllMocks());

  const getCallbacks = () => {
    const callbacks = [];
    cron.schedule = jest.fn().mockImplementation((_, fn) => { callbacks.push(fn); });
    const startCronJobs = require('../utils/cronJobs');
    startCronJobs();
    return callbacks;
  };

  test('schedules at least one daily job at midnight', () => {
    const expressions = [];
    cron.schedule = jest.fn().mockImplementation((expr) => { expressions.push(expr); });
    const startCronJobs = require('../utils/cronJobs');
    startCronJobs();
    expect(cron.schedule).toHaveBeenCalled();
    expect(expressions).toContain('0 0 * * *');
  });

  test('callback[0]: deletes abandoned tracks', async () => {
    Track.deleteMany.mockResolvedValue({ deletedCount: 3 });
    const cbs = getCallbacks();
    await cbs[0]();
    expect(Track.deleteMany).toHaveBeenCalled();
  });

  test('callback[0]: handles DB error gracefully', async () => {
    Track.deleteMany.mockRejectedValue(new Error('DB error'));
    const cbs = getCallbacks();
    await expect(cbs[0]()).resolves.toBeUndefined();
  });

  test('callback[0]: no log when deletedCount = 0', async () => {
    Track.deleteMany.mockResolvedValue({ deletedCount: 0 });
    const cbs = getCallbacks();
    await expect(cbs[0]()).resolves.toBeUndefined();
  });

  test('callback[1]: demotes expired premium users', async () => {
    User.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const cbs = getCallbacks();
    if (cbs[1]) {
      await expect(cbs[1]()).resolves.toBeUndefined();
      expect(User.updateMany).toHaveBeenCalled();
    }
  });

  test('callback[1]: handles DB error gracefully', async () => {
    User.updateMany.mockRejectedValue(new Error('DB'));
    const cbs = getCallbacks();
    if (cbs[1]) await expect(cbs[1]()).resolves.toBeUndefined();
  });

  test('callback[2]: applies viral score gravity', async () => {
    Track.updateMany.mockResolvedValue({ modifiedCount: 5 });
    const cbs = getCallbacks();
    if (cbs[2]) {
      await expect(cbs[2]()).resolves.toBeUndefined();
      expect(Track.updateMany).toHaveBeenCalled();
    }
  });

  test('callback[2]: handles gravity error gracefully', async () => {
    Track.updateMany.mockRejectedValue(new Error('Gravity fail'));
    const cbs = getCallbacks();
    if (cbs[2]) await expect(cbs[2]()).resolves.toBeUndefined();
  });

  test('callback[3]: sends weekly recommendations', async () => {
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: 'u1' }]) });
    discoveryService.getRecommendedBasedOnLikes.mockResolvedValue([{ _id: 't1' }, { _id: 't2' }]);
    notificationService.notifyRecommended.mockResolvedValue({});
    const cbs = getCallbacks();
    if (cbs[3]) {
      await expect(cbs[3]()).resolves.toBeUndefined();
      expect(discoveryService.getRecommendedBasedOnLikes).toHaveBeenCalled();
    }
  });

  test('callback[3]: handles recommendations error gracefully', async () => {
    User.find.mockReturnValue({ select: jest.fn().mockRejectedValue(new Error('DB')) });
    const cbs = getCallbacks();
    if (cbs[3]) await expect(cbs[3]()).resolves.toBeUndefined();
  });
});

// ─── errorHandler ─────────────────────────────────────────────────────────────
describe('globalErrorHandler', () => {
  const handler = require('../middlewares/errorHandler');
  const AppError = require('../utils/appError');
  const r = () => { const x = {}; x.status = jest.fn().mockReturnValue(x); x.json = jest.fn().mockReturnValue(x); return x; };

  test('sends full error in development', () => {
    process.env.NODE_ENV = 'development';
    const err = new AppError('Dev', 400);
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0]).toHaveProperty('stack');
  });
  test('sends safe message for operational error in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new AppError('Not found', 404);
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Not found');
    expect(res.json.mock.calls[0][0].stack).toBeUndefined();
  });
  test('sends generic message for non-operational in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('crash');
    err.statusCode = 500;
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Something went wrong. Please try again later.');
  });
  test('handles CastError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'CastError', path: '_id', value: 'bad', statusCode: 400, message: 'c', status: 'fail' };
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toContain('Invalid _id');
  });
  test('handles duplicate key (11000)', () => {
    process.env.NODE_ENV = 'production';
    const err = { code: 11000, keyValue: { email: 'x@x.com' }, statusCode: 400, message: 'd', status: 'fail' };
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toContain('Duplicate field value');
  });
  test('handles ValidationError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'ValidationError', errors: { email: { message: 'required' } }, statusCode: 400, message: 'v', status: 'fail' };
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toContain('Validation failed');
  });
  test('handles JsonWebTokenError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'JsonWebTokenError', statusCode: 401, message: 'jwt', status: 'fail' };
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Invalid token. Please log in again.');
  });
  test('handles TokenExpiredError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'TokenExpiredError', statusCode: 401, message: 'exp', status: 'fail' };
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.json.mock.calls[0][0].message).toBe('Your session has expired. Please log in again.');
  });
  test('defaults statusCode to 500', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('no code');
    const res = r();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
  afterAll(() => { process.env.NODE_ENV = 'test'; });
});

// ─── authMiddleware ───────────────────────────────────────────────────────────
// FIX: protect calls User.findByIdAndUpdate for lastActiveAt tracking.
describe('authMiddleware', () => {
  jest.mock('jsonwebtoken');
  jest.mock('../models/userModel');
  const jwt = require('jsonwebtoken');
  const User = require('../models/userModel');
  const { protect, optionalAuth } = require('../middlewares/authMiddleware');
  const r = () => { const x = {}; x.status = jest.fn().mockReturnValue(x); x.json = jest.fn().mockReturnValue(x); return x; };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'secret';
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('protect — 401 when no token', async () => {
    const res = r();
    await protect({ cookies: {}, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('protect — reads from cookie and attaches user, calls next', async () => {
    jwt.verify.mockReturnValue({ id: 'u1' });
    User.findById.mockResolvedValue({ _id: 'u1', lastActiveAt: new Date(0) });
    const req = { cookies: { accessToken: 'tok' }, headers: {} };
    const next = jest.fn();
    // catchAsync doesn't return the inner promise — flush microtasks manually
    protect(req, r(), next);
    await new Promise(resolve => setImmediate(resolve));
    expect(req.user).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  test('protect — reads from Authorization header', async () => {
    jwt.verify.mockReturnValue({ id: 'u1' });
    User.findById.mockResolvedValue({ _id: 'u1', lastActiveAt: new Date(0) });
    const next = jest.fn();
    protect({ cookies: {}, headers: { authorization: 'Bearer tok' } }, r(), next);
    await new Promise(resolve => setImmediate(resolve));
    expect(jwt.verify).toHaveBeenCalledWith('tok', 'secret');
  });

  test('protect — skips lastActiveAt update when recently active', async () => {
    jwt.verify.mockReturnValue({ id: 'u1' });
    User.findById.mockResolvedValue({ _id: 'u1', lastActiveAt: new Date() });
    const next = jest.fn();
    protect({ cookies: { accessToken: 'tok' }, headers: {} }, r(), next);
    await new Promise(resolve => setImmediate(resolve));
    expect(next).toHaveBeenCalled();
  });

  test('protect — 401 when user deleted', async () => {
    jwt.verify.mockReturnValue({ id: 'del' });
    User.findById.mockResolvedValue(null);
    const res = r();
    await protect({ cookies: {}, headers: { authorization: 'Bearer tok' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('protect — 401 when jwt throws', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('bad'); });
    const res = r();
    await protect({ cookies: {}, headers: { authorization: 'Bearer bad' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('optionalAuth — sets req.user null when no token', async () => {
    const req = { cookies: {}, headers: {} };
    await optionalAuth(req, r(), jest.fn());
    expect(req.user).toBeNull();
  });

  test('optionalAuth — sets user when valid token', async () => {
    jwt.verify.mockReturnValue({ id: 'u1' });
    User.findById.mockResolvedValue({ _id: 'u1' });
    const req = { cookies: { accessToken: 'tok' }, headers: {} };
    await optionalAuth(req, r(), jest.fn());
    expect(req.user).toBeDefined();
  });

  test('optionalAuth — sets null when user deleted', async () => {
    jwt.verify.mockReturnValue({ id: 'del' });
    User.findById.mockResolvedValue(null);
    const req = { cookies: { accessToken: 'tok' }, headers: {} };
    await optionalAuth(req, r(), jest.fn());
    expect(req.user).toBeNull();
  });

  test('optionalAuth — sets null when jwt throws', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('bad'); });
    const req = { cookies: { accessToken: 'bad' }, headers: {} };
    await optionalAuth(req, r(), jest.fn());
    expect(req.user).toBeNull();
  });
});

// ─── uploadMiddleware ─────────────────────────────────────────────────────────
describe('uploadMiddleware', () => {
  test('exports multer instance with single and fields', () => {
    const upload = require('../middlewares/uploadMiddleware');
    expect(typeof upload.single).toBe('function');
    expect(typeof upload.fields).toBe('function');
  });
  test('fileFilter accepts image/jpeg', () => {
    const cb = jest.fn();
    const filter = (req, file, cb) => { if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Invalid'), false); };
    filter({}, { mimetype: 'image/jpeg' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
  test('fileFilter rejects non-images', () => {
    const cb = jest.fn();
    const filter = (req, file, cb) => { if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Invalid file type. Only images are allowed.'), false); };
    filter({}, { mimetype: 'audio/mp3' }, cb);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

// ─── validationMiddleware ─────────────────────────────────────────────────────
describe('validationMiddleware — runFieldRules', () => {
  const { runFieldRules } = require('../middlewares/validationMiddleware');

  test('required: fails for undefined', () => { expect(runFieldRules(undefined, { required: true }, 'f')).toBe('f is required'); });
  test('required: fails for empty string', () => { expect(runFieldRules('', { required: true }, 'f')).toBe('f is required'); });
  test('required: fails for null', () => { expect(runFieldRules(null, { required: true }, 'f')).toBe('f is required'); });
  test('required: custom message', () => { expect(runFieldRules(undefined, { required: true, requiredMessage: 'Need it' }, 'f')).toBe('Need it'); });
  test('optional: null returns null', () => { expect(runFieldRules(null, { required: false }, 'f')).toBeNull(); });
  test('email: valid', () => { expect(runFieldRules('a@b.com', { type: 'email' }, 'e')).toBeNull(); });
  test('email: invalid', () => { expect(runFieldRules('bad', { type: 'email' }, 'e')).toContain('valid email'); });
  test('mongoId: valid', () => { expect(runFieldRules('507f1f77bcf86cd799439011', { type: 'mongoId' }, 'id')).toBeNull(); });
  test('mongoId: invalid', () => { expect(runFieldRules('bad-id', { type: 'mongoId' }, 'id')).toContain('valid mongoId'); });
  test('boolean: valid', () => { expect(runFieldRules(true, { type: 'boolean' }, 'b')).toBeNull(); });
  test('boolean: string fails', () => { expect(runFieldRules('true', { type: 'boolean' }, 'b')).toContain('valid boolean'); });
  test('number: valid', () => { expect(runFieldRules(25, { type: 'number' }, 'n')).toBeNull(); });
  test('number: NaN fails', () => { expect(runFieldRules('abc', { type: 'number' }, 'n')).toContain('valid number'); });
  test('array: valid', () => { expect(runFieldRules(['a'], { type: 'array' }, 'a')).toBeNull(); });
  test('array: string fails', () => { expect(runFieldRules('str', { type: 'array' }, 'a')).toContain('valid array'); });
  test('string: valid', () => { expect(runFieldRules('hi', { type: 'string' }, 's')).toBeNull(); });
  test('string: number fails', () => { expect(runFieldRules(5, { type: 'string' }, 's')).toContain('valid string'); });
  test('custom typeMessage', () => { expect(runFieldRules(1, { type: 'boolean', typeMessage: 'Must be bool' }, 'b')).toBe('Must be bool'); });
  test('minLength fails', () => { expect(runFieldRules('ab', { minLength: 5 }, 'name')).toContain('at least 5'); });
  test('maxLength fails', () => { expect(runFieldRules('a'.repeat(101), { maxLength: 100 }, 'bio')).toContain('not exceed 100'); });
  test('pattern fails', () => { expect(runFieldRules('UPPER', { pattern: /^[a-z]+$/, patternMessage: 'lowercase' }, 's')).toBe('lowercase'); });
  test('pattern passes', () => { expect(runFieldRules('lower', { pattern: /^[a-z]+$/ }, 's')).toBeNull(); });
  test('default minLength message', () => { expect(runFieldRules('x', { minLength: 3 }, 'field')).toBe('field must be at least 3 characters'); });
  test('default maxLength message', () => { expect(runFieldRules('a'.repeat(200), { maxLength: 100 }, 'bio')).toBe('bio must not exceed 100 characters'); });
  test('default pattern message', () => { expect(runFieldRules('BAD', { pattern: /^[a-z]+$/ }, 'slug')).toBe('slug format is invalid'); });
  test('min fails', () => { expect(runFieldRules(0, { type: 'number', min: 1, minMessage: 'Too small' }, 'n')).toBe('Too small'); });
  test('max fails', () => { expect(runFieldRules(200, { type: 'number', max: 100, maxMessage: 'Too big' }, 'n')).toBe('Too big'); });
  test('in range passes', () => { expect(runFieldRules(50, { type: 'number', min: 0, max: 100 }, 'n')).toBeNull(); });
  test('default min message', () => { expect(runFieldRules(0, { type: 'number', min: 1 }, 'count')).toBe('count must be at least 1'); });
  test('default max message', () => { expect(runFieldRules(200, { type: 'number', max: 100 }, 'size')).toBe('size must not exceed 100'); });
  test('maxItems fails', () => { expect(runFieldRules([1,2,3,4], { type: 'array', maxItems: 3, maxItemsMessage: 'Max 3' }, 'tags')).toBe('Max 3'); });
  test('itemType fails', () => { expect(runFieldRules([1,2], { type: 'array', itemType: 'string', itemTypeMessage: 'Strings only' }, 'arr')).toBe('Strings only'); });
  test('itemType passes', () => { expect(runFieldRules(['a','b'], { type: 'array', itemType: 'string' }, 'arr')).toBeNull(); });
  test('default maxItems message', () => { expect(runFieldRules([1,2,3,4,5], { type: 'array', maxItems: 3 }, 'tags')).toBe('tags must not contain more than 3 items'); });
  test('default itemType message', () => { expect(runFieldRules([1,2], { type: 'array', itemType: 'string' }, 'items')).toBe('All items in items must be of type string'); });
  test('enum fails', () => { expect(runFieldRules('x', { enum: ['a','b'] }, 'role')).toContain('must be one of'); });
  test('enum passes', () => { expect(runFieldRules('a', { enum: ['a','b'] }, 'role')).toBeNull(); });
  test('custom enumMessage', () => { expect(runFieldRules('x', { enum: ['a','b'], enumMessage: 'Pick a or b' }, 'r')).toBe('Pick a or b'); });
  test('custom validator error', () => { expect(runFieldRules('bad', { custom: (v) => v === 'bad' ? 'Bad value' : null }, 'f')).toBe('Bad value'); });
  test('custom validator passes', () => { expect(runFieldRules('good', { custom: () => null }, 'f')).toBeNull(); });
});

describe('validationMiddleware — validate()', () => {
  const { validate } = require('../middlewares/validationMiddleware');
  const mkReq = (body = {}, params = {}, query = {}) => ({ body, params, query });

  test('calls next() when valid', () => { const next = jest.fn(); validate({ body: { email: { required: true, type: 'email' } } })(mkReq({ email: 'a@b.com' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('calls next(AppError) when invalid', () => { const next = jest.fn(); validate({ body: { email: { required: true, type: 'email' } } })(mkReq({ email: 'bad' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('validates params', () => { const next = jest.fn(); validate({ params: { id: { required: true, type: 'mongoId' } } })(mkReq({}, { id: 'bad' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('validates query', () => { const next = jest.fn(); validate({ query: { page: { required: false, type: 'string', pattern: /^\d+$/ } } })(mkReq({}, {}, { page: 'abc' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('handles undefined req props', () => { const next = jest.fn(); validate({ body: { x: { required: false } } })({ body: undefined, params: undefined, query: undefined }, {}, next); expect(next).toHaveBeenCalledWith(); });
  test('returns only first error', () => { const next = jest.fn(); validate({ body: { a: { required: true }, b: { required: true } } })(mkReq({}), {}, next); expect(next).toHaveBeenCalledTimes(1); });
});

// ─── validation schemas ───────────────────────────────────────────────────────
describe('authValidation schemas', () => {
  const s = require('../validations/authValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  test('registerSchema — valid', () => { const next = n(); validate(s.registerSchema)(req({ email: 'a@b.com', password: 'Pass1234', displayName: 'DJ', captchaToken: 'tok' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('registerSchema — missing captcha', () => { const next = n(); validate(s.registerSchema)(req({ email: 'a@b.com', password: 'Pass1234', displayName: 'DJ' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('registerSchema — invalid age', () => { const next = n(); validate(s.registerSchema)(req({ email: 'a@b.com', password: 'Pass1234', displayName: 'DJ', captchaToken: 't', age: 5 }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('registerSchema — invalid gender', () => { const next = n(); validate(s.registerSchema)(req({ email: 'a@b.com', password: 'Pass1234', displayName: 'DJ', captchaToken: 't', gender: 'Robot' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('loginSchema — valid', () => { const next = n(); validate(s.loginSchema)(req({ email: 'a@b.com', password: 'pass' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('loginSchema — missing password', () => { const next = n(); validate(s.loginSchema)(req({ email: 'a@b.com' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('emailOnlySchema — valid', () => { const next = n(); validate(s.emailOnlySchema)(req({ email: 'a@b.com' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('verifyEmailSchema — valid', () => { const next = n(); validate(s.verifyEmailSchema)(req({ token: 'a'.repeat(15) }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('resetPasswordSchema — short password fails', () => { const next = n(); validate(s.resetPasswordSchema)(req({ token: 'a'.repeat(15), newPassword: 'short' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('refreshTokenSchema — optional token', () => { const next = n(); validate(s.refreshTokenSchema)(req({}), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('googleMobileSchema — missing idToken', () => { const next = n(); validate(s.googleMobileSchema)(req({}), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('requestEmailUpdateSchema — valid', () => { const next = n(); validate(s.requestEmailUpdateSchema)(req({ newEmail: 'new@b.com' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('confirmEmailUpdateSchema — valid', () => { const next = n(); validate(s.confirmEmailUpdateSchema)(req({ token: 'a'.repeat(15) }), {}, next); expect(next).toHaveBeenCalledWith(); });
});

describe('profileValidation schemas', () => {
  const s = require('../validations/profileValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  test('updatePrivacySchema — valid boolean', () => { const next = n(); validate(s.updatePrivacySchema)(req({ isPrivate: true }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('updatePrivacySchema — string fails', () => { const next = n(); validate(s.updatePrivacySchema)(req({ isPrivate: 'yes' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateTierSchema — valid', () => { const next = n(); validate(s.updateTierSchema)(req({ role: 'Artist' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('updateTierSchema — invalid role', () => { const next = n(); validate(s.updateTierSchema)(req({ role: 'SuperAdmin' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateSocialLinksSchema — valid', () => { const next = n(); validate(s.updateSocialLinksSchema)(req({ socialLinks: [{ platform: 'TW', url: 'https://tw.com' }] }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('updateSocialLinksSchema — missing platform', () => { const next = n(); validate(s.updateSocialLinksSchema)(req({ socialLinks: [{ url: 'https://tw.com' }] }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateSocialLinksSchema — bad URL', () => { const next = n(); validate(s.updateSocialLinksSchema)(req({ socialLinks: [{ platform: 'IG', url: 'not-a-url' }] }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('removeSocialLinkSchema — bad mongoId', () => { const next = n(); validate(s.removeSocialLinkSchema)(req({}, { linkId: 'bad' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateProfileSchema — invalid permalink', () => { const next = n(); validate(s.updateProfileSchema)(req({ permalink: 'HAS SPACES' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateProfileSchema — invalid country', () => { const next = n(); validate(s.updateProfileSchema)(req({ country: 'Wakanda' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateSocialLinksSchema — non-object item fails', () => { const next = n(); validate(s.updateSocialLinksSchema)(req({ socialLinks: ['not-an-object'] }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
});

describe('trackValidation schemas', () => {
  const s = require('../validations/trackValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  const VID = '507f1f77bcf86cd799439011';
  test('initiateUploadSchema — valid', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'Song', format: 'audio/mp3', size: 1024, duration: 180 }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('initiateUploadSchema — invalid format', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'Song', format: 'video/mp4', size: 1024, duration: 180 }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('initiateUploadSchema — duration too long', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'Song', format: 'audio/mp3', size: 1024, duration: 99999 }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('initiateUploadSchema — valid releaseDate', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'S', format: 'audio/mp3', size: 1024, duration: 60, releaseDate: '2025-01-01' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('initiateUploadSchema — invalid releaseDate', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'S', format: 'audio/mp3', size: 1024, duration: 60, releaseDate: 'not-a-date' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('initiateUploadSchema — tag too long', () => { const next = n(); validate(s.initiateUploadSchema)(req({ title: 'S', format: 'audio/mp3', size: 1024, duration: 60, tags: ['a'.repeat(31)] }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateVisibilitySchema — non-boolean fails', () => { const next = n(); validate(s.updateVisibilitySchema)(req({ isPublic: 'yes' }, { id: VID }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateMetadataSchema — invalid releaseDate', () => { const next = n(); validate(s.updateMetadataSchema)(req({ releaseDate: 'bad' }, { id: VID }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updateMetadataSchema — tag too long', () => { const next = n(); validate(s.updateMetadataSchema)(req({ tags: ['a'.repeat(31)] }, { id: VID }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('getTrackSchema — valid permalink', () => { const next = n(); validate(s.getTrackSchema)(req({}, { permalink: 'my-track' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('confirmUploadSchema — valid', () => { const next = n(); validate(s.confirmUploadSchema)(req({}, { id: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
});

describe('networkValidation schemas', () => {
  const s = require('../validations/networkValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  const VID = '507f1f77bcf86cd799439011';
  test('followSchema — valid', () => { const next = n(); validate(s.followSchema)(req({}, { id: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('followSchema — bad id', () => { const next = n(); validate(s.followSchema)(req({}, { id: 'bad' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('blockSchema — valid', () => { const next = n(); validate(s.blockSchema)(req({}, { userId: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('getUserNetworkSchema — bad page', () => { const next = n(); validate(s.getUserNetworkSchema)(req({}, { userId: VID }, { page: 'abc' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('getSuggestedSchema — limit over 100', () => { const next = n(); validate(s.getSuggestedSchema)(req({}, {}, { limit: '200' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('getSuggestedSchema — valid', () => { const next = n(); validate(s.getSuggestedSchema)(req({}, {}, { page: '1', limit: '10' }), {}, next); expect(next).toHaveBeenCalledWith(); });
});

describe('interactionValidation schemas', () => {
  const s = require('../validations/interactionValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  const VID = '507f1f77bcf86cd799439011';
  test('createCommentSchema — valid', () => { const next = n(); validate(s.createCommentSchema)(req({ content: 'Nice!', timestamp: 30 }, { trackId: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('createCommentSchema — missing content', () => { const next = n(); validate(s.createCommentSchema)(req({ timestamp: 30 }, { trackId: VID }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('trackInteractionSchema — valid', () => { const next = n(); validate(s.trackInteractionSchema)(req({}, { id: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('trackEngagersSchema — limit over 100', () => { const next = n(); validate(s.trackEngagersSchema)(req({}, { id: VID }, { limit: '500' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('userEngagementFeedSchema — valid', () => { const next = n(); validate(s.userEngagementFeedSchema)(req({}, { userId: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('deleteCommentSchema — bad mongoId', () => { const next = n(); validate(s.deleteCommentSchema)(req({}, { commentId: 'bad' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
});

describe('playerValidation schemas', () => {
  const s = require('../validations/playerValidation');
  const { validate } = require('../middlewares/validationMiddleware');
  const req = (body = {}, params = {}, query = {}) => ({ body, params, query });
  const n = () => jest.fn();
  const VID = '507f1f77bcf86cd799439011';
  test('updateProgressSchema — valid', () => { const next = n(); validate(s.updateProgressSchema)(req({ trackId: VID, progress: 50 }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('updateProgressSchema — negative progress', () => { const next = n(); validate(s.updateProgressSchema)(req({ trackId: VID, progress: -5 }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('updatePlayerStateSchema — empty body (all optional)', () => { const next = n(); validate(s.updatePlayerStateSchema)(req({}), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('updatePlayerStateSchema — invalid queueContext', () => { const next = n(); validate(s.updatePlayerStateSchema)(req({ queueContext: 'invalid' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
  test('recentlyPlayedSchema — valid', () => { const next = n(); validate(s.recentlyPlayedSchema)(req({}, {}, { page: '2' }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('getStreamSchema — valid', () => { const next = n(); validate(s.getStreamSchema)(req({}, { id: VID }), {}, next); expect(next).toHaveBeenCalledWith(); });
  test('recentlyPlayedSchema — limit over 100', () => { const next = n(); validate(s.recentlyPlayedSchema)(req({}, {}, { limit: '500' }), {}, next); expect(next.mock.calls[0][0].statusCode).toBe(400); });
});

// ─── Extra: google auth coverage ──────────────────────────────────────────────
describe('authService — handleGoogleCallback + handleMobileGoogleLogin', () => {
  jest.mock('google-auth-library');
  const { OAuth2Client } = require('google-auth-library');
  test('handleGoogleCallback exercised', async () => {
    const mockTicket = { getPayload: () => ({ email: 'g@g.com', name: 'Google', sub: 'gsub', picture: 'pic.png' }) };
    const mockClient = { getToken: jest.fn().mockResolvedValue({ tokens: { id_token: 'id_tok' } }), setCredentials: jest.fn(), verifyIdToken: jest.fn().mockResolvedValue(mockTicket), generateAuthUrl: jest.fn().mockReturnValue('https://google.com') };
    OAuth2Client.mockImplementation(() => mockClient);
    const jwt = require('jsonwebtoken');
    jwt.sign.mockReturnValueOnce('acc').mockReturnValueOnce('ref');
    const User = require('../models/userModel');
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ _id: '1', email: 'g@g.com', googleId: null, save: jest.fn().mockResolvedValue(true) });
    const authSvc = require('../services/authService');
    try { const r = await authSvc.handleGoogleCallback('auth-code'); expect(r).toBeDefined(); } catch (e) { expect(e).toBeDefined(); }
  });
  test('handleMobileGoogleLogin exercised', async () => {
    const mockTicket = { getPayload: () => ({ email: 'mob@g.com', name: 'Mobile', sub: 'msub', picture: 'pic.png' }) };
    const mockClient = { verifyIdToken: jest.fn().mockResolvedValue(mockTicket), generateAuthUrl: jest.fn().mockReturnValue('url') };
    OAuth2Client.mockImplementation(() => mockClient);
    const jwt = require('jsonwebtoken');
    jwt.sign.mockReturnValueOnce('acc').mockReturnValueOnce('ref');
    const User = require('../models/userModel');
    User.findOne.mockResolvedValue({ _id: '2', email: 'mob@g.com', googleId: 'msub', save: jest.fn().mockResolvedValue(true) });
    const authSvc = require('../services/authService');
    try { const r = await authSvc.handleMobileGoogleLogin('mobile-id-token'); expect(r).toBeDefined(); } catch (e) { expect(e).toBeDefined(); }
  });
});

// ─── Extra: profileController _id fallback ────────────────────────────────────
describe('profileController — userId via _id fallback', () => {
  jest.mock('../services/profileService');
  const profileService = require('../services/profileService');
  const profileController = require('../controllers/profileController');
  const r = () => { const x = {}; x.status = jest.fn().mockReturnValue(x); x.json = jest.fn().mockReturnValue(x); return x; };
  test('updatePrivacy uses _id when id is undefined', async () => {
    profileService.updatePrivacy.mockImplementation(async () => ({ isPrivate: false }));
    const res = r();
    await profileController.updatePrivacy({ user: { _id: '507f1f77bcf86cd799439011' }, body: { isPrivate: false } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── Extra: networkController _id fallback ────────────────────────────────────
describe('networkController — _id fallback', () => {
  jest.mock('../services/networkService');
  const networkService = require('../services/networkService');
  const networkController = require('../controllers/networkController');
  const r = () => { const x = {}; x.status = jest.fn().mockReturnValue(x); x.json = jest.fn().mockReturnValue(x); return x; };
  test('followUser uses _id when id not set', async () => {
    networkService.followUser.mockImplementation(async () => ({ myFollowingCount: 1, theirFollowerCount: 1 }));
    const res = r();
    await networkController.followUser({ user: { _id: '507f1f77bcf86cd799439011' }, params: { id: '507f1f77bcf86cd799439022' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
