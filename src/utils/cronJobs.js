const cron = require('node-cron');
const Track = require('../models/trackModel');
const AppError = require('./appError');
const User = require('../models/userModel');
const discoveryService = require('../services/discoveryService');
const notificationService = require('../services/notificationService');

const startCronJobs = () => {
  // --------------------------------------------------------
  // 1. Abandoned Track Cleanup Cron (Runs daily at Midnight)
  // --------------------------------------------------------
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily cleanup for abandoned track uploads...');
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Track.deleteMany({
        processingState: 'Processing',
        createdAt: { $lt: oneDayAgo },
      });
      if (result.deletedCount > 0) {
        console.log(
          `[Cron] Successfully deleted ${result.deletedCount} abandoned track records.`
        );
      }
    } catch (error) {
      const appError = new AppError(
        'Failed to clean up abandoned tracks.',
        500
      );
      console.error('[Cron Error]', appError.message, error);
    }
  });

  // --------------------------------------------------------
  // 2. Subscription Expiry Cron (Runs daily at 1:00 AM)
  // --------------------------------------------------------
  cron.schedule('0 1 * * *', async () => {
    try {
      const now = new Date();
      const expiredUsers = await User.updateMany(
        {
          isPremium: true,
          cancelAtPeriodEnd: true,
          subscriptionExpiresAt: { $lte: now },
        },
        {
          $set: {
            isPremium: false,
            subscriptionPlan: 'Free',
            mockStripeId: null,
            subscriptionExpiresAt: null,
            cancelAtPeriodEnd: false,
          },
        }
      );
      if (expiredUsers.modifiedCount > 0) {
        console.log(
          `[Cron] Demoted ${expiredUsers.modifiedCount} expired premium subscriptions.`
        );
      }
    } catch (error) {
      console.error(
        '[Cron Error] Failed to process subscription expirations:',
        error
      );
    }
  });

  cron.schedule('0 * * * *', async () => {
    console.log('📉 Applying Gravity to Viral Scores...');

    try {
      // Multiply every track's viral score by 0.95 (A 5% decay every hour)
      await Track.updateMany(
        { viralScore: { $gt: 0.1 } }, // Only update tracks that have a score
        { $mul: { viralScore: 0.95 } }
      );
    } catch (error) {
      console.error('Gravity Job Failed:', error);
    }
  });
  cron.schedule('0 10 * * 5', async () => {
    console.log('[Cron] Starting Weekly Recommendations blast...');
    try {
      const users = await User.find({
        'notificationSettings.emailRecommended': { $ne: false },
      }).select('_id');

      let sentCount = 0;
      const batchSize = 50;

      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        // We intentionally await in this loop to process batches sequentially.
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(
          batch.map(async (user) => {
            const tracks = await discoveryService.getRecommendedBasedOnLikes(
              user._id
            );

            if (tracks && tracks.length > 0) {
              const trackIds = tracks.slice(0, 3).map((t) => t._id);
              await notificationService.notifyRecommended(user._id, trackIds);
              return true;
            }
            return false;
          })
        );

        sentCount += results.filter(Boolean).length;
      }

      console.log(`[Cron] Weekly recommendations sent to ${sentCount} users.`);
    } catch (error) {
      console.error(
        '[Cron Error] Failed to process weekly recommendations:',
        error
      );
    }
  });
};

// Export the single function that starts both jobs
module.exports = startCronJobs;
