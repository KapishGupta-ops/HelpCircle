const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { createNotification } = require('../utils/notifications');

// @desc Create or get conversation between two users
// @route POST /api/chat/conversations
// @access Private
exports.createOrGetConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const userId = req.user.id;

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, otherUserId] },
    }).populate('participants', 'name email');

    if (conversation) {
      return res.status(200).json(conversation);
    }

    // Create new conversation
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newConversation = await Conversation.create({
      participants: [userId, otherUserId],
      participantNames: [req.user.name, otherUser.name],
    });

    const populatedConversation = await Conversation.findById(
      newConversation._id
    ).populate('participants', 'name email');

    res.status(201).json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc Get all conversations for current user
// @route GET /api/chat/conversations
// @access Private
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate('participants', 'name email')
      .sort({ lastMessageTime: -1 });

    res.status(200).json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc Send a message
// @route POST /api/chat/messages
// @access Private
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const userId = req.user.id;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    }

    // Create message
    const newMessage = await Message.create({
      conversationId,
      senderId: userId,
      senderName: req.user.name,
      content,
    });

    // Populate senderId before returning
    await newMessage.populate('senderId', 'name email');

    // Update conversation's last message
    conversation.lastMessage = content;
    conversation.lastMessageTime = Date.now();
    conversation.updatedAt = Date.now();
    await conversation.save();

    const recipientId = conversation.participants.find(
      (participantId) => participantId.toString() !== userId.toString()
    );

    if (recipientId) {
      await createNotification({
        recipient: recipientId,
        actor: userId,
        type: 'message_received',
        title: 'New message',
        body: `${req.user.name}: ${String(content).slice(0, 80)}`,
        conversation: conversation._id,
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc Get messages for a conversation
// @route GET /api/chat/messages/:conversationId
// @access Private
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized to view this conversation' });
    }

    const messages = await Message.find({ conversationId })
      .populate('senderId', 'name email')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { conversationId, senderId: { $ne: userId }, isRead: false },
      { isRead: true }
    );

    res.status(200).json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc Get unread message count
// @route GET /api/chat/unread-count
// @access Private
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Message.countDocuments({
      senderId: { $ne: userId },
      isRead: false,
    });

    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc Delete a conversation
// @route DELETE /api/chat/conversations/:conversationId
// @access Private
exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete all messages in this conversation
    await Message.deleteMany({ conversationId });

    // Delete conversation
    await Conversation.findByIdAndDelete(conversationId);

    res.status(200).json({ message: 'Conversation deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
