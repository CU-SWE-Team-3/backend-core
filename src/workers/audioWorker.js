require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const amqp = require('amqp-connection-manager');
const mongoose = require('mongoose');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { generateRealWaveform } = require('../utils/audioUtils');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');

if (!global.crypto) {
  global.crypto = require('node:crypto').webcrypto;
}
console.log('🛠️ Crypto polyfill loaded. Worker ready.');

// 1. Connect to Database
mongoose
  .connect(
    process.env.DATABASE.replace('<db_password>', process.env.DATABASE_PASSWORD)
  )
  .then(() => console.log('📦 [Worker] Connected to MongoDB'))
  .catch((err) => {
    const appError = new AppError(
      `[Worker] DB Connection Error: ${err.message}`,
      500
    );
    console.error('❌', appError.message);
    process.exit(1);
  });

const startWorker = async () => {
  // 1. Connection Manager (Handles Exponential Backoff Reconnects automatically)
  const connection = amqp.connect([process.env.RABBITMQ_URL]);

  connection.on('connect', () =>
    console.log('📦 [Worker] RabbitMQ Connected!')
  );
  connection.on('disconnect', (err) =>
    console.log('⚠️ [Worker] RabbitMQ Disconnected.', err.err.message)
  );

  // 2. Managed Channel with DLQ Architecture
  connection.createChannel({
    setup: async function (channel) {
      const dlx = 'audio_dlx';
      const dlq = 'audio_dead_letter_queue';

      // Assert the Dead Letter Exchange and Queue
      await channel.assertExchange(dlx, 'direct', { durable: true });
      await channel.assertQueue(dlq, { durable: true });
      await channel.bindQueue(dlq, dlx, 'failed_audio');

      // Assert Main Queue with Dead-Letter Arguments
      const queueName = 'audio_processing_queue_v2';
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': dlx,
          'x-dead-letter-routing-key': 'failed_audio',
        },
      });

      channel.prefetch(1);
      console.log(`🎧 [Worker] Listening for tasks in '${queueName}'...`);

      // 3. The Consumer Logic
      await channel.consume(queueName, async (msg) => {
        if (msg !== null) {
          const ticket = JSON.parse(msg.content.toString());
          console.log(`\n📥 [Worker] Processing Track ID: ${ticket.trackId}`);

          const tempDir = path.join(
            __dirname,
            '../../temp_audio',
            ticket.trackId
          );
          if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
          const inputPath = path.join(tempDir, 'input.mp3');
          const outputDir = path.join(tempDir, 'hls');
          if (!fs.existsSync(outputDir))
            fs.mkdirSync(outputDir, { recursive: true });

          try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(
              process.env.AZURE_STORAGE_CONNECTION_STRING
            );
            const containerClient = blobServiceClient.getContainerClient(
              process.env.AZURE_CONTAINER_NAME
            );

            console.log(`⏳ [1/4] Downloading audio from Azure via SDK...`);
            const originalBlobName = ticket.audioUrl.split('/').pop();
            const downloadBlobClient =
              containerClient.getBlobClient(originalBlobName);
            const downloadResponse = await downloadBlobClient.download(0);
            const writer = fs.createWriteStream(inputPath);
            downloadResponse.readableStreamBody.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            console.log(`⏳ [1.5/4] Extracting real duration...`);
            const stats = fs.statSync(inputPath);
            const realSizeBytes = stats.size;

            const realDurationSeconds = await new Promise((resolve, reject) => {
              ffmpeg.ffprobe(inputPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(Math.round(metadata.format.duration));
              });
            });

            console.log(`⏳ [2/4] Transcoding to HLS...`);
            const m3u8Path = path.join(outputDir, 'playlist.m3u8');
            await new Promise((resolve, reject) => {
              ffmpeg(inputPath)
                .outputOptions([
                  '-vn',
                  '-c:a aac',
                  '-b:a 128k',
                  '-hls_time 10',
                  '-hls_list_size 0',
                  '-f hls',
                ])
                .output(m3u8Path)
                .on('end', () => resolve())
                .on('error', (err, stdout, stderr) => {
                  console.error('\n🔥 [FFmpeg Error]:', stderr);
                  reject(err);
                })
                .run();
            });

            console.log(`⏳ [3/4] Uploading HLS chunks to Azure...`);
            const hlsFiles = fs.readdirSync(outputDir);
            const uploadedUrls = await Promise.all(
              hlsFiles.map(async (file) => {
                const filePath = path.join(outputDir, file);
                const blobName = `hls/${ticket.trackId}/${file}`;
                const blockBlobClient =
                  containerClient.getBlockBlobClient(blobName);

                let contentType = 'application/octet-stream';
                if (file.endsWith('.m3u8'))
                  contentType = 'application/vnd.apple.mpegurl';
                if (file.endsWith('.ts')) contentType = 'video/MP2T';

                await blockBlobClient.uploadFile(filePath, {
                  blobHTTPHeaders: { blobContentType: contentType },
                });
                return file.endsWith('.m3u8') ? blockBlobClient.url : '';
              })
            );
            const finalHlsUrl = uploadedUrls.find((url) => url) || '';

            console.log(`⏳ [4/4] Updating Database and Cleaning up...`);
            const waveformData = await generateRealWaveform(inputPath);
            await Track.findByIdAndUpdate(ticket.trackId, {
              processingState: 'Finished',
              size: realSizeBytes,
              hlsUrl: finalHlsUrl,
              duration: realDurationSeconds,
              waveform: waveformData,
            });

            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(
              `✅ [Worker] SUCCESS! Track ${ticket.trackId} is fully processed and on Azure.`
            );

            // Acknowledge success
            channel.ack(msg);
          } catch (error) {
            console.error(
              `❌ [Worker] Failed to process track ${ticket.trackId}: ${error.message}`
            );
            if (fs.existsSync(tempDir))
              fs.rmSync(tempDir, { recursive: true, force: true });

            // 🚨 DLQ Trigger: Rejects the message and routes it to the Dead Letter Queue
            channel.nack(msg, false, false);
          }
        }
      });
    },
  });
};

startWorker();
