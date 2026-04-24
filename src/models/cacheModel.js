const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed, // Allows us to store the massive array of tracks
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // 👈 This is the magic! MongoDB will auto-delete this document after 300 seconds (5 mins)
    expires: 300,
  },
});

module.exports = mongoose.model('Cache', cacheSchema);
