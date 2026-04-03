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
    // Setup Dead-Letter Exchange & Queue
    const dlx = 'audio_dlx';
    const dlq = 'audio_dead_letter_queue';

    await channel.assertExchange(dlx, 'direct', { durable: true });
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, dlx, 'failed_audio');

    // Setup Main Queue and link it to the DLX
    const queueName = 'audio_processing_queue_v2';
    return channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlx,
        'x-dead-letter-routing-key': 'failed_audio',
      },
    });
  },
});

exports.publishToQueue = async (queueName, data) => {
  try {
    // If the connection drops, channelWrapper will BUFFER this message in memory
    // and send it automatically the second the connection is restored!
    await channelWrapper.sendToQueue(queueName, data, {
      persistent: true,
    });

    console.log(
      `🎫 [Producer] Ticket created in '${queueName}' for track: ${data.trackId}`
    );
  } catch (error) {
    console.error('❌ [Producer] Failed to publish message:', error);
    throw new AppError('Failed to publish processing message to queue.', 500);
  }
};
