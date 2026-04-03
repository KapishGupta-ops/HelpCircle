const Post = require('../models/Post');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const { createNotification } = require('../utils/notifications');

// @desc    Initiate payment (Demo)
// @route   POST /api/posts/:id/pay
// @access  Private
const payForTask = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Only the requester can pay' });
    }

    if (post.status !== 'closed') {
      return res.status(400).json({ message: 'Payment is automatically handled after completion confirmation' });
    }

    if (post.price <= 0) {
      return res.status(400).json({ message: 'No payment required for this task' });
    }

    if (post.paymentStatus === 'paid' && post.invoiceId) {
      const existingInvoice = await Invoice.findById(post.invoiceId);
      return res.status(200).json({
        message: 'Payment already completed via escrow release',
        invoice: existingInvoice,
      });
    }

    return res.status(400).json({
      message: 'Escrow auto-release failed earlier. Please re-confirm task completion to trigger payment.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get invoice by ID
// @route   GET /api/community/invoices/:id
// @access  Private
const getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('post', 'title description category')
      .populate('requester', 'name email')
      .populate('helper', 'name email');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (
      invoice.requester._id.toString() !== req.user._id.toString() &&
      invoice.helper._id.toString() !== req.user._id.toString()
    ) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  payForTask,
  getInvoice,
};
