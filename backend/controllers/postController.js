const Post = require('../models/Post');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const calculateDistance = require('../utils/haversine');
const { createNotification } = require('../utils/notifications');

const applyRatingToUser = async (userId, rating) => {
  const user = await User.findById(userId);
  if (!user) return null;

  user.ratingTotal = (user.ratingTotal || 0) + rating;
  user.ratingCount = (user.ratingCount || 0) + 1;
  user.ratingAverage = Number((user.ratingTotal / user.ratingCount).toFixed(2));
  await user.save();

  return user;
};

const updateRequesterResponseStats = async (requesterId, createdAt, acceptedAt) => {
  const requester = await User.findById(requesterId);
  if (!requester) return;

  const createdTs = new Date(createdAt).getTime();
  const acceptedTs = new Date(acceptedAt).getTime();
  const minutes = Math.max(0, Math.round((acceptedTs - createdTs) / 60000));

  requester.responseTimeTotalMinutes = (requester.responseTimeTotalMinutes || 0) + minutes;
  requester.responseTimeCount = (requester.responseTimeCount || 0) + 1;
  requester.avgResponseMinutes = Number(
    (requester.responseTimeTotalMinutes / requester.responseTimeCount).toFixed(1)
  );

  await requester.save();
};

const maybeUnlockBadge = (user, badgeKey) => {
  if (!user) return false;
  if (!Array.isArray(user.badges)) user.badges = [];
  if (user.badges.includes(badgeKey)) return false;
  user.badges.push(badgeKey);
  return true;
};

const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));

const evaluateAndUnlockBadges = (user, role) => {
  const unlocked = [];

  if (role === 'helper') {
    if ((user.totalHelpsCompleted || 0) >= 1 && maybeUnlockBadge(user, 'first_help')) {
      unlocked.push({ key: 'first_help', title: 'Badge unlocked: First Help', body: 'You completed your first help request.' });
    }
    if ((user.totalHelpsCompleted || 0) >= 5 && maybeUnlockBadge(user, 'five_helps')) {
      unlocked.push({ key: 'five_helps', title: 'Badge unlocked: 5 Helps', body: 'You have completed 5 help requests.' });
    }
    if ((user.totalHelpsCompleted || 0) >= 10 && maybeUnlockBadge(user, 'ten_helps')) {
      unlocked.push({ key: 'ten_helps', title: 'Badge unlocked: 10 Helps', body: 'You have completed 10 help requests.' });
    }
    if ((user.helpStreakDays || 0) >= 3 && maybeUnlockBadge(user, 'streak_3')) {
      unlocked.push({ key: 'streak_3', title: 'Badge unlocked: 3-Day Streak', body: 'You helped neighbors 3 days in a row.' });
    }
  }

  if (role === 'requester') {
    if ((user.totalRequestsClosed || 0) >= 1 && maybeUnlockBadge(user, 'first_request_closed')) {
      unlocked.push({ key: 'first_request_closed', title: 'Badge unlocked: First Request Closed', body: 'You completed your first request successfully.' });
    }
    if ((user.totalRequestsClosed || 0) >= 5 && maybeUnlockBadge(user, 'five_requests_closed')) {
      unlocked.push({ key: 'five_requests_closed', title: 'Badge unlocked: 5 Requests Closed', body: 'You successfully closed 5 requests.' });
    }
    if ((user.responseTimeCount || 0) >= 3 && Number(user.avgResponseMinutes || 0) > 0 && Number(user.avgResponseMinutes || 0) <= 30 && maybeUnlockBadge(user, 'fast_responder')) {
      unlocked.push({ key: 'fast_responder', title: 'Badge unlocked: Fast Responder', body: 'Your average request response time is under 30 minutes.' });
    }
  }

  return unlocked;
};

