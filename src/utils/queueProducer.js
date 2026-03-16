const amqp = require('amqplib');

exports.publishToQueue = async (queueName, data) => {
  try {
    // 1. Connect to your CloudAMQP server
    const connection = await amqp.connect(process.env.RABBITMQ_URL);

    // 2. Create a "channel" (the pathway for messages)
    const channel = await connection.createChannel();

    // 3. Ensure the queue exists before sending.
    // durable: true means the queue survives even if CloudAMQP restarts.
    await channel.assertQueue(queueName, {
      durable: true,
    });

    // 4. Convert our JSON data to a Buffer and drop it in the bucket
    // persistent: true means the message itself survives a crash.
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), {
      persistent: true,
    });

    console.log(
      `🎫 [RabbitMQ] Ticket created in '${queueName}' for track: ${data.trackId}`
    );

    // 5. Close the connection a split second later to prevent memory leaks
    setTimeout(() => {
      channel.close();
      connection.close();
    }, 500);
  } catch (error) {
    console.error('❌ [RabbitMQ Error] Failed to publish message:', error);
  }
};
