// src/services/notificationService.js
const Notification = require('../models/notificationModel');
const { getIo } = require('../sockets/socketSetup');
const User = require('../models/userModel'); // DEVELOPER D
const firebaseService = require('./firebaseService'); // DEVELOPER D
const AppError = require('../utils/appError');
const sendEmail = require('../utils/sendEmail');

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
  extraData = {},
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
        // Keep max 3 actors for the preview UI
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

    // ==========================================
    // 5. DEVELOPER D: PUSH NOTIFICATION & FILTERING
    // ==========================================
    const recipient = await User.findById(recipientId).select(
      'fcmTokens notificationSettings'
    );

    // If no user, or global push is disabled, or no devices are registered -> Abort Push
    // if (
    //   !recipient ||
    //   !recipient.notificationSettings?.pushEnabled ||
    //   !recipient.fcmTokens?.length
    // ) {
    //   return populatedNotification;
    // }

    if (!recipient) {
      return populatedNotification;
    }
    const settings = recipient.notificationSettings || {};

    if (settings.pushEnabled !== false && recipient.fcmTokens?.length) {
      const actorName =
        populatedNotification.actors[0]?.displayName || 'Someone';

      let pushTitle = '';
      let pushBody = '';
      let shouldPush = false;

      switch (type) {
        case 'LIKE':
          if (settings.allowLikes) {
            shouldPush = true;
            pushTitle = 'New Like';
            pushBody = `${actorName} liked your ${targetModel.toLowerCase()}`;
          }
          break;
        case 'REPOST':
          if (settings.allowReposts) {
            shouldPush = true;
            pushTitle = 'New Repost';
            pushBody = `${actorName} reposted your ${targetModel.toLowerCase()}`;
          }
          break;
        case 'COMMENT':
          if (settings.allowComments) {
            shouldPush = true;
            pushTitle = 'New Comment';
            pushBody = `${actorName} commented: "${contentSnippet}"`;
          }
          break;
        case 'FOLLOW':
          if (settings.allowFollows) {
            shouldPush = true;
            pushTitle = 'New Follower';
            pushBody = `${actorName} started following you`;
          }
          break;
        case 'MESSAGE':
          if (settings.allowMessages) {
            shouldPush = true;
            pushTitle = `Message from ${actorName}`;
            pushBody = contentSnippet;
          }
          break;
        case 'NEW_TRACK':
          if (settings.allowNewTracks) {
            shouldPush = true;
            pushTitle = 'New Track Alert';
            pushBody = `${actorName} just uploaded a new track!`;
          }
          break;
        case 'NEW_PLAYLIST':
          if (settings.allowNewTracks !== false) {
            shouldPush = true;
            pushTitle = 'New Playlist Alert';
            pushBody = `${actorName} just released a new playlist!`;
          }
          break;
        case 'RECOMMENDED':
          if (settings.allowRecommended !== false) {
            shouldPush = true;
            pushTitle = 'Recommended for you';
            pushBody = contentSnippet || 'We found new tracks you might love!';
          }
          break;
        case 'MENTION':
          shouldPush = true;
          pushTitle = 'You were mentioned';
          pushBody = contentSnippet || 'Someone mentioned you in a comment';
          break;
        case 'SYSTEM':
          shouldPush = true;
          pushTitle = 'BioBeats Alert';
          pushBody = contentSnippet || 'You have a new system notification';
          break;
      }
      if (shouldPush) {
        await firebaseService.sendPushNotification(
          recipient.fcmTokens,
          pushTitle,
          pushBody,
          {
            notificationId: populatedNotification._id.toString(),
            type: type,
            targetId: targetId ? targetId.toString() : '',
            ...extraData,
          }
        );
      }
    }
    const emailMap = {
      LIKE: 'emailLikes',
      REPOST: 'emailReposts',
      COMMENT: 'emailComments',
      FOLLOW: 'emailFollows',
      MESSAGE: 'emailMessages',
      NEW_TRACK: 'emailNewTracks',
      NEW_PLAYLIST: 'emailNewTracks',
      RECOMMENDED: 'emailRecommended',

      MENTION: null, // no email for mentions
      SYSTEM: null, // system emails handled separately (admin broadcast)
    };

    const emailSettingKey = emailMap[type];
    const shouldEmail = emailSettingKey
      ? settings[emailSettingKey] !== false
      : false;

    if (shouldEmail) {
      const recipientUser =
        await User.findById(recipientId).select('email displayName');
      if (recipientUser && recipientUser.email) {
        // Build email subject & message per type
        const actorName =
          populatedNotification.actors[0]?.displayName || 'Someone';

        let emailSubject = '';
        let emailMessage = '';

        switch (type) {
          case 'LIKE':
            emailSubject = 'Someone liked your track on BioBeats';
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} liked your ${targetModel.toLowerCase()}.\n\nCheck it out on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'REPOST':
            emailSubject = 'Someone reposted your track on BioBeats';
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} reposted your ${targetModel.toLowerCase()}.\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'COMMENT':
            emailSubject = 'New comment on your track';
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} commented: "${contentSnippet}"\n\nReply on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'FOLLOW':
            emailSubject = 'You have a new follower on BioBeats';
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} started following you.\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'MESSAGE':
            emailSubject = `New message from ${actorName}`;
            emailMessage = `Hi ${recipientUser.displayName},\n\nYou have a new message from ${actorName}:\n\nReply on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'NEW_TRACK':
            emailSubject = `${actorName} just uploaded a new track`;
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} just uploaded a new track. Check it out on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'NEW_PLAYLIST':
            emailSubject = `${actorName} just released a new playlist`;
            emailMessage = `Hi ${recipientUser.displayName},\n\n${actorName} just released a new playlist. Check it out on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
          case 'RECOMMENDED':
            emailSubject = 'New tracks recommended for you on BioBeats';
            emailMessage = `Hi ${recipientUser.displayName},\n\nWe found some new tracks we think you'll love based on your listening history.\n\nCheck them out on BioBeats!\n\nRegards,\nThe BioBeats Team`;
            break;
        }

        if (emailSubject) {
          try {
            await sendEmail({
              email: recipientUser.email,
              subject: emailSubject,
              message: emailMessage,
            });
            console.log(
              `[Notification Email] Sent ${type} email to ${recipientUser.email}`
            );
          } catch (emailError) {
            console.error('[Notification Email Error]', emailError.message);
          }
        }
      }
    }

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
    .populate('actors', 'displayName avatarUrl permalink isPremium')
    .populate('target', 'title permalink artworkUrl');

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
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  if (!notification) return null;
  if (notification.isRead) return notification;

  notification.isRead = true;
  await notification.save();

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
  messageText,
  conversationId
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
    extraData: { conversationId: conversationId.toString() },
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

