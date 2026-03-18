// src/middlewares/upload.middleware.js
const multer = require('multer');
const AppError = require('../utils/appError');

// Storing in memory for now. We can add Cloudinary/S3 later.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only images are allowed.', 400), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter,
});

module.exports = upload;
