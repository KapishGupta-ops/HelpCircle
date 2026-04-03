const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const WalletTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['topup', 'escrow_lock', 'escrow_release', 'escrow_refund'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    note: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  aadhaarVerified: {
    type: Boolean,
    default: false,
  },
  aadhaarNumber: {
    type: String, // Masked during registration
    required: true,
  },
  // Professional Address Fields
  flatNumber: { type: String, required: true },
  streetName: { type: String, required: true },
  landmark: { type: String },
  district: { type: String, required: true }, // From geolocation
  state: { type: String, required: true },    // From geolocation
  pincode: { type: String, required: true },
  
  // Address Verification
  addressProofUrl: { type: String }, // Path to uploaded file
  addressVerified: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  karma: {
    type: Number,
    default: 0,
  },
  walletBalance: {
    type: Number,
    default: 0,
  },
  walletLockedBalance: {
    type: Number,
    default: 0,
  },
  walletTransactions: {
    type: [WalletTransactionSchema],
    default: [],
  },
  ratingAverage: {
    type: Number,
    default: 0,
  },
  ratingCount: {
    type: Number,
    default: 0,
  },
  ratingTotal: {
    type: Number,
    default: 0,
  },
  totalRequestsCreated: {
    type: Number,
    default: 0,
  },
  totalRequestsClosed: {
    type: Number,
    default: 0,
  },
  totalHelpsAccepted: {
    type: Number,
    default: 0,
  },
  totalHelpsCompleted: {
    type: Number,
    default: 0,
  },
  responseTimeTotalMinutes: {
    type: Number,
    default: 0,
  },
  responseTimeCount: {
    type: Number,
    default: 0,
  },
  avgResponseMinutes: {
    type: Number,
    default: 0,
  },
  helpStreakDays: {
    type: Number,
    default: 0,
  },
  lastHelpCompletedDate: {
    type: Date,
    default: null,
  },
  badges: {
    type: [
      {
        type: String,
        enum: [
          'first_help',
          'five_helps',
          'ten_helps',
          'streak_3',
          'first_request_closed',
          'five_requests_closed',
          'fast_responder',
        ],
      },
    ],
    default: [],
  },
  preferredHelpCategories: {
    type: [
      {
        type: String,
        enum: ['Notes', 'Charger', 'Bike Repair', 'Groceries', 'Ride', 'Medical', 'Other'],
      },
    ],
    default: [],
  },
  availability: [
    {
      day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
      startTime: String, // e.g., "09:00"
      endTime: String,   // e.g., "17:00"
    },
  ],
  recommendationWeights: {
    distance: { type: Number, default: 1 },
    urgency: { type: Number, default: 1 },
    familiarity: { type: Number, default: 1 },
    preference: { type: Number, default: 1 },
    trust: { type: Number, default: 1 },
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user-entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
