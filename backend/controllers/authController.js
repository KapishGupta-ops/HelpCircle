const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');

const ALLOWED_HELP_CATEGORIES = ['Notes', 'Charger', 'Bike Repair', 'Groceries', 'Ride', 'Medical', 'Other'];
const DEFAULT_RECOMMENDATION_WEIGHTS = {
  distance: 1,
  urgency: 1,
  familiarity: 1,
  preference: 1,
  trust: 1,
};

const normalizeWeight = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(0.5, Math.min(2, Number(num.toFixed(2))));
};

const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { 
    name, 
    email, 
    password, 
    aadhaarNumber, 
    flatNumber, 
    streetName, 
    landmark, 
    district, 
    state, 
    pincode, 
    lat, 
    lng, 
    aadhaarVerified 
  } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Masking Aadhaar: Only last 4 digits visible
    const maskedAadhaar = aadhaarNumber.replace(/\d(?=\d{4})/g, "X");

    const user = await User.create({
      name,
      email,
      password,
      aadhaarNumber: maskedAadhaar,
      aadhaarVerified: aadhaarVerified || false,
      flatNumber,
      streetName,
      landmark,
      district,
      state,
      pincode,
      lat,
      lng,
      addressProofUrl: req.file ? `/uploads/${req.file.filename}` : null,
      addressVerified: 'pending',
      karma: 0
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (err) {
    // Improved Error Handling for MongoDB
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ 
        message: `That ${field} is already in use. Please try another one.` 
      });
    }
    
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'A server error occurred during registration. Please try again.' });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'A server error occurred during login.' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get onboarding activity status
// @route   GET /api/auth/onboarding-status
// @access  Private
const getOnboardingStatus = async (req, res) => {
  try {
    const hasPostedRequest = (await Post.countDocuments({ author: req.user._id })) > 0;

    const hasOfferedHelp =
      (await Post.countDocuments({
        offers: {
          $elemMatch: {
            user: req.user._id,
          },
        },
      })) > 0;

    const hasCompletedHelp =
      (await Post.countDocuments({
        offers: {
          $elemMatch: {
            user: req.user._id,
            completionStatus: 'confirmed_done',
          },
        },
      })) > 0;

    let recommendedAction = 'explore';
    if (!hasPostedRequest) {
      recommendedAction = 'create_request';
    } else if (!hasOfferedHelp) {
      recommendedAction = 'offer_help';
    }

    res.json({
      hasPostedRequest,
      hasOfferedHelp,
      hasCompletedHelp,
      recommendedAction,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get weekly impact summary
// @route   GET /api/auth/impact-summary
// @access  Private
const getImpactSummary = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const helpedCompletedThisWeek = await Post.countDocuments({
      offers: {
        $elemMatch: {
          user: req.user._id,
          completionStatus: 'confirmed_done',
          requesterDecisionAt: { $gte: since },
        },
      },
    });

    const requestsClosedThisWeek = await Post.countDocuments({
      author: req.user._id,
      offers: {
        $elemMatch: {
          completionStatus: 'confirmed_done',
          requesterDecisionAt: { $gte: since },
        },
      },
    });

    const badgesUnlockedThisWeek = await Notification.countDocuments({
      recipient: req.user._id,
      type: 'badge_unlocked',
      createdAt: { $gte: since },
    });

    const user = await User.findById(req.user._id).select('helpStreakDays ratingAverage ratingCount');

    res.json({
      periodDays: 7,
      helpedCompletedThisWeek,
      requestsClosedThisWeek,
      badgesUnlockedThisWeek,
      helpStreakDays: user ? Number(user.helpStreakDays || 0) : 0,
      ratingAverage: user ? Number(user.ratingAverage || 0) : 0,
      ratingCount: user ? Number(user.ratingCount || 0) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update user recommendation preferences
// @route   PATCH /api/auth/preferences
// @access  Private
const updatePreferences = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.preferredHelpCategories)
      ? req.body.preferredHelpCategories
      : [];

    const normalized = Array.from(
      new Set(
        incoming
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim())
      )
    ).filter((value) => ALLOWED_HELP_CATEGORIES.includes(value));

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const incomingWeights = req.body && typeof req.body.recommendationWeights === 'object'
      ? req.body.recommendationWeights
      : {};

    const nextWeights = {
      ...DEFAULT_RECOMMENDATION_WEIGHTS,
      ...(user.recommendationWeights || {}),
      distance: normalizeWeight(incomingWeights.distance ?? user?.recommendationWeights?.distance ?? DEFAULT_RECOMMENDATION_WEIGHTS.distance),
      urgency: normalizeWeight(incomingWeights.urgency ?? user?.recommendationWeights?.urgency ?? DEFAULT_RECOMMENDATION_WEIGHTS.urgency),
      familiarity: normalizeWeight(incomingWeights.familiarity ?? user?.recommendationWeights?.familiarity ?? DEFAULT_RECOMMENDATION_WEIGHTS.familiarity),
      preference: normalizeWeight(incomingWeights.preference ?? user?.recommendationWeights?.preference ?? DEFAULT_RECOMMENDATION_WEIGHTS.preference),
      trust: normalizeWeight(incomingWeights.trust ?? user?.recommendationWeights?.trust ?? DEFAULT_RECOMMENDATION_WEIGHTS.trust),
    };

    user.preferredHelpCategories = normalized;
    user.recommendationWeights = nextWeights;
    await user.save();

    res.json({
      message: 'Preferences updated',
      preferredHelpCategories: user.preferredHelpCategories,
      recommendationWeights: user.recommendationWeights,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Verify Aadhaar (Mock)
// @route   POST /api/auth/verify-aadhaar
// @access  Public
const verifyAadhaar = async (req, res) => {
  const { aadhaarNumber, otp } = req.body;

  if (aadhaarNumber.length !== 12) {
    return res.status(400).json({ message: 'Invalid Aadhaar number' });
  }

  try {
    // Check if Aadhaar is already registered
    const maskedAadhaar = aadhaarNumber.replace(/\d(?=\d{4})/g, "X");
    const aadhaarExists = await User.findOne({ aadhaarNumber: maskedAadhaar });
    
    if (aadhaarExists) {
      return res.status(400).json({ success: false, message: 'This Aadhaar number is already registered' });
    }

    if (otp === '123456') {
      return res.status(200).json({ success: true, message: 'Aadhaar verified' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (err) {
    console.error('Aadhaar verification error:', err);
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

// @desc    Verify Address (Mock)
// @route   POST /api/auth/verify-address
// @access  Public
const verifyAddress = async (req, res) => {
  const { address, pincode } = req.body;

  if (address && pincode.length === 6) {
    return res.status(200).json({ success: true, message: 'Address verified' });
  } else {
    return res.status(400).json({ success: false, message: 'Invalid address or pincode' });
  }
};

// @desc    Update user availability
// @route   PATCH /api/auth/availability
// @access  Private
const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;

    if (!Array.isArray(availability)) {
      return res.status(400).json({ message: 'Availability must be an array' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.availability = availability;
    await user.save();

    res.json({ message: 'Availability updated', availability: user.availability });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get wallet summary
// @route   GET /api/auth/wallet
// @access  Private
const getWalletSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance walletLockedBalance');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const availableBalance = roundCurrency(user.walletBalance);
    const lockedBalance = roundCurrency(user.walletLockedBalance);

    res.json({
      availableBalance,
      lockedBalance,
      totalBalance: roundCurrency(availableBalance + lockedBalance),
      currency: 'INR',
      symbol: '₹',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Demo top-up wallet
// @route   POST /api/auth/wallet/topup
// @access  Private
const topUpWallet = async (req, res) => {
  const amount = Number(req.body && req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Top-up amount must be greater than 0' });
  }

  if (amount > 100000) {
    return res.status(400).json({ message: 'Top-up limit exceeded for demo mode' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const credited = roundCurrency(amount);
    user.walletBalance = roundCurrency(Number(user.walletBalance || 0) + credited);
    user.walletTransactions = Array.isArray(user.walletTransactions) ? user.walletTransactions : [];
    user.walletTransactions.unshift({
      type: 'topup',
      amount: credited,
      note: 'Demo wallet top-up',
      createdAt: new Date(),
    });

    // Keep transaction history bounded for performance.
    if (user.walletTransactions.length > 200) {
      user.walletTransactions = user.walletTransactions.slice(0, 200);
    }

    await user.save();

    res.status(200).json({
      message: 'Demo top-up successful',
      addedAmount: credited,
      availableBalance: roundCurrency(user.walletBalance),
      lockedBalance: roundCurrency(user.walletLockedBalance),
      totalBalance: roundCurrency(Number(user.walletBalance || 0) + Number(user.walletLockedBalance || 0)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get wallet transactions
// @route   GET /api/auth/wallet/transactions
// @access  Private
const getWalletTransactions = async (req, res) => {
  try {
    const limitRaw = Number(req.query && req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 30;

    const user = await User.findById(req.user._id)
      .select('walletTransactions')
      .populate('walletTransactions.post', 'title category status');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transactions = (user.walletTransactions || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((tx) => ({
        type: tx.type,
        amount: roundCurrency(tx.amount),
        note: tx.note || '',
        createdAt: tx.createdAt,
        post: tx.post
          ? {
              _id: tx.post._id,
              title: tx.post.title,
              category: tx.post.category,
              status: tx.post.status,
            }
          : null,
      }));

    res.json({
      currency: 'INR',
      symbol: '₹',
      transactions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  getOnboardingStatus,
  getImpactSummary,
  updatePreferences,
  verifyAadhaar,
  verifyAddress,
  updateAvailability,
  getWalletSummary,
  topUpWallet,
  getWalletTransactions,
};
