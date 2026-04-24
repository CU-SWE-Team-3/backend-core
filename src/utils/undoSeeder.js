require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');

// Import all models the seeder touched
const User = require('../models/userModel');
const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Follow = require('../models/followModel');
const FeedItem = require('../models/feedItemModel');

const undoRecentSeeds = async () => {
  try {
    const DB = process.env.DATABASE.replace(
      '<db_password>',
      process.env.DATABASE_PASSWORD
    );

    await mongoose.connect(DB);
    console.log('DB Connected. Finding items created in the last 48 hours...');

    // 1. Calculate the exact real-world time for 48 hours ago
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // 2. Generate a MongoDB ObjectId based on that exact second
    // This ignores faked dates and looks at when it was ACTUALLY inserted
    const objectId48HoursAgo = mongoose.Types.ObjectId.createFromTime(
      Math.floor(fortyEightHoursAgo.getTime() / 1000)
    );

    // 3. The magic query: Find anything with an ID generated after that time
    const query = { _id: { $gte: objectId48HoursAgo } };

    // 4. Delete them across all affected collections
    const deletedFeeds = await FeedItem.deleteMany(query);
    const deletedInteractions = await Interaction.deleteMany(query);
    const deletedTracks = await Track.deleteMany(query);
    const deletedFollows = await Follow.deleteMany(query);
    const deletedUsers = await User.deleteMany(query);

    console.log(`✅ Deleted ${deletedFeeds.deletedCount} Feed Items`);
    console.log(`✅ Deleted ${deletedInteractions.deletedCount} Interactions`);
    console.log(`✅ Deleted ${deletedTracks.deletedCount} Tracks`);
    console.log(`✅ Deleted ${deletedFollows.deletedCount} Follows`);
    console.log(`✅ Deleted ${deletedUsers.deletedCount} Users`);

    console.log('🎉 48-Hour Cleanup Complete!');
    process.exit();
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
};

undoRecentSeeds();
