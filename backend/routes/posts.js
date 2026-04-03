const express = require('express');
const router = express.Router();
const {
  createPost,
  getFeed,
  getRecommendedFeed,
  offerHelp,
  acceptOffer,
  acceptTaskDirect,
  markWorkDone,
  confirmWorkDone,
  submitRating,
  getMyPosts,
  getHelpedPosts,
  getPostById,
  deletePost,
  bulkOffer,
  getRelatedPosts,
} = require('../controllers/postController');
const { payForTask } = require('../controllers/paymentController');
const protect = require('../middleware/auth');

router.post('/', protect, createPost);
router.get('/feed', protect, getFeed);
router.get('/recommended', protect, getRecommendedFeed);
router.get('/me', protect, getMyPosts);
router.get('/helped', protect, getHelpedPosts);
router.post('/bulk-offer', protect, bulkOffer);
router.get('/:id', protect, getPostById);
router.get('/:id/related', protect, getRelatedPosts);
router.delete('/:id', protect, deletePost);
router.post('/:id/offer', protect, offerHelp);
router.post('/:id/accept/:offerId', protect, acceptOffer);
router.post('/:id/accept-self', protect, acceptTaskDirect);
router.post('/:id/done/:offerId', protect, markWorkDone);
router.post('/:id/confirm/:offerId', protect, confirmWorkDone);
router.post('/:id/rate', protect, submitRating);
router.post('/:id/pay', protect, payForTask);

module.exports = router;
