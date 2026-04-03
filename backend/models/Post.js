const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['Notes', 'Charger', 'Bike Repair', 'Groceries', 'Ride', 'Medical', 'Other'],
  },
  isUrgent: {
    type: Boolean,
    default: false,
  },
  isSOS: {
    type: Boolean,
    default: false,
  },
  price: {
    type: Number,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['none', 'pending', 'escrowed', 'paid'],
    default: 'none',
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null,
  },
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'accepted', 'closed', 'scheduled', 'expired'],
    default: 'open',
  },
  scheduledFor: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  isEvent: {
    type: Boolean,
    default: false,
  },
  isRecurring: {
    type: Boolean,
    default: false,
  },
  recurringFrequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', null],
    default: null,
  },
  eventDate: {
    type: Date,
    default: null,
  },
  reminderSent: {
    type: Boolean,
    default: false,
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  acceptedAt: {
    type: Date,
    default: null,
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  offers: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      message: {
        type: String,
      },
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
      },
      completionStatus: {
        type: String,
        enum: ['in_progress', 'marked_done', 'confirmed_done', 'rejected_done'],
        default: 'in_progress',
      },
      helperMarkedDoneAt: {
        type: Date,
      },
      requesterDecisionAt: {
        type: Date,
      },
      ratingByRequester: {
        type: Number,
        min: 1,
        max: 5,
      },
      ratingByHelper: {
        type: Number,
        min: 1,
        max: 5,
      },
      requesterRatedAt: {
        type: Date,
      },
      helperRatedAt: {
        type: Date,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Post', PostSchema);
