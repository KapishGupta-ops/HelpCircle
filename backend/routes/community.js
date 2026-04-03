const express = require('express');
const router = express.Router();
const {
  getLeaderboard,
  getGroups,
  createGroup,
  joinGroup,
  createTestimonial,
  getTestimonials,
} = require('../controllers/communityController');
const { getInvoice } = require('../controllers/paymentController');
const protect = require('../middleware/auth');

router.get('/leaderboard', protect, getLeaderboard);
router.get('/groups', protect, getGroups);
router.post('/groups', protect, createGroup);
router.post('/groups/:id/join', protect, joinGroup);
router.post('/testimonials', protect, createTestimonial);
router.get('/testimonials/:userId', protect, getTestimonials);
router.get('/invoices/:id', protect, getInvoice);

module.exports = router;
