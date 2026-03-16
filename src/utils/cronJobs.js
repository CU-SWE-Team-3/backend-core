const cron = require('node-cron');
const Track = require('../models/trackModel');

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
      console.error('[Cron Error] Failed to clean up tracks:', error);
    }
  });
};

module.exports = startCronJobs;
