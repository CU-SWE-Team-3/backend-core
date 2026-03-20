require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { generateRealWaveform } = require('../utils/audioUtils'); // <-- ADD THIS
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');

if (!global.crypto) {
  global.crypto = require('node:crypto').webcrypto;
}
console.log('🛠️ Crypto polyfill loaded. Worker ready.');

// 1. Connect to Database (Worker needs its own connection)

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
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  const queueName = 'audio_processing_queue';
  await channel.assertQueue(queueName, { durable: true });
  channel.prefetch(1);
  console.log(`🎧 [Worker] Listening for tasks in '${queueName}'...`);
  channel.consume(
    queueName,
    async (msg) => {
      if (msg !== null) {
        const ticket = JSON.parse(msg.content.toString());
        console.log(`\n📥 [Worker] Processing Track ID: ${ticket.trackId}`);

        // Setup temporary folders for processing
        const tempDir = path.join(
          __dirname,
          '../../temp_audio',
          ticket.trackId
        );
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const inputPath = path.join(tempDir, 'input.mp3');
        const outputDir = path.join(tempDir, 'hls');
        if (!fs.existsSync(outputDir))
          fs.mkdirSync(outputDir, { recursive: true });
        try {
          // Initialize Azure Client once to use for both Download and Upload!
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );

          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_CONTAINER_NAME
          );

          // 1. Download the MP3 from Azure USING THE AZURE SDK (Bypasses security blocks)
          console.log(`⏳ [1/4] Downloading audio from Azure via SDK...`);

          const originalBlobName = ticket.audioUrl.split('/').pop(); // Gets 'track-12345.mp3' from the URL
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

          // 2. Get real duration using FFprobe (wrapped in a promise)
          const realDurationSeconds = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
              if (err) {
                console.error('Failed to probe audio:', err);
                reject(err);
              } else {
                resolve(Math.round(metadata.format.duration)); // Round to nearest second
              }
            });
          });

          // 2. FFmpeg HLS Transcoding
          console.log(`⏳ [2/4] Transcoding to HLS...`);

          const m3u8Path = path.join(outputDir, 'playlist.m3u8');
          await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
              .outputOptions([
                '-vn', // Strip album art
                '-c:a aac', // Force AAC codec
                '-b:a 128k', // 128k bitrate
                '-hls_time 10', // 10 second chunks
                '-hls_list_size 0', // Put all chunks in the playlist
                '-f hls', // Format as HLS
              ])
              .output(m3u8Path)
              .on('end', () => resolve())
              .on('error', (err, stdout, stderr) => {
                console.error('\n🔥 [FFmpeg Error]:', stderr);
                reject(err);
              })
              .run();
          });

          // 3. UPLOAD TO AZURE BLOB STORAGE
          console.log(`⏳ [3/4] Uploading HLS chunks to Azure...`);
          // Read all the files FFmpeg just created
          const hlsFiles = fs.readdirSync(outputDir);
          const uploadedUrls = await Promise.all(
            hlsFiles.map(async (file) => {
              const filePath = path.join(outputDir, file);
              const blobName = `hls/${ticket.trackId}/${file}`; // Puts them in a neat folder on Azure
              const blockBlobClient =
                containerClient.getBlockBlobClient(blobName);

              // CRITICAL: Set the correct Content-Type for the browser
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

          // 4. Update MongoDB & Clean up Server Hard Drive
          console.log(`⏳ [4/4] Updating Database and Cleaning up...`);

          const waveformData = await generateRealWaveform(inputPath);
          await Track.findByIdAndUpdate(ticket.trackId, {
            processingState: 'Finished',
            size: realSizeBytes,
            hlsUrl: finalHlsUrl, // The frontend will now play THIS url!
            duration: realDurationSeconds, // Overwrite the client's guess!
            waveform: waveformData,
          });

          // Delete the temporary local files so your server doesn't run out of storage
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(
            `✅ [Worker] SUCCESS! Track ${ticket.trackId} is fully processed and on Azure.`
          );
          channel.ack(msg);
        } catch (error) {
          const appError = new AppError(
            `[Worker] Failed to process track ${ticket.trackId}: ${error.message}`,
            500
          );
          console.error('❌', appError.message);

          // Clean up temp files even if it fails
          if (fs.existsSync(tempDir))
            fs.rmSync(tempDir, { recursive: true, force: true });

          channel.ack(msg);
        }
      }
    },
    { noAck: false }
  );
};

startWorker().catch((error) => {
  const appError = new AppError(
    `[Worker] Fatal startup error: ${error.message}`,
    500
  );
  console.error('❌', appError.message);
  process.exit(1);
});
