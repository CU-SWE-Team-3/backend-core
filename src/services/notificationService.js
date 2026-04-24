// src/services/notificationService.js
const Notification = require('../models/notificationModel');
const { getIo } = require('../sockets/socketSetup');

/**
 * Helper to emit events via Socket.IO.
 */
const emitRealTimeNotification = (recipientId, notificationDoc) => {
  try {
    const io = getIo();
    io.to(`user_${recipientId.toString()}`).emit(
      'new_notification',
      notificationDoc
    );
  } catch (error) {
    // Socket not initialized or user offline, gracefully skip
  }
};

/**
 * Core function to process, group, and create notifications
 */
const processNotification = async ({
  recipientId,
  actorId,
  type,
  targetId,
  targetModel,
  contentSnippet = null,
}) => {
  // Prevent self-notification (e.g., liking your own track)
  if (recipientId.toString() === actorId.toString()) return null;

  try {
    // 1. FIND & GROUP EXISTING NOTIFICATIONS
    let notification = await Notification.findOne({
      recipient: recipientId,
      target: targetId,
      type,
      isRead: false,
    });

    if (notification) {
      const actorAlreadyIncluded = notification.actors.some(
        (existingActorId) => existingActorId.toString() === actorId.toString()
      );

      if (!actorAlreadyIncluded) {
        notification.actorCount += 1;
        notification.actors.unshift(actorId);
        // Keep max 3 actors for the preview UI (e.g., "User A, User B, and 2 others")
        if (notification.actors.length > 3) notification.actors.pop();
        await notification.save();
      }
    } else {
      // 2. CREATE NEW NOTIFICATION
      notification = await Notification.create({
        recipient: recipientId,
        actors: [actorId],
        actorCount: 1,
        type,
        target: targetId,
        targetModel,
        contentSnippet,
      });
    }

    // 3. POPULATE DATA FOR FRONTEND
    const populatedNotification = await Notification.findById(notification._id)
      .populate('actors', 'displayName avatarUrl')
      .populate('target', 'title permalink');

    // 4. EMIT VIA WEBSOCKETS
    emitRealTimeNotification(recipientId, populatedNotification);

    return populatedNotification;
  } catch (error) {
    console.error('[Notification Service Error]', error);
    return null;
  }
};

// ==========================================
// DATA FETCHING LOGIC
// ==========================================

exports.getUserNotifications = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const notifications = await Notification.find({ recipient: userId })
    .sort('-updatedAt')
    .skip(skip)
    .limit(limit)
    .populate('actors', 'displayName avatarUrl permalink')
    .populate('target', 'title permalink');

  const total = await Notification.countDocuments({ recipient: userId });

  return {
    notifications,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};

exports.getUnreadCount = async (userId) =>
  await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

// ==========================================
// STATE MANAGEMENT & SOCKET SYNC
// ==========================================

exports.markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true } }
  );

  // Sync across all user's devices
  try {
    const io = getIo();
    io.to(`user_${userId.toString()}`).emit('all_notifications_read');
  } catch (err) {
    console.warn(
      `[Socket Warning] Could not emit 'all_notifications_read': ${err.message}`
    );
  }

  return result.modifiedCount;
};

exports.markOneAsRead = async (userId, notificationId) => {
  // 1. Find the notification first
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  // 2. If it doesn't exist, return null so the controller can throw a 404
  if (!notification) return null;

  // 3. If it is ALREADY read, just return it. Do NOT save to DB or emit socket.
  if (notification.isRead) {
    return notification;
  }

  // 4. If it was unread, update it and save
  notification.isRead = true;
  await notification.save();

  // 5. Emit the socket event ONLY because the state actually changed
  try {
    const io = getIo();
    io.to(`user_${userId.toString()}`).emit('notification_read', {
      notificationId: notification._id,
    });
  } catch (err) {
    console.warn(
      `[Socket Warning] Could not emit 'notification_read': ${err.message}`
    );
  }

  return notification;
};

exports.deleteNotification = async (userId, notificationId) => {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: userId,
  });

  if (notification) {
    try {
      const io = getIo();
      io.to(`user_${userId.toString()}`).emit('notification_deleted', {
        notificationId: notification._id,
      });
    } catch (err) {
      console.warn(
        `[Socket Warning] Could not emit 'notification_deleted': ${err.message}`
      );
    }
  }

  return notification;
};

// ==========================================
// STANDARD TRIGGERS
// ==========================================

