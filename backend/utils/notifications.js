const Notification = require('../models/Notification');

const createNotification = async ({ recipient, actor, type, title, body, post, conversation, dedupeHours = 0 }) => {
  if (!recipient) return null;

  const recipientId = recipient.toString();
  const actorId = actor ? actor.toString() : null;

  // Do not notify users about their own actions.
  if (actorId && recipientId === actorId) {
    return null;
  }

  if (dedupeHours > 0) {
    const since = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
    const existing = await Notification.findOne({
      recipient,
      type,
      post: post || null,
      conversation: conversation || null,
      createdAt: { $gte: since },
    });

    if (existing) {
      return existing;
    }
  }

  return Notification.create({
    recipient,
    actor,
    type,
    title,
    body,
    post,
    conversation,
  });
};

module.exports = {
  createNotification,
};
