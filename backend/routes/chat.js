const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  createOrGetConversation,
  getConversations,
  sendMessage,
  getMessages,
  getUnreadCount,
  deleteConversation,
} = require('../controllers/chatController');

// Protect all chat routes
router.use(protect);

// Conversation routes
router.post('/conversations', createOrGetConversation);
router.get('/conversations', getConversations);
router.delete('/conversations/:conversationId', deleteConversation);

// Message routes
router.post('/messages', sendMessage);
router.get('/messages/:conversationId', getMessages);

// Utility routes
router.get('/unread-count', getUnreadCount);

module.exports = router;