// Defaults to 'Track' just to be safe, but the other dev is passing it dynamically now
exports.notifyLike = async (
  ownerId,
  likerId,
  targetId,
  targetModel = 'Track'
) =>
  processNotification({
    recipientId: ownerId,
    actorId: likerId,
    type: 'LIKE',
    targetId,
    targetModel,
  });

exports.notifyRepost = async (
  ownerId,
  reposterId,
  targetId,
  targetModel = 'Track'
) =>
  processNotification({
    recipientId: ownerId,
    actorId: reposterId,
    type: 'REPOST',
    targetId,
    targetModel,
  });

exports.notifyFollow = async (followedUserId, followerId) =>
  processNotification({
    recipientId: followedUserId,
    actorId: followerId,
    type: 'FOLLOW',
    targetId: followerId,
    targetModel: 'User',
  });

exports.notifyComment = async (
  trackOwnerId,
  commenterId,
  trackId,
  commentText
) => {
  const safeCommentText = commentText || '';
  const snippet =
    safeCommentText.length > 50
      ? `${safeCommentText.substring(0, 47)}...`
      : safeCommentText;

  return processNotification({
    recipientId: trackOwnerId,
    actorId: commenterId,
    type: 'COMMENT',
    targetId: trackId,
    targetModel: 'Track',
    contentSnippet: snippet,
  });
};

exports.notifyNewTrack = async (followerId, artistId, trackId) =>
  processNotification({
    recipientId: followerId,
    actorId: artistId,
    type: 'NEW_TRACK',
    targetId: trackId,
    targetModel: 'Track',
  });

exports.notifyMessage = async (
  recipientId,
  senderId,
  messageId,
  messageText
) => {
  const safeMessageText = messageText || '';
  const snippet =
    safeMessageText.length > 50
      ? `${safeMessageText.substring(0, 47)}...`
      : safeMessageText;

  return processNotification({
    recipientId,
    actorId: senderId,
    type: 'MESSAGE',
    targetId: messageId,
    targetModel: 'Message',
    contentSnippet: snippet,
  });
};

// ==========================================
// UNIQUE TRIGGERS
// ==========================================

exports.notifyNewPlaylist = async (recipientId, actorId, playlistId) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    const notification = await Notification.create({
      recipient: recipientId,
      type: 'NEW_PLAYLIST',
      actors: [actorId],
      actorCount: 1,
      target: playlistId,
      targetModel: 'Playlist',
      isRead: false,
    });

    emitRealTimeNotification(recipientId, notification);
  } catch (error) {
    console.error(
      '[Notification Service] Failed to create NEW_PLAYLIST notification:',
      error
    );
  }
};

exports.notifyMention = async (recipientId, actorId, trackId) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    const notification = await Notification.create({
      recipient: recipientId,
      type: 'MENTION',
      actors: [actorId],
      actorCount: 1,
      target: trackId,
      targetModel: 'Track',
      isRead: false,
    });

    emitRealTimeNotification(recipientId, notification);
  } catch (error) {
    console.error(
      '[Notification Service] Failed to create MENTION notification:',
      error
    );
  }
};

exports.notifySystem = async (recipientId, messageText, actionLink = null) => {
  try {
    const notificationPayload = {
      recipient: recipientId,
      type: 'SYSTEM',
      actors: [],
      actorCount: 0,
      contentSnippet: messageText,
      isRead: false,
      ...(actionLink && { actionLink }),
    };

    const notification = await Notification.create(notificationPayload);

    emitRealTimeNotification(recipientId, notification);
  } catch (error) {
    console.error(
      '[Notification Service] Failed to create SYSTEM notification:',
      error
    );
  }
};

// ==========================================
// UNDO LOGIC
// ==========================================

exports.retractNotification = async (recipientId, actorId, type, targetId) => {
  try {
    const notification = await Notification.findOne({
      recipient: recipientId,
      target: targetId,
      type: type,
    });

    if (notification) {
      notification.actors = notification.actors.filter(
        (id) => id.toString() !== actorId.toString()
      );
      notification.actorCount = Math.max(0, notification.actorCount - 1);

      if (notification.actorCount === 0) {
        await Notification.findByIdAndDelete(notification._id);

        try {
          const io = getIo();
          io.to(`user_${recipientId.toString()}`).emit('notification_deleted', {
            notificationId: notification._id,
          });
        } catch (err) {
          console.warn(
            `[Socket Warning] Could not emit 'notification_deleted': ${err.message}`
          );
        }
      } else {
        await notification.save();
      }
    }
  } catch (error) {
    console.error(
      `[Notification Service] Failed to retract ${type} notification:`,
      error
    );
  }
};
