const amqp = require('amqp-connection-manager');
const AppError = require('./appError');

// 1. Connection Manager with Built-in Exponential Backoff
const connection = amqp.connect([process.env.RABBITMQ_URL]);

connection.on('connect', () =>
  console.log('🔗 [Producer] RabbitMQ Connected!')
);
connection.on('disconnect', (err) =>
  console.log('⚠️ [Producer] RabbitMQ Disconnected.', err.err.message)
);

// 2. Managed Channel (Automatically recreates queues if server restarts)
const channelWrapper = connection.createChannel({
  json: true,
  setup: async function (channel) {
    // ==========================================
    // 1. AUDIO QUEUE SETUP
    // ==========================================
    const audioDlx = 'audio_dlx';
    const audioDlq = 'audio_dead_letter_queue';

    await channel.assertExchange(audioDlx, 'direct', { durable: true });
    await channel.assertQueue(audioDlq, { durable: true });
    await channel.bindQueue(audioDlq, audioDlx, 'failed_audio');

    const audioQueue = 'audio_processing_queue_v5';
    await channel.assertQueue(audioQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': audioDlx,
        'x-dead-letter-routing-key': 'failed_audio',
      },
    });

    // ==========================================
    // 2. FEED FAN-OUT QUEUE SETUP (NEW)
    // ==========================================
    const feedDlx = 'feed_dlx';
    const feedDlq = 'feed_dead_letter_queue';

    // Assert the Dead Letter Exchange and Queue for Feeds
    await channel.assertExchange(feedDlx, 'direct', { durable: true });
    await channel.assertQueue(feedDlq, { durable: true });
    await channel.bindQueue(feedDlq, feedDlx, 'failed_feed');

    // Assert the Main Feed Queue and link it to its DLX
    const feedQueue = 'feed_fanout_queue_v3';
    await channel.assertQueue(feedQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': feedDlx,
        'x-dead-letter-routing-key': 'failed_feed',
      },
    });

    return true; // Setup complete
  },
});

exports.publishToQueue = async (queueName, data) => {
  try {
    // If the connection drops, channelWrapper will BUFFER this message in memory
    // and send it automatically the second the connection is restored!
    await channelWrapper.sendToQueue(queueName, data, {
      persistent: true,
    });
    const entityId = data.trackId || data.targetId || 'Unknown ID';

    console.log(
      `🎫 [Producer] Ticket created in '${queueName}' for track: ${entityId}`
    );
  } catch (error) {
    console.error('❌ [Producer] Failed to publish message:', error);
    throw new AppError('Failed to publish processing message to queue.', 500);
  }
};
