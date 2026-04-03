const express = require('express');
const router = express.Router();

// @desc    Get Google Maps API Key
// @route   GET /api/config/google-maps
// @access  Public (or protected if preferred)
router.get('/google-maps', (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY });
});

module.exports = router;
