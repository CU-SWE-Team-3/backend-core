const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    // ==========================================
    // 1. IDENTITY & AUTHENTICATION (BE-1 & BE-2)
    // ==========================================
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      // CRITICAL FOR BE-2: Password is NOT required if logging in via Google
      required: function () {
        return !this.googleId;
      },
      minlength: 8,
      select: false, // Security: Prevents password from being returned in standard queries
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple users to have a 'null' googleId without triggering a Unique constraint error
    },
    refreshToken: {
      type: String, // BE-2: Stores the long-lived JWT for session management
    },

    // ==========================================
    // 2. PROFILE & ASSETS (BE-3)
    // ==========================================
    permalink: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: ['Female', 'Male', 'Custom', 'Prefer not to say'],
    },
    location: { type: String, default: '' },
    bio: { type: String, default: '' },
    favoriteGenres: [{ type: String }],
    socialLinks: {
      instagram: { type: String, default: '' },
      twitter: { type: String, default: '' },
      website: { type: String, default: '' },
    },
    avatarUrl: {
      type: String,
      // default:
      //   'https://res.cloudinary.com/demo/image/upload/v1/default_avatar.png',
    },
    coverPhotoUrl: {
      type: String,
      // default:
      //   'https://res.cloudinary.com/demo/image/upload/v1/default_cover.jpg',
    },

    // ==========================================
    // 3. ROLES, PRIVACY & STATUS (BE-4)
    // ==========================================
    role: {
      type: String,
      enum: ['Artist', 'Listener', 'Admin'],
      default: 'Listener', // Users start as listeners and upgrade to Artist when they upload
    },
    isPrivate: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    accountStatus: {
      type: String,
      enum: ['Active', 'Suspended', 'Deleted'],
      default: 'Active',
    },

    // ==========================================
    // 4. SOCIAL GRAPH COUNTS (Module 3)
    // ==========================================
    followerCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// ==========================================
// MODEL MIDDLEWARE & METHODS
// ==========================================

// Pre-save hook: Hash the password before saving to the database
userSchema.pre('save', async function (next) {
  // Only hash if the password was modified AND exists (skips for Google OAuth users)
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Helper Method: Compare an entered password against the hashed DB password
userSchema.methods.matchPassword = async function (enteredPassword) {
  // We have to explicitly compare because 'select: false' hides it by default
  return await bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// SECURITY: Hide private data from JSON responses
// ==========================================
userSchema.methods.toJSON = function () {
  // Convert the Mongoose document into a plain JavaScript object
  const userObject = this.toObject();

  // Delete the fields we NEVER want to send to the frontend
  delete userObject.refreshToken;
  delete userObject.password; // Good to have if you add local email/pass login later
  delete userObject.__v; // Removes Mongoose's internal versioning field

  return userObject;
};

module.exports = mongoose.model('User', userSchema);
