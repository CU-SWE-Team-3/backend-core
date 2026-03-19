const amqp = require('amqplib');
const AppError = require('./appError');

// 1. Create a global variable outside the function
let globalChannel = null;

exports.publishToQueue = async (queueName, data) => {
  try {
    // 2. Only create a connection if one doesn't exist yet
    if (!globalChannel) {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      globalChannel = await connection.createChannel();

      await globalChannel.assertQueue(queueName, {
        durable: true,
      });
      console.log('🔗 [RabbitMQ] Connection opened and ready.');
    }

    // 3. Send the ticket
    globalChannel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), {
      persistent: true,
    });

    console.log(
      `🎫 [RabbitMQ] Ticket created in '${queueName}' for track: ${data.trackId}`
    );

    // 4. WE REMOVED THE SETTIMEOUT!
    // Do not close the connection. Leave it open for the next track.
  } catch (error) {
    console.error('❌ [RabbitMQ Error] Failed to publish message:', error);
    throw new AppError('Failed to publish processing message to queue.', 500);
  }
};
