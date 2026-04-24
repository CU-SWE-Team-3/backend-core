require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const amqp = require('amqp-connection-manager');
const mongoose = require('mongoose');
const Follow = require('../models/followModel');
const FeedItem = require('../models/feedItemModel');
const User = require('../models/userModel');

// Connect to DB
mongoose
  .connect(
    process.env.DATABASE.replace('<db_password>', process.env.DATABASE_PASSWORD)
  )
  .then(() => console.log('📦 [Feed Worker] Connected to MongoDB'));

const startWorker = async () => {
  const connection = amqp.connect([process.env.RABBITMQ_URL]);
  connection.on('connect', () =>
    console.log('📦 [Feed Worker] RabbitMQ Connected!')
  );

  connection.createChannel({
    setup: async function (channel) {
      const queueName = 'feed_fanout_queue_v3';
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          // 👈 ADD THESE TO MATCH THE PRODUCER
          'x-dead-letter-exchange': 'feed_dlx',
          'x-dead-letter-routing-key': 'failed_feed',
        },
      });
      channel.prefetch(5);

      console.log(
        `📡 [Feed Worker] Listening for fan-out tasks in '${queueName}'...`
      );

      await channel.consume(queueName, async (msg) => {
        if (msg !== null) {
          const task = JSON.parse(msg.content.toString());

          try {
            // Only find followers active in the last 14 days
            const fourteenDaysAgo = new Date(
              Date.now() - 14 * 24 * 60 * 60 * 1000
            );

            const followers = await Follow.find({ following: task.actorId })
              .select('follower')
              .lean();
            const followerIds = followers.map((f) => f.follower);

            const activeFollowers = await User.find({
              _id: { $in: followerIds },
              lastActiveAt: { $gte: fourteenDaysAgo },
            })
              .select('_id')
              .lean();

            if (activeFollowers.length > 0) {
              const feedPayloads = activeFollowers.map((user) => ({
                ownerId: user._id,
                actorId: task.actorId,
                activityType: task.activityType,
                targetId: task.targetId || task.trackId,
                targetModel: task.targetModel || 'Track',
                activityDate: new Date(),
              }));

              await FeedItem.insertMany(feedPayloads, { ordered: false });
              console.log(
                `✅ [Feed Worker] Fanned out ${task.activityType} to ${activeFollowers.length} active users.`
              );
            }

            channel.ack(msg);
          } catch (error) {
            console.error('❌ [Feed Worker] Fan-out failed:', error.message);
            channel.nack(msg, false, false);
          }
        }
      });
    },
  });
};

startWorker();
