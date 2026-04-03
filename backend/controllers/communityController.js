const User = require('../models/User');
const Group = require('../models/Group');
const Testimonial = require('../models/Testimonial');
const { createNotification } = require('../utils/notifications');

// @desc    Get top helpers by karma (weekly/monthly)
// @route   GET /api/community/leaderboard
// @access  Private
const getLeaderboard = async (req, res) => {
  try {
    const helpers = await User.find({})
      .sort({ karma: -1 })
      .limit(10)
      .select('name karma ratingAverage totalHelpsCompleted');
    res.json(helpers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get user's neighborhood groups
// @route   GET /api/community/groups
// @access  Private
const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ pincode: req.user.pincode }).populate('members', 'name karma');
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a neighborhood group
// @route   POST /api/community/groups
// @access  Private
const createGroup = async (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Group name is required' });
  }

  try {
    const existingGroup = await Group.findOne({
      pincode: req.user.pincode,
      name: name.trim(),
    });

    if (existingGroup) {
      return res.status(409).json({ message: 'A group with this name already exists in your area' });
    }

    const group = await Group.create({
      name: name.trim(),
      description: (description || '').trim(),
      pincode: req.user.pincode,
      createdBy: req.user._id,
      members: [req.user._id],
    });

    const populatedGroup = await Group.findById(group._id).populate('members', 'name karma');
    res.status(201).json(populatedGroup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Join a neighborhood group
// @route   POST /api/community/groups/:id/join
// @access  Private
const joinGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.includes(req.user._id)) {
      group.members.push(req.user._id);
      await group.save();
    }

    res.json({ message: 'Joined group successfully', group });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a thank you message (testimonial)
// @route   POST /api/community/testimonials
// @access  Private
const createTestimonial = async (req, res) => {
  const { to, post, message } = req.body;

  try {
    const testimonial = await Testimonial.create({
      from: req.user._id,
      to,
      post,
      message,
    });

    await createNotification({
      recipient: to,
      actor: req.user._id,
      type: 'testimonial_received',
      title: 'New thank you message',
      body: `${req.user.name} sent you a public thank you note!`,
      post,
    });

    res.status(201).json(testimonial);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get testimonials for a specific user
// @route   GET /api/community/testimonials/:userId
// @access  Private
const getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find({ to: req.params.userId })
      .populate('from', 'name ratingAverage')
      .sort({ createdAt: -1 });
    res.json(testimonials);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getLeaderboard,
  getGroups,
  createGroup,
  joinGroup,
  createTestimonial,
  getTestimonials,
};
