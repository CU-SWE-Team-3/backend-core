const ffmpeg = require('fluent-ffmpeg');

// -------------------------------------------------------------
// HELPER: Generate Real Waveform Data using FFmpeg & Node Streams
// -------------------------------------------------------------
const generateRealWaveform = (inputPath, numPoints = 150) =>
  new Promise((resolve, reject) => {
    const peaks = [];

    const ffstream = ffmpeg(inputPath)
      .format('s16le')
      .audioChannels(1)
      .audioFrequency(1000)
      .on('error', (err) => reject(err))
      .pipe();

    ffstream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length - 1; i += 2) {
        const sample = Math.abs(chunk.readInt16LE(i));
        peaks.push(sample);
      }
    });

    ffstream.on('end', () => {
      if (peaks.length === 0) return resolve(Array(numPoints).fill(0));

      const blockSize = Math.max(1, Math.floor(peaks.length / numPoints));
      const waveform = [];

      for (let i = 0; i < numPoints; i += 1) {
        let maxInBlock = 0;
        const startPos = i * blockSize;
        for (let j = 0; j < blockSize && startPos + j < peaks.length; j += 1) {
          if (peaks[startPos + j] > maxInBlock) {
            maxInBlock = peaks[startPos + j];
          }
        }
        waveform.push(maxInBlock);
      }

      const maxVolume = Math.max(...waveform) || 1;
      const normalizedWaveform = waveform.map((val) =>
        Math.floor((val / maxVolume) * 100)
      );

      resolve(normalizedWaveform);
    });
  });

// Export it so other files can use it!
module.exports = { generateRealWaveform };