exports.notifyRecommended = async (userId, trackIds = []) => {
  try {
    const trackList = trackIds.slice(0, 3); // show max 3 track titles
    const snippet =
      trackList.length > 0
        ? `Check out these new tracks we picked for you!`
        : `We found new tracks you might love!`;

    const notification = await Notification.create({
      recipient: userId,
      type: 'RECOMMENDED',
      actors: [],
      actorCount: 0,
      target: trackList[0] || null,
      targetModel: trackList[0] ? 'Track' : null,
      contentSnippet: snippet,
      isRead: false,
    });

    // emit socket
    emitRealTimeNotification(userId, notification);

    // check email preference
    const recipient = await User.findById(userId).select(
      'email displayName notificationSettings'
    );

    if (
      recipient &&
      recipient.notificationSettings?.emailRecommended !== false &&
      recipient.email
    ) {
      try {
        await sendEmail({
          email: recipient.email,
          subject: 'New tracks recommended for you on BioBeats',
          message: `Hi ${recipient.displayName},\n\nWe found some new tracks we think you'll love based on your listening history.\n\nCheck them out on BioBeats!\n\nRegards,\nThe BioBeats Team`,
        });
        console.log(`[Recommendation Email] Sent to ${recipient.email}`);
      } catch (emailError) {
        console.error('[Recommendation Email Error]', emailError.message);
      }
    }

    return notification;
  } catch (error) {
    console.error(
      '[Notification Service] Failed to create RECOMMENDED notification:',
      error
    );
    return null;
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

exports.addFcmToken = async (userId, token) => {
  await User.findByIdAndUpdate(userId, {
    $addToSet: { fcmTokens: token },
  });
};

exports.removeFcmToken = async (userId, token) => {
  await User.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: token },
  });
};

exports.updatePreferences = async (userId, preferences) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const allowedFields = [
    'pushEnabled',
    'allowLikes',
    'allowReposts',
    'allowComments',
    'allowFollows',
    'allowMessages',
    'allowNewTracks',
    'allowRecommended',
    'emailLikes',
    'emailReposts',
    'emailComments',
    'emailFollows',
    'emailMessages',
    'emailNewTracks',
    'emailRecommended',
    'messagePermission',
  ];

  allowedFields.forEach((field) => {
    if (preferences[field] !== undefined) {
      user.notificationSettings[field] = preferences[field];
    }
  });

  await user.save({ validateModifiedOnly: true });
  return user.notificationSettings;
};

exports.getPreferences = async (userId) => {
  const user = await User.findById(userId).select('notificationSettings');
  if (!user) throw new AppError('User not found', 404);
  return user.notificationSettings;
};