const createLifecycleRemindersForUser = async (userId) => {
  const now = Date.now();
  const sixHours = 6 * 60 * 60 * 1000;
  const oneHour = 1 * 60 * 60 * 1000;

  const posts = await Post.find({
    $or: [{ author: userId }, { acceptedBy: userId }],
    status: { $in: ['accepted', 'closed'] },
  });

  for (const post of posts) {
    const acceptedOffer = post.offers.find((offer) => offer.status === 'accepted');
    if (!acceptedOffer) continue;

    const requesterId = post.author.toString();
    const helperId = acceptedOffer.user.toString();
    const currentUserId = userId.toString();

    if (
      currentUserId === helperId &&
      post.status === 'accepted' &&
      acceptedOffer.completionStatus === 'in_progress' &&
      post.acceptedAt &&
      now - new Date(post.acceptedAt).getTime() >= sixHours
    ) {
      await createNotification({
        recipient: userId,
        type: 'reminder_mark_done',
        title: 'Reminder: update task progress',
        body: `Please mark "${post.title}" as done when finished.`,
        post: post._id,
        dedupeHours: 6,
      });
    }

    if (
      currentUserId === requesterId &&
      post.status === 'accepted' &&
      acceptedOffer.completionStatus === 'marked_done' &&
      acceptedOffer.helperMarkedDoneAt &&
      now - new Date(acceptedOffer.helperMarkedDoneAt).getTime() >= oneHour
    ) {
      await createNotification({
        recipient: userId,
        type: 'reminder_confirm_done',
        title: 'Reminder: confirm completion',
        body: `Please confirm or reject completion for "${post.title}".`,
        post: post._id,
        dedupeHours: 3,
      });
    }

    if (
      post.status === 'closed' &&
      acceptedOffer.completionStatus === 'confirmed_done'
    ) {
      if (currentUserId === requesterId && !acceptedOffer.ratingByRequester) {
        await createNotification({
          recipient: userId,
          type: 'reminder_rate',
          title: 'Reminder: rate your helper',
          body: `Rate your helper for "${post.title}" to complete the loop.`,
          post: post._id,
          dedupeHours: 6,
        });
      }

      if (currentUserId === helperId && !acceptedOffer.ratingByHelper) {
        await createNotification({
          recipient: userId,
          type: 'reminder_rate',
          title: 'Reminder: rate the requester',
          body: `Rate the requester for "${post.title}" to complete the loop.`,
          post: post._id,
          dedupeHours: 6,
        });
      }
    }
  }
};

