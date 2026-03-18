const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const slug = require('mongoose-slug-updater');

mongoose.plugin(slug);
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
      required: function () {
        return !this.googleId;
      },
      minlength: 8,
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    refreshToken: {
      type: String,
    },

    // ==========================================
    // 2. PROFILE & ASSETS (BE-3) - CLEANED & MERGED
    // ==========================================
    permalink: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      slug: 'displayName', // <--- 3. THIS IS THE MAGIC LINE!
      slugPaddingSize: 1,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    age: { type: Number },
    gender: {
      type: String,
      enum: ['Female', 'Male', 'Custom', 'Prefer not to say'],
    },
    bio: {
      type: String,
      maxLength: [500, 'Bio cannot exceed 500 characters'],
      default: '',
    },
    country: { type: String, default: '' },
    city: { type: String, default: '' },
    genres: [{ type: String, trim: true }],

    socialLinks: {
      type: [
        {
          platform: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
      validate: [
        function (links) {
          return links.length <= 10; // Enforces the exact SoundCloud limit!
        },
        'You can only add up to 10 web links.',
      ],
    },

    avatarUrl: {
      type: String,
      default: 'default-avatar.png',
    },
    coverUrl: {
      // Merged from coverPhotoUrl
      type: String,
      default: 'default-cover.png',
    },

    // ==========================================
    // 3. ROLES, PRIVACY & STATUS (BE-4)
    // ==========================================
    role: {
      type: String,
      enum: ['Artist', 'Listener', 'Admin'],
      default: 'Listener',
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
    // BE-1: VERIFICATION & RECOVERY TOKENS
    // ==========================================
    emailVerificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    pendingEmail: String,
    pendingEmailToken: String,

    // ==========================================
    // 4. SOCIAL GRAPH COUNTS (Module 3)
    // ==========================================
    followerCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// ==========================================
// MODEL MIDDLEWARE & METHODS
// ==========================================

userSchema.pre('save', async function (next) {
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

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// SECURITY: Hide private data from JSON responses
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.refreshToken;
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
