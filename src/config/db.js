const mongoose = require('mongoose');

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
    // 3. Handle connection errors gracefully
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1); // Stop the server if the database fails to connect
  }
};

module.exports = connectDB;
