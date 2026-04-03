const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/authController');

const protect = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/register', upload.single('addressProof'), registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/onboarding-status', protect, getOnboardingStatus);
router.get('/impact-summary', protect, getImpactSummary);
router.patch('/preferences', protect, updatePreferences);
router.post('/verify-aadhaar', verifyAadhaar);
router.post('/verify-address', verifyAddress);
router.patch('/availability', protect, updateAvailability);
router.get('/wallet', protect, getWalletSummary);
router.post('/wallet/topup', protect, topUpWallet);
router.get('/wallet/transactions', protect, getWalletTransactions);

module.exports = router;
