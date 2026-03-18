const cron = require('node-cron');
const Track = require('../models/trackModel');
const AppError = require('./appError');

const startCronJobs = () => {
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
};

module.exports = startCronJobs;
