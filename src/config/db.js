const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const connectDB = async () => {
  try {
    // 1. Construct the connection string using environment variables
    const DB = process.env.DATABASE.replace(
      '<db_password>',
      process.env.DATABASE_PASSWORD
    );

    // 2. Connect to MongoDB
    await mongoose.connect(DB);
    console.log('✅ Connected to MongoDB successfully.');
  } catch (error) {
    const appError = new AppError(
      `MongoDB connection error: ${error.message}`,
      500
    );
    console.error('❌', appError.message);
    process.exit(1); // Stop the server if the database fails to connect
  }
};

module.exports = connectDB;