// @desc    Create new post
// @route   POST /api/posts
// @access  Private
const createPost = async (req, res) => {
  const { 
    title, description, category, isUrgent, lat, lng, 
    scheduledFor, expiresAt, isEvent, isRecurring, recurringFrequency, eventDate,
    isSOS, price
  } = req.body;

  try {
    const normalizedPrice = roundCurrency(Number(price) || 0);
    if (normalizedPrice < 0) {
      return res.status(400).json({ message: 'Price cannot be negative' });
    }

    let status = 'open';
    if (scheduledFor && new Date(scheduledFor) > new Date()) {
      status = 'scheduled';
    }

    const post = await Post.create({
      author: req.user._id,
      title,
      description,
      category,
      isUrgent,
      lat,
      lng,
      status,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isEvent: !!isEvent,
      isRecurring: !!isRecurring,
      recurringFrequency,
      eventDate: eventDate ? new Date(eventDate) : null,
      isSOS: !!isSOS,
      price: normalizedPrice,
    });

    if (post) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalRequestsCreated: 1 },
      });

      // SOS: Notify nearby users immediately
      if (post.isSOS) {
        const nearbyUsers = await User.find({
          _id: { $ne: req.user._id },
        });

        for (const user of nearbyUsers) {
          const distance = calculateDistance(lat, lng, user.lat, user.lng);
          if (distance <= 5) { // Notify users within 5km for SOS
            await createNotification({
              recipient: user._id,
              actor: req.user._id,
              type: 'emergency_sos',
              title: 'EMERGENCY: Nearby Help Needed!',
              body: `${req.user.name} needs urgent help with "${post.title}".`,
              post: post._id,
            });
          }
        }
      }

      res.status(201).json(post);
    } else {
      res.status(400).json({ message: 'Invalid post data' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Offer help on multiple posts at once
// @route   POST /api/posts/bulk-offer
// @access  Private
const bulkOffer = async (req, res) => {
  const { postIds, message } = req.body;

  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ message: 'Post IDs array required' });
  }

  try {
    const results = [];
    for (const postId of postIds) {
      const post = await Post.findById(postId);
      if (!post) continue;

      if (post.author.toString() === req.user._id.toString()) continue;
      if (post.status !== 'open') continue;

      const alreadyOffered = post.offers.find(
        (offer) => offer.user.toString() === req.user._id.toString()
      );

      if (!alreadyOffered) {
        post.offers.push({ user: req.user._id, message: message || 'Bulk offer help' });
        await post.save();

        await createNotification({
          recipient: post.author,
          actor: req.user._id,
          type: 'offer_received',
          title: 'New offer received (Bulk)',
          body: `${req.user.name} offered help on "${post.title}".`,
          post: post._id,
        });

        results.push(postId);
      }
    }

    res.status(200).json({
      message: `Offers sent for ${results.length} posts`,
      offeredPostIds: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get related posts (similar category, nearby, recent)
// @route   GET /api/posts/:id/related
// @access  Private
const getRelatedPosts = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const related = await Post.find({
      _id: { $ne: post._id },
      category: post.category,
      status: 'open',
    })
      .limit(5)
      .populate('author', 'name karma ratingAverage');

    const relatedWithDistance = related.map((p) => {
      const distance = calculateDistance(post.lat, post.lng, p.lat, p.lng);
      return { ...p._doc, distance: parseFloat(distance.toFixed(2)) };
    });

    res.json(relatedWithDistance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get nearby posts feed (within 10km)
// @route   GET /api/posts/feed
// @access  Private
const getFeed = async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Location required' });
  }

  try {
    const posts = await Post.find({ status: 'open' })
      .populate(
        'author',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      )
      .sort({ createdAt: -1 });

    const feed = posts
      .map((post) => {
        const distance = calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          post.lat,
          post.lng
        );
        return { ...post._doc, distance: parseFloat(distance.toFixed(2)) };
      })
      .filter((post) => post.distance <= 10)
      .sort((a, b) => {
        // Urgent posts first
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        // Then by newest
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    res.json(feed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get personalized posts aligned to user's past help categories
// @route   GET /api/posts/recommended
// @access  Private
const getRecommendedFeed = async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Location required' });
  }

  try {
    const viewer = await User.findById(req.user._id).select('preferredHelpCategories recommendationWeights totalHelpsCompleted helpStreakDays');
    const userLat = Number(lat);
    const userLng = Number(lng);

    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      return res.status(400).json({ message: 'Invalid location' });
    }

    const helpedPosts = await Post.find({
      offers: {
        $elemMatch: {
          user: req.user._id,
        },
      },
    }).select('category offers.user');

    const categoryCount = {};
    for (const post of helpedPosts) {
      const hasUserOffer = post.offers.some((offer) => offer.user.toString() === req.user._id.toString());
      if (!hasUserOffer) continue;
      categoryCount[post.category] = (categoryCount[post.category] || 0) + 1;
    }

    const preferredCategories = Array.isArray(viewer?.preferredHelpCategories)
      ? viewer.preferredHelpCategories
      : [];
    const preferredSet = new Set(preferredCategories);
    const helperMomentumBoost = Math.min(1.5, Number(viewer?.totalHelpsCompleted || 0) * 0.05 + Number(viewer?.helpStreakDays || 0) * 0.15);
    const weights = {
      distance: Number(viewer?.recommendationWeights?.distance || 1),
      urgency: Number(viewer?.recommendationWeights?.urgency || 1),
      familiarity: Number(viewer?.recommendationWeights?.familiarity || 1),
      preference: Number(viewer?.recommendationWeights?.preference || 1),
      trust: Number(viewer?.recommendationWeights?.trust || 1),
    };

    const posts = await Post.find({
      status: 'open',
      author: { $ne: req.user._id },
    })
      .populate(
        'author',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      )
      .sort({ createdAt: -1 });

    const scored = posts
      .map((post) => {
        const distance = calculateDistance(
          userLat,
          userLng,
          post.lat,
          post.lng
        );

        if (distance > 10) return null;

        const familiarityScore = Number(categoryCount[post.category] || 0);
        const preferenceScore = preferredSet.has(post.category) ? 2.5 : 0;
        const distanceScore = Math.max(0, 10 - distance);
        const urgencyScore = post.isUrgent ? 3 : 0;
        const trustScore = Number(post.author.ratingAverage || 0) / 2;

        const totalRequests = Number(post.author.totalRequestsCreated || 0);
        const closedRequests = Number(post.author.totalRequestsClosed || 0);
        const completionRate = totalRequests > 0 ? closedRequests / totalRequests : 0.5;
        const reliabilityScore = Number((completionRate * 3).toFixed(2));

        const avgResponseMinutes = Number(post.author.avgResponseMinutes || 0);
        const responsivenessScore =
          avgResponseMinutes > 0 ? Math.max(0, Math.min(2, (120 - avgResponseMinutes) / 60)) : 0.8;

        const freshnessScore = Math.max(0, 2 - (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60 * 24));

        const recommendationScore = Number(
          (
            familiarityScore * 1.8 * weights.familiarity +
            preferenceScore * weights.preference +
            distanceScore * weights.distance +
            urgencyScore * weights.urgency +
            trustScore * weights.trust +
            (reliabilityScore + responsivenessScore) * weights.trust +
            freshnessScore +
            helperMomentumBoost
          ).toFixed(2)
        );

        let recommendationReason = 'Strong nearby match';
        if (preferenceScore > 0) {
          recommendationReason = `Matches your preferred ${post.category} category`;
        } else if (familiarityScore > 0) {
          recommendationReason = `Based on your ${post.category} help history`;
        } else if (post.isUrgent) {
          recommendationReason = 'Urgent need nearby';
        } else if (reliabilityScore >= 2) {
          recommendationReason = 'Reliable requester nearby';
        }

        return {
          ...post._doc,
          distance: parseFloat(distance.toFixed(2)),
          recommendationScore,
          recommendationReason,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 6);

    res.json(scored);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Offer help on a post
// @route   POST /api/posts/:id/offer
// @access  Private
const offerHelp = async (req, res) => {
  const { message } = req.body;

  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot help your own post' });
    }

    const alreadyOffered = post.offers.find(
      (offer) => offer.user.toString() === req.user._id.toString()
    );

    // Keep offer creation idempotent so users can continue chatting via the same modal.
    if (!alreadyOffered) {
      post.offers.push({ user: req.user._id, message });
      await post.save();
    }

    // Return author info for chat integration regardless of offer state.
    const author = await User.findById(post.author);

    if (!alreadyOffered) {
      await createNotification({
        recipient: post.author,
        actor: req.user._id,
        type: 'offer_received',
        title: 'New offer received',
        body: `${req.user.name} offered help on "${post.title}".`,
        post: post._id,
      });
    }

    res.status(200).json({
      message: alreadyOffered ? 'Offer already exists' : 'Help offer sent',
      authorId: post.author,
      authorName: author ? author.name : 'Unknown',
      alreadyOffered: Boolean(alreadyOffered),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Accept help offer
// @route   POST /api/posts/:id/accept/:offerId
// @access  Private
const acceptOffer = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const offer = post.offers.id(req.params.offerId);

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    const isAuthor = post.author.toString() === req.user._id.toString();
    const isOfferOwner = offer.user.toString() === req.user._id.toString();

    // Allow either the author, or the user who created this offer, to accept it.
    if (!isAuthor && !isOfferOwner) {
      return res.status(403).json({ message: 'You can only accept your own offer' });
    }

    // CONCURRENCY CHECK: Prevent multiple users from accepting the same task simultaneously
    // If task is already locked/accepted by someone else, reject the accept request
    if (post.isLocked && post.acceptedBy && post.acceptedBy.toString() !== offer.user.toString()) {
      return res.status(409).json({ message: 'This task has already been accepted by someone else' });
    }

    // Check that the offer hasn't already been accepted
    if (offer.status === 'accepted') {
      return res.status(400).json({ message: 'This offer has already been accepted' });
    }

    offer.status = 'accepted';
    offer.completionStatus = 'in_progress';
    offer.helperMarkedDoneAt = undefined;
    offer.requesterDecisionAt = undefined;
    post.status = 'accepted';
    post.acceptedBy = offer.user;
    post.acceptedAt = new Date();
    post.isLocked = true;

    // Update Karma and lock escrow from requester wallet for paid tasks.
    const author = await User.findById(post.author);
    const helper = await User.findById(offer.user);

    if (!author) {
      return res.status(404).json({ message: 'Requester not found' });
    }

    const rewardAmount = roundCurrency(Number(post.price || 0));
    if (rewardAmount > 0) {
      const available = roundCurrency(author.walletBalance);
      if (available < rewardAmount) {
        return res.status(400).json({
          message: `Insufficient wallet balance. Needed ₹${rewardAmount.toFixed(2)}, available ₹${available.toFixed(2)}. Please top up first.`,
        });
      }

      author.walletBalance = roundCurrency(available - rewardAmount);
      author.walletLockedBalance = roundCurrency(Number(author.walletLockedBalance || 0) + rewardAmount);
      author.walletTransactions = Array.isArray(author.walletTransactions) ? author.walletTransactions : [];
      author.walletTransactions.unshift({
        type: 'escrow_lock',
        amount: rewardAmount,
        post: post._id,
        note: `Escrow locked for "${post.title}"`,
        createdAt: new Date(),
      });

      if (author.walletTransactions.length > 200) {
        author.walletTransactions = author.walletTransactions.slice(0, 200);
      }

      post.paymentStatus = 'escrowed';
    } else {
      post.paymentStatus = 'none';
    }

    if (author) author.karma += 5;
    if (helper) helper.karma += 15;

    await author.save();
    if (helper) {
      helper.totalHelpsAccepted = (helper.totalHelpsAccepted || 0) + 1;
      await helper.save();
    }
    await post.save();

    await updateRequesterResponseStats(post.author, post.createdAt, post.acceptedAt);

    await createNotification({
      recipient: offer.user,
      actor: req.user._id,
      type: 'offer_accepted',
      title: 'Your offer was accepted',
      body: `${req.user.name} accepted your offer on "${post.title}".`,
      post: post._id,
    });

    res.status(200).json({ message: 'Offer accepted, karma points awarded!', post });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Accept task directly as nearby helper
// @route   POST /api/posts/:id/accept-self
// @access  Private
const acceptTaskDirect = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot accept your own task' });
    }

    const bodyLat = Number(req.body && req.body.lat);
    const bodyLng = Number(req.body && req.body.lng);
    const hasLiveLocation = Number.isFinite(bodyLat) && Number.isFinite(bodyLng);

    const helperLat = hasLiveLocation ? bodyLat : Number(req.user.lat);
    const helperLng = hasLiveLocation ? bodyLng : Number(req.user.lng);

    if (!Number.isFinite(helperLat) || !Number.isFinite(helperLng)) {
      return res.status(400).json({ message: 'Helper location unavailable' });
    }

    const distance = calculateDistance(helperLat, helperLng, post.lat, post.lng);
    if (distance > 10) {
      return res.status(403).json({ message: 'Only nearby users can accept this task' });
    }

    // Idempotent: if already accepted by the same user, return success without re-awarding karma.
    if (
      post.isLocked &&
      post.acceptedBy &&
      post.acceptedBy.toString() === req.user._id.toString()
    ) {
      return res.status(200).json({ message: 'Task already accepted by you', post });
    }

    if (post.isLocked && post.acceptedBy) {
      return res.status(409).json({ message: 'This task has already been accepted by someone else' });
    }

    let offer = post.offers.find(
      (existingOffer) => existingOffer.user.toString() === req.user._id.toString()
    );

    if (!offer) {
      post.offers.push({
        user: req.user._id,
        message: 'Accepted directly from task details',
      });
      offer = post.offers[post.offers.length - 1];
    }

    if (offer.status === 'accepted') {
      return res.status(200).json({ message: 'Task already accepted by you', post });
    }

    offer.status = 'accepted';
    offer.completionStatus = 'in_progress';
    offer.helperMarkedDoneAt = undefined;
    offer.requesterDecisionAt = undefined;
    post.status = 'accepted';
    post.acceptedBy = req.user._id;
    post.acceptedAt = new Date();
    post.isLocked = true;

    const author = await User.findById(post.author);
    const helper = await User.findById(req.user._id);

    if (!author) {
      return res.status(404).json({ message: 'Requester not found' });
    }

    const rewardAmount = roundCurrency(Number(post.price || 0));
    if (rewardAmount > 0) {
      const available = roundCurrency(author.walletBalance);
      if (available < rewardAmount) {
        return res.status(400).json({
          message: `Requester has insufficient wallet balance for this paid task (₹${rewardAmount.toFixed(2)} required).`,
        });
      }

      author.walletBalance = roundCurrency(available - rewardAmount);
      author.walletLockedBalance = roundCurrency(Number(author.walletLockedBalance || 0) + rewardAmount);
      author.walletTransactions = Array.isArray(author.walletTransactions) ? author.walletTransactions : [];
      author.walletTransactions.unshift({
        type: 'escrow_lock',
        amount: rewardAmount,
        post: post._id,
        note: `Escrow locked for "${post.title}"`,
        createdAt: new Date(),
      });

      if (author.walletTransactions.length > 200) {
        author.walletTransactions = author.walletTransactions.slice(0, 200);
      }

      post.paymentStatus = 'escrowed';
    } else {
      post.paymentStatus = 'none';
    }

    if (author) {
      author.karma += 5;
      await author.save();
    }

    if (helper) {
      helper.karma += 15;
      helper.totalHelpsAccepted = (helper.totalHelpsAccepted || 0) + 1;
      await helper.save();
    }

    await post.save();

    await updateRequesterResponseStats(post.author, post.createdAt, post.acceptedAt);

    await createNotification({
      recipient: post.author,
      actor: req.user._id,
      type: 'offer_accepted',
      title: 'Task accepted',
      body: `${req.user.name} accepted your issue "${post.title}".`,
      post: post._id,
    });

    res.status(200).json({ message: 'Task accepted, karma points awarded!', post });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Helper marks accepted work as done
// @route   POST /api/posts/:id/done/:offerId
// @access  Private
const markWorkDone = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const offer = post.offers.id(req.params.offerId);

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    if (offer.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Only the accepted helper can mark work done' });
    }

    if (offer.status !== 'accepted') {
      return res.status(400).json({ message: 'Only accepted offers can be marked done' });
    }

    offer.completionStatus = 'marked_done';
    offer.helperMarkedDoneAt = new Date();
    offer.requesterDecisionAt = undefined;
    await post.save();

    await createNotification({
      recipient: post.author,
      actor: req.user._id,
      type: 'work_marked_done',
      title: 'Work marked as done',
      body: `${req.user.name} marked "${post.title}" as done. Please confirm.`,
      post: post._id,
    });

    res.status(200).json({ message: 'Marked as done. Waiting for requester confirmation.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Requester confirms or rejects completion
// @route   POST /api/posts/:id/confirm/:offerId
// @access  Private
const confirmWorkDone = async (req, res) => {
  const { isDone } = req.body;

  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Only the requester can confirm completion' });
    }

    const offer = post.offers.id(req.params.offerId);

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    if (offer.status !== 'accepted') {
      return res.status(400).json({ message: 'Only accepted offers can be confirmed' });
    }

    if (offer.completionStatus !== 'marked_done') {
      return res.status(400).json({ message: 'Helper has not marked this work as done yet' });
    }

    offer.requesterDecisionAt = new Date();

    if (Boolean(isDone)) {
      offer.completionStatus = 'confirmed_done';
      post.status = 'closed';

      const requester = await User.findById(post.author);
      const helper = await User.findById(offer.user);

      if (!requester || !helper) {
        return res.status(404).json({ message: 'Requester or helper account not found' });
      }

      const rewardAmount = roundCurrency(Number(post.price || 0));

      if (rewardAmount > 0) {
        const locked = roundCurrency(requester.walletLockedBalance);
        if (locked < rewardAmount) {
          return res.status(400).json({
            message: 'Escrow funds are missing for this task. Please contact support.',
          });
        }

        requester.walletLockedBalance = roundCurrency(locked - rewardAmount);
        helper.walletBalance = roundCurrency(Number(helper.walletBalance || 0) + rewardAmount);

        requester.walletTransactions = Array.isArray(requester.walletTransactions) ? requester.walletTransactions : [];
        helper.walletTransactions = Array.isArray(helper.walletTransactions) ? helper.walletTransactions : [];

        requester.walletTransactions.unshift({
          type: 'escrow_release',
          amount: rewardAmount,
          post: post._id,
          note: `Escrow released to helper for "${post.title}"`,
          createdAt: new Date(),
        });

        helper.walletTransactions.unshift({
          type: 'escrow_release',
          amount: rewardAmount,
          post: post._id,
          note: `Payment received for "${post.title}"`,
          createdAt: new Date(),
        });

        if (requester.walletTransactions.length > 200) {
          requester.walletTransactions = requester.walletTransactions.slice(0, 200);
        }
        if (helper.walletTransactions.length > 200) {
          helper.walletTransactions = helper.walletTransactions.slice(0, 200);
        }

        const invoice = await Invoice.create({
          post: post._id,
          requester: post.author,
          helper: offer.user,
          amount: rewardAmount,
          status: 'paid',
          paidAt: new Date(),
        });

        post.paymentStatus = 'paid';
        post.invoiceId = invoice._id;
      } else {
        post.paymentStatus = 'none';
      }

      const requesterUnlocked = [];
      const helperUnlocked = [];

      requester.totalRequestsClosed = (requester.totalRequestsClosed || 0) + 1;
      requesterUnlocked.push(...evaluateAndUnlockBadges(requester, 'requester'));

      helper.totalHelpsCompleted = (helper.totalHelpsCompleted || 0) + 1;

      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      if (!helper.lastHelpCompletedDate) {
        helper.helpStreakDays = 1;
      } else {
        const last = new Date(helper.lastHelpCompletedDate);
        const lastMidnight = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const diffDays = Math.floor((todayMidnight.getTime() - lastMidnight.getTime()) / (24 * 60 * 60 * 1000));

        if (diffDays <= 0) {
          helper.helpStreakDays = Math.max(1, helper.helpStreakDays || 1);
        } else if (diffDays === 1) {
          helper.helpStreakDays = (helper.helpStreakDays || 0) + 1;
        } else {
          helper.helpStreakDays = 1;
        }
      }

      helper.lastHelpCompletedDate = new Date();
      helperUnlocked.push(...evaluateAndUnlockBadges(helper, 'helper'));

      await requester.save();
      await helper.save();
      await post.save();

      for (const badge of requesterUnlocked) {
        await createNotification({
          recipient: post.author,
          actor: req.user._id,
          type: 'badge_unlocked',
          title: badge.title,
          body: badge.body,
          post: post._id,
        });
      }

      for (const badge of helperUnlocked) {
        await createNotification({
          recipient: offer.user,
          actor: req.user._id,
          type: 'badge_unlocked',
          title: badge.title,
          body: badge.body,
          post: post._id,
        });
      }

      await createNotification({
        recipient: offer.user,
        actor: req.user._id,
        type: 'work_confirmed',
        title: 'Work confirmed',
        body: `${req.user.name} confirmed completion for "${post.title}".`,
        post: post._id,
      });

      if (rewardAmount > 0) {
        await createNotification({
          recipient: offer.user,
          actor: req.user._id,
          type: 'payment_received',
          title: 'Payment released',
          body: `₹${rewardAmount.toFixed(2)} was released to your wallet for "${post.title}".`,
          post: post._id,
        });
      }

      return res.status(200).json({
        message:
          rewardAmount > 0
            ? `Work confirmed and ₹${rewardAmount.toFixed(2)} released to helper.`
            : 'Work confirmed as done. Request closed.',
      });
    }

    offer.completionStatus = 'rejected_done';
    post.status = 'accepted';
    await post.save();

    res.status(200).json({ message: 'Marked as not done. Helper can update and mark done again.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Submit rating after work completion
// @route   POST /api/posts/:id/rate
// @access  Private
const submitRating = async (req, res) => {
  const ratingValue = Number(req.body && req.body.rating);

  if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    return res.status(400).json({ message: 'Rating must be an integer from 1 to 5' });
  }

  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.status !== 'closed') {
      return res.status(400).json({ message: 'Ratings are available only after work is confirmed done' });
    }

    const acceptedOffer = post.offers.find((offer) => {
      if (offer.status !== 'accepted') return false;
      return offer.completionStatus === 'confirmed_done';
    });

    if (!acceptedOffer) {
      return res.status(400).json({ message: 'No confirmed completion found for this issue' });
    }

    const isRequester = post.author.toString() === req.user._id.toString();
    const isHelper = acceptedOffer.user.toString() === req.user._id.toString();

    if (!isRequester && !isHelper) {
      return res.status(403).json({ message: 'Only the requester and accepted helper can rate this issue' });
    }

    if (isRequester) {
      if (acceptedOffer.ratingByRequester) {
        return res.status(400).json({ message: 'You have already rated the helper for this issue' });
      }

      acceptedOffer.ratingByRequester = ratingValue;
      acceptedOffer.requesterRatedAt = new Date();
      await applyRatingToUser(acceptedOffer.user, ratingValue);
      await post.save();

      await createNotification({
        recipient: acceptedOffer.user,
        actor: req.user._id,
        type: 'rated',
        title: 'You received a rating',
        body: `${req.user.name} rated you ${ratingValue}/5 for "${post.title}".`,
        post: post._id,
      });

      return res.status(200).json({ message: 'Helper rated successfully', post });
    }

    if (acceptedOffer.ratingByHelper) {
      return res.status(400).json({ message: 'You have already rated the requester for this issue' });
    }

    acceptedOffer.ratingByHelper = ratingValue;
    acceptedOffer.helperRatedAt = new Date();
    await applyRatingToUser(post.author, ratingValue);
    await post.save();

    await createNotification({
      recipient: post.author,
      actor: req.user._id,
      type: 'rated',
      title: 'You received a rating',
      body: `${req.user.name} rated you ${ratingValue}/5 for "${post.title}".`,
      post: post._id,
    });

    res.status(200).json({ message: 'Requester rated successfully', post });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get user's posts
// @route   GET /api/posts/me
// @access  Private
const getMyPosts = async (req, res) => {
  try {
    await createLifecycleRemindersForUser(req.user._id);

    const posts = await Post.find({ author: req.user._id }).populate(
      'offers.user',
      'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
    );
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get posts user helped
// @route   GET /api/posts/helped
// @access  Private
const getHelpedPosts = async (req, res) => {
  try {
    await createLifecycleRemindersForUser(req.user._id);

    // A post is helped if the user has an accepted offer
    const posts = await Post.find({
      'offers': {
        $elemMatch: {
          user: req.user._id,
          status: 'accepted'
        }
      }
    })
      .populate(
        'author',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      )
      .populate(
        'offers.user',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      );

    const shaped = posts.map((post) => {
      const acceptedOffer = post.offers.find(
        (offer) => {
          if (offer.status !== 'accepted') return false;

          const offerUserId =
            offer.user && offer.user._id
              ? offer.user._id.toString()
              : offer.user
              ? offer.user.toString()
              : null;

          return offerUserId === req.user._id.toString();
        }
      );

      return {
        ...post._doc,
        helperOffer: acceptedOffer || null,
      };
    });

    res.json(shaped);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single post by ID
// @route   GET /api/posts/:id
// @access  Private
const getPostById = async (req, res) => {
  try {
    await createLifecycleRemindersForUser(req.user._id);

    const post = await Post.findById(req.params.id)
      .populate(
        'author',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      )
      .populate(
        'acceptedBy',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      )
      .populate(
        'offers.user',
        'name karma ratingAverage ratingCount totalRequestsCreated totalRequestsClosed totalHelpsAccepted totalHelpsCompleted avgResponseMinutes'
      );

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Private (author only)
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the post author can delete this issue' });
    }

    if (post.status === 'accepted' || post.paymentStatus === 'escrowed') {
      return res.status(400).json({
        message: 'Cannot delete an accepted request while funds are locked in escrow',
      });
    }

    await post.deleteOne();
    res.status(200).json({ message: 'Issue deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
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
};
