// eslint-disable-next-line import/no-extraneous-dependencies
require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

const User = require('../models/userModel');
const Track = require('../models/trackModel');
const Interaction = require('../models/interactionModel');
const Follow = require('../models/followModel');
const FeedItem = require('../models/feedItemModel');

const seedDB = async () => {
  try {
    const DB = process.env.DATABASE.replace(
      '<db_password>',
      process.env.DATABASE_PASSWORD
    );
    await mongoose.connect(DB);
    console.log('DB Connected. Starting Seeder...');

    const feedItems = [];

    // 1. Create Users
    const users = await Promise.all(
      Array.from({ length: 20 }).map((_, i) =>
        User.create({
          displayName: faker.person.fullName(),
          email: faker.internet.email(),
          password: 'Password123!',
          role: i < 10 ? 'Artist' : 'Listener',
          isVerified: true,
          permalink:
            faker.internet.username().toLowerCase() +
            faker.string.alphanumeric(4),
          lastActiveAt: faker.date.recent({ days: 3 }),
        })
      )
    );
    console.log('✅ 20 Users Created');

    // 2. Create Follows
    const allFollows = await Follow.find();
    const followersMap = {};
    users.forEach((u) => (followersMap[u._id.toString()] = []));
    allFollows.forEach((f) => {
      if (followersMap[f.following.toString()]) {
        followersMap[f.following.toString()].push(f.follower);
      }
    });
    console.log('✅ Follows Mapped');

    // 3. Create Tracks & Fan-Out to Feed (UPDATED FOR DEV A)
    const tracks = [];
    const artists = users.filter((u) => u.role === 'Artist');
    const genres = ['Pop', 'Rock', 'Electronic', 'Hiphop & rap', 'Classical'];

    const createdTracks = await Promise.all(
      artists.map((artist) =>
        Promise.all(
          Array.from({ length: 3 }).map(async () => {
            // 🚨 UPDATE 1: 30-Day Spread for Dev A's Gravity Algorithm
            const trackDate = faker.date.recent({ days: 30 });

            // 🚨 EXTRACT COUNTS TO CALCULATE VIRAL SCORE
            const playCount = faker.number.int({ min: 10, max: 500 });
            const likeCount = faker.number.int({ min: 5, max: 100 });
            const repostCount = faker.number.int({ min: 0, max: 20 });
            const commentCount = faker.number.int({ min: 0, max: 10 });

            // 🚨 CALCULATE VIRAL SCORE (Play: 1, Comment: 2, Like: 3, Repost: 10)
            const viralScore =
              playCount + commentCount * 2 + likeCount * 3 + repostCount * 10;

            const track = await Track.create({
              title: faker.music.songName(),
              artist: artist._id,
              genre: faker.helpers.arrayElement(genres),
              tags: [faker.word.sample(), faker.word.sample()],
              isPublic: true, // 🚨 Required by Dev A
              processingState: 'Finished', // 🚨 Required by Dev A
              releaseDate: trackDate, // 🚨 New Field required by Dev A
              createdAt: trackDate,
              playCount,
              likeCount,
              repostCount,
              commentCount,
              viralScore, // 🚨 INJECTING VIRAL SCORE FOR TRENDING CACHE
              size: 5000000,
              format: 'audio/mpeg',
              // 🚨 BONUS: 10% chance to be a promoted "Ad" track!
              isPromoted: faker.datatype.boolean({ probability: 0.1 }),
            });

            const followers = followersMap[artist._id.toString()] || [];
            followers.forEach((followerId) => {
              feedItems.push({
                ownerId: followerId,
                actorId: artist._id,
                activityType: 'TRACK_UPLOAD',
                targetId: track._id, // 🚨 UPDATE 2: Polymorphic Field
                targetModel: 'Track', // 🚨 UPDATE 2: Polymorphic Field
                activityDate: trackDate,
              });
            });

            return track;
          })
        )
      )
    );

    tracks.push(...createdTracks.flat());
    console.log(`✅ ${tracks.length} Tracks Created with Viral Scores`);

    // 4. Create Interactions & Fan-Out to Feed (UPDATED FOR DEV A)
    await Promise.all(
      Array.from({ length: 50 }).map(async () => {
        const randomUser = faker.helpers.arrayElement(users);
        const randomTrack = faker.helpers.arrayElement(tracks);
        const interactionDate = faker.date.recent({ days: 7 });
        const actionType = faker.helpers.arrayElement(['LIKE', 'REPOST']);

        try {
          const interaction = await Interaction.create({
            actorId: randomUser._id,
            targetId: randomTrack._id,
            targetType: 'Track',
            actionType: actionType,
            createdAt: interactionDate,
          });

          const followers = followersMap[randomUser._id.toString()] || [];
          followers.forEach((followerId) => {
            feedItems.push({
              ownerId: followerId,
              actorId: randomUser._id,
              activityType: actionType,
              targetId: randomTrack._id, // 🚨 Polymorphic Update
              targetModel: 'Track', // 🚨 Polymorphic Update
              activityDate: interactionDate,
            });
          });

          return interaction;
        } catch (err) {
          if (err.code === 11000) return null;
          throw err;
        }
      })
    );
    console.log('✅ 50 Engagements Created');

    // 5. Bulk Insert Pre-Computed Feed Items
    if (feedItems.length > 0) {
      await FeedItem.insertMany(feedItems);
      console.log(
        `✅ ${feedItems.length} Feed Items Pushed (Fan-Out Complete)`
      );
    }

    console.log('🎉 Seeding Complete!');
    process.exit();
  } catch (err) {
    console.error('Seeding Error:', err);
    process.exit(1);
  }
};

seedDB();
