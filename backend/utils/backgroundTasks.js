const Post = require('../models/Post');
const { createNotification } = require('./notifications');

const processScheduledPosts = async () => {
  try {
    const now = new Date();
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledFor: { $lte: now },
    });

    for (const post of scheduledPosts) {
      post.status = 'open';
      await post.save();
      console.log(`Post "${post.title}" is now open.`);
      
      // Optionally notify the author
      await createNotification({
        recipient: post.author,
        type: 'post_opened',
        title: 'Your scheduled post is now live',
        body: `Your post "${post.title}" has been published.`,
        post: post._id,
      });
    }
  } catch (err) {
    console.error('Error processing scheduled posts:', err);
  }
};

const processExpiredPosts = async () => {
  try {
    const now = new Date();
    const expiredPosts = await Post.find({
      status: 'open',
      expiresAt: { $lte: now },
    });

    for (const post of expiredPosts) {
      post.status = 'expired';
      await post.save();
      console.log(`Post "${post.title}" has expired.`);

      await createNotification({
        recipient: post.author,
        type: 'post_expired',
        title: 'Your post has expired',
        body: `Your post "${post.title}" has expired without being accepted.`,
        post: post._id,
      });
    }
  } catch (err) {
    console.error('Error processing expired posts:', err);
  }
};

const processTaskReminders = async () => {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find tasks that are scheduled to start within the next hour and haven't been notified yet
    const upcomingTasks = await Post.find({
      status: 'accepted',
      scheduledFor: { $gt: now, $lte: oneHourFromNow },
      reminderSent: { $ne: true },
    });

    for (const post of upcomingTasks) {
      // Notify both requester and helper
      await createNotification({
        recipient: post.author,
        type: 'task_reminder',
        title: 'Task Reminder',
        body: `Your scheduled task "${post.title}" is due in less than an hour.`,
        post: post._id,
      });

      if (post.acceptedBy) {
        await createNotification({
          recipient: post.acceptedBy,
          type: 'task_reminder',
          title: 'Task Reminder',
          body: `The task "${post.title}" you accepted is due in less than an hour.`,
          post: post._id,
        });
      }

      post.reminderSent = true;
      await post.save();
    }
  } catch (err) {
    console.error('Error processing task reminders:', err);
  }
};

const startBackgroundTasks = () => {
  // Run every minute
  setInterval(() => {
    processScheduledPosts();
    processExpiredPosts();
    processTaskReminders();
  }, 60000);
  console.log('Background tasks started.');
};

module.exports = { startBackgroundTasks };
