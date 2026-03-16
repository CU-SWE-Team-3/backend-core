/**
 * Generates a mock waveform array for audio visualization.
 * In a production environment, this would be replaced by a tool like ffmpeg
 * extracting actual peak data from the audio buffer.
 * * @param {number} dataPoints - The number of bars/peaks to generate (default: 150)
 * @returns {number[]} - An array of integers between 1 and 100
 */
exports.generateMockWaveform = (dataPoints = 150) => {
  const waveform = [];

  for (let i = 0; i < dataPoints; i += 1) {
    // Generate a random peak between 1 and 100
    // We add a bit of logic to make it look like a real song (tapered ends, dynamic middle)

    const min = 10;
    let max = 100;

    // Make the beginning and end of the track quieter (fade in/out effect)
    if (i < 15 || i > dataPoints - 15) {
      max = 40;
    }

    const peak = Math.floor(Math.random() * (max - min + 1)) + min;
    waveform.push(peak);
  }

  return waveform;
};
