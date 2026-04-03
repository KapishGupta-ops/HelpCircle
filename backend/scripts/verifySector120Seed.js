require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');

async function verifySeed() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const emails = [
    'aarav.sector120@helpcircle.in',
    'neha.sector120@helpcircle.in',
    'rohit.sector120@helpcircle.in',
    'isha.sector120@helpcircle.in',
    'admin@helpcircle.in',
  ];

  const titles = [
    'Need urgent BP medicine pickup',
    'Need laptop charger for 2 hours',
    'Scooter puncture help near gate',
    'Need grocery essentials delivery',
  ];

  const users = await User.find({ email: { $in: emails } })
    .select('name email role')
    .lean();

  const posts = await Post.find({ title: { $in: titles } })
    .select('title category status')
    .lean();

  console.log('Users found:', users.length);
  users.forEach((u) => {
    console.log(`${u.email} | role=${u.role}`);
  });

  console.log('Posts found:', posts.length);
  posts.forEach((p) => {
    console.log(`${p.title} | ${p.category} | ${p.status}`);
  });
}

verifySeed()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Verification failed:', err.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      // no-op
    }
    process.exit(1);
  });
