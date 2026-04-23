// src/services/notificationService.js

const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { getIo } = require('../sockets/socketSetup');

/**
 * Helper to emit events via Socket.IO.
 */
const emitRealTimeNotification = (recipientId, notificationDoc) => {
  try {
    const io = getIo();
    // Use your exact room naming convention: 'user_ID'
    io.to(`user_${recipientId.toString()}`).emit(
      'new_notification',
      notificationDoc
    );
  } catch (error) {
    // If socket isn't initialized yet or user is offline, just skip gracefully
  }
};

/**
 * Core function to process, group, and create notifications
 * while respecting user preferences.
 */
const processNotification = async ({
  recipientId,
  actorId,
  type,
  targetId,
  targetModel,
  contentSnippet = null,
  preferenceKey = null, // The specific setting to check in the user's preferences
}) => {
  // 1. Prevent self-notification
  if (recipientId.toString() === actorId.toString()) {
    return null;
  }

  try {
    // 2. CHECK USER PREFERENCES
    if (preferenceKey) {
      const recipient = await User.findById(recipientId).select(
        'notificationPreferences'
      );
      if (
        recipient &&
        recipient.notificationPreferences &&
        recipient.notificationPreferences[preferenceKey] === false
      ) {
        return null; // Abort: The user has turned off this type of notification!
      }
    }

    // 3. Find if there's an existing unread notification to group with
    let notification = await Notification.findOne({
      recipient: recipientId,
      target: targetId,
      type,
      isRead: false,
    });

    // 4. Grouping Logic
    if (notification) {
      const actorAlreadyIncluded = notification.actors.some(
        (existingActorId) => existingActorId.toString() === actorId.toString()
      );

      if (!actorAlreadyIncluded) {
        notification.actorCount += 1;
        notification.actors.unshift(actorId);

        // Keep a maximum of 3 avatars to display (e.g., "User A, User B, and 5 others")
        if (notification.actors.length > 3) {
          notification.actors.pop();
        }

        await notification.save();
      }
    } else {
      // 5. Create New Notification
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

    // 6. Populate data for the frontend
    const populatedNotification = await Notification.findById(notification._id)
      .populate('actors', 'displayName avatarUrl')
      .populate('target', 'title permalink');

    // 7. Emit via WebSockets
    emitRealTimeNotification(recipientId, populatedNotification);

    return populatedNotification;
  } catch (error) {
    const err = new Error(`Failed to process ${type} notification.`);
    err.statusCode = 500;
    err.originalError = error;

    // eslint-disable-next-line no-console
    console.error('[Notification Service Error]', err);
    return null;
  }
};

// ==========================================
// STANDARD TRIGGERS (Using processNotification)
// ==========================================

exports.notifyLike = async (trackOwnerId, likerId, targetId, targetModel) =>
  processNotification({
    recipientId: trackOwnerId,
    actorId: likerId,
    type: 'LIKE',
    targetId: targetId,
    targetModel: targetModel, // Or 'Playlist' dynamically if needed
    preferenceKey: 'likes',
  });

exports.notifyRepost = async (
  trackOwnerId,
  reposterId,
  targetId,
  targetModel
) =>
  processNotification({
    recipientId: trackOwnerId,
    actorId: reposterId,
    type: 'REPOST',
    targetId: targetId,
    targetModel: targetModel,
    preferenceKey: 'reposts',
  });

exports.notifyFollow = async (followedUserId, followerId) =>
  processNotification({
    recipientId: followedUserId,
    actorId: followerId,
    type: 'FOLLOW',
    targetId: followerId,
    targetModel: 'User',
    preferenceKey: 'newFollowers',
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
    preferenceKey: 'comments',
  });
};

exports.notifyNewTrack = async (followerId, artistId, trackId) =>
  processNotification({
    recipientId: followerId,
    actorId: artistId,
    type: 'NEW_TRACK',
    targetId: trackId,
    targetModel: 'Track',
    preferenceKey: 'newTracks',
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
    preferenceKey: 'messages',
  });
};

// ==========================================
// UNIQUE TRIGGERS (Custom logic)
// ==========================================

/**
 * Notifies a user that someone they follow created a new playlist
 */
exports.notifyNewPlaylist = async (recipientId, actorId, playlistId) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    // Preference Check (Grouped with newTracks)
    const recipient = await User.findById(recipientId).select(
      'notificationPreferences'
    );
    if (
      recipient &&
      recipient.notificationPreferences &&
      recipient.notificationPreferences.newTracks === false
    ) {
      return;
    }

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
    // eslint-disable-next-line no-console
    console.error(
      '[Notification Service] Failed to create NEW_PLAYLIST notification:',
      error
    );
  }
};

/**
 * Notifies a user when they are mentioned (@username) in a comment
 */
exports.notifyMention = async (recipientId, actorId, trackId) => {
  try {
    if (recipientId.toString() === actorId.toString()) return;

    // Preference Check
    const recipient = await User.findById(recipientId).select(
      'notificationPreferences'
    );
    if (
      recipient &&
      recipient.notificationPreferences &&
      recipient.notificationPreferences.mentions === false
    ) {
      return;
    }

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
    // eslint-disable-next-line no-console
    console.error(
      '[Notification Service] Failed to create MENTION notification:',
      error
    );
  }
};
/**
 * Sends a system-wide broadcast or algorithmic recommendation to a specific user.
 * Example usage: notifySystem(userId, "SoundCloud Weekly: New tracks for you!");
 */
/**
 * Sends a system-wide broadcast or algorithmic recommendation to a specific user.
 */
exports.notifySystem = async (recipientId, messageText, actionLink = null) => {
  try {
    // Build the base notification object
    const notificationPayload = {
      recipient: recipientId,
      type: 'SYSTEM',
      actors: [],
      actorCount: 0,
      contentSnippet: messageText,
      isRead: false,
    };

    // Use the actionLink if it was provided!
    if (actionLink) {
      notificationPayload.actionLink = actionLink;
    }

    const notification = await Notification.create(notificationPayload);

    try {
      const io = getIo();
      io.to(`user_${recipientId.toString()}`).emit(
        'new_notification',
        notification
      );
    } catch (socketError) {
      // User is offline
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[Notification Service] Failed to create SYSTEM notification:',
      error
    );
  }
};
// ==========================================
// UNDO LOGIC (Data Cleanup)
// ==========================================

/**
 * Removes notifications when an action is undone (e.g. Unliked, Unfollowed)
 */
exports.retractNotification = async (recipientId, actorId, type, targetId) => {
  try {
    const notification = await Notification.findOne({
      recipient: recipientId,
      target: targetId,
      type: type,
    });

    if (notification) {
      // Remove the actor who undid their action
      notification.actors = notification.actors.filter(
        (id) => id.toString() !== actorId.toString()
      );
      notification.actorCount = Math.max(0, notification.actorCount - 1);

      // If no one else is in this notification, delete it entirely
      if (notification.actorCount === 0) {
        await Notification.findByIdAndDelete(notification._id);
      } else {
        await notification.save();
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[Notification Service] Failed to retract ${type} notification:`,
      error
    );
  }
};
