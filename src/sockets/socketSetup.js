const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');

const connectedUsers = new Map();
let io;

const initializeSockets = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      // 1. Grab the raw input
      const rawToken =
        socket.handshake.auth?.token || socket.handshake.headers?.authorization;

      if (!rawToken) {
        console.error(
          '[SOCKET AUTH] No token found in handshake.auth or headers'
        );
        return next(new Error('Authentication error: No token provided'));
      }

      // 2. Case-insensitive "Bearer " stripping (Fixes 'bearer' vs 'Bearer')
      // This regex removes "Bearer " regardless of case or extra spaces
      const token = rawToken.replace(/^Bearer\s+/i, '');

      // 3. Verify with the secret
      // IMPORTANT: Ensure process.env.JWT_SECRET is identical to the one in your REST service
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4. Attach user
      socket.user = decoded;

      console.log(`[SOCKET AUTH] Success: User ${decoded.id} connected`);
      next();
    } catch (error) {
      // 5. CRITICAL: Log the EXACT error so you can see if it's 'invalid signature' or 'jwt malformed'
      console.error(
        `[SOCKET AUTH ERROR]: ${error.message} | Token snippet: ${socket.handshake.auth?.token?.substring(0, 10)}...`
      );

      // Return the actual error message to the mobile team so they can debug their side
      return next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id}`);
    connectedUsers.set(socket.user.id, socket.id);
    socket.join(`user_${socket.user.id}`);

    // ==========================================
    // OFFLINE TO ONLINE: AUTO-DELIVERY SWEEP
    // ==========================================
    (async () => {
      try {
        const userId = socket.user.id;

        // 1. Find all conversations this user is part of
        const userConversations = await Conversation.find({
          participants: userId,
        });
        const conversationIds = userConversations.map((c) => c._id);

        // 2. Upgrade all 'sent' messages addressed to THIS user to 'delivered'
        const result = await Message.updateMany(
          {
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            status: 'sent',
          },
          { $set: { status: 'delivered' } }
        );

        if (result.modifiedCount > 0) {
          console.log(
            `[SOCKET] Upgraded ${result.modifiedCount} offline messages to 'delivered' for User ${userId}`
          );

          // Optional: You can notify the senders that their messages were just delivered!
          // This requires fetching those messages to group them by sender, which you can add later if needed.
        }
      } catch (error) {
        console.error(
          '[SOCKET] Error updating offline messages to delivered:',
          error
        );
      }
    })();

    // to handle the case when a user has been offline and has received messages, we want to mark those messages as 'delivered' as soon as they come online. This way, the sender gets accurate delivery status updates.
    socket.on('join_chat', ({ conversationId }) => {
      // Join a unique room specifically for this conversation
      socket.join(`chat_${conversationId}`);
      console.log(`User ${socket.user.id} opened chat ${conversationId}`);
    });

    socket.on('leave_chat', ({ conversationId }) => {
      // Leave the room when they close the chat
      socket.leave(`chat_${conversationId}`);
      console.log(`User ${socket.user.id} closed chat ${conversationId}`);
    });
    // ==========================================
    // FULL IMPLEMENTATION: MARK AS READ
    // ==========================================

    socket.on('mark_as_delivered', async ({ conversationId }) => {
      try {
        const userId = socket.user.id;
        console.log(
          `[SOCKET] User ${userId} received messages for convo ${conversationId}`
        );

        // 1. Bulk update all 'sent' messages from the other person to 'delivered'
        const updateResult = await Message.updateMany(
          {
            conversationId: conversationId,
            senderId: { $ne: userId },
            status: 'sent', // Only upgrade 'sent' messages
          },
          {
            $set: { status: 'delivered' },
          }
        );

        // 2. If messages were actually updated, emit an event back to the SENDER
        // so their UI shows the double grey checkmarks instantly
        if (updateResult.modifiedCount > 0) {
          const conversation = await Conversation.findById(conversationId);

          if (conversation) {
            const otherParticipantId = conversation.participants.find(
              (p) => p.toString() !== userId.toString()
            );

            if (otherParticipantId) {
              const otherSocketId = connectedUsers.get(
                otherParticipantId.toString()
              );

              // If the sender is online, shoot them the 'delivered' event
              if (otherSocketId) {
                io.to(otherSocketId).emit('messages_delivered', {
                  conversationId: conversationId,
                  deliveredAt: new Date(),
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Socket error in mark_as_delivered:', error);
        socket.emit('error', {
          message: 'Failed to mark messages as delivered',
        });
      }
    });

    socket.on('typing', ({ receiverId }) => {
      // Wrap receiverId in String() to prevent MongoDB operator injection
      const safeReceiverId = String(receiverId);
      const receiverSocketId = connectedUsers.get(safeReceiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user_typing', {
          senderId: socket.user.id,
        });
      }
    });

    socket.on('stop_typing', ({ receiverId }) => {
      const safeReceiverId = String(receiverId);
      const receiverSocketId = connectedUsers.get(safeReceiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user_stopped_typing', {
          senderId: socket.user.id,
        });
      }
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.user.id);
      console.log(`User disconnected: ${socket.user.id}`);
    });
  });

  return io;
};
const getIo = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
};

module.exports = { initializeSockets, connectedUsers, getIo };
