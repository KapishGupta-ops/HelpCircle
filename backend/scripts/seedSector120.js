require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');

async function seedSector120() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const usersData = [
    {
      name: 'Aarav Sharma',
      email: 'aarav.sector120@helpcircle.in',
      password: 'Aarav@120',
      aadhaarNumber: 'XXXXXXXX1234',
      aadhaarVerified: true,
      flatNumber: 'A-304',
      streetName: 'Prateek Laurel',
      landmark: 'Near Sector 120 Market',
      district: 'Gautam Buddh Nagar',
      state: 'Uttar Pradesh',
      pincode: '201301',
      lat: 28.5859,
      lng: 77.3901,
      addressVerified: 'verified',
      preferredHelpCategories: ['Groceries', 'Medical', 'Ride'],
    },
    {
      name: 'Neha Gupta',
      email: 'neha.sector120@helpcircle.in',
      password: 'Neha@120',
      aadhaarNumber: 'XXXXXXXX5678',
      aadhaarVerified: true,
      flatNumber: 'B-902',
      streetName: 'Amrapali Zodiac',
      landmark: 'Opposite Cleo County',
      district: 'Gautam Buddh Nagar',
      state: 'Uttar Pradesh',
      pincode: '201301',
      lat: 28.5882,
      lng: 77.3928,
      addressVerified: 'verified',
      preferredHelpCategories: ['Notes', 'Charger', 'Ride'],
    },
    {
      name: 'Rohit Verma',
      email: 'rohit.sector120@helpcircle.in',
      password: 'Rohit@120',
      aadhaarNumber: 'XXXXXXXX2468',
      aadhaarVerified: true,
      flatNumber: 'C-1101',
      streetName: 'RG Residency',
      landmark: 'Near FNG Road',
      district: 'Gautam Buddh Nagar',
      state: 'Uttar Pradesh',
      pincode: '201301',
      lat: 28.5901,
      lng: 77.3889,
      addressVerified: 'verified',
      preferredHelpCategories: ['Bike Repair', 'Groceries', 'Other'],
    },
    {
      name: 'Isha Singh',
      email: 'isha.sector120@helpcircle.in',
      password: 'Isha@120',
      aadhaarNumber: 'XXXXXXXX1357',
      aadhaarVerified: true,
      flatNumber: 'D-406',
      streetName: 'Supertech Romano',
      landmark: 'Near Sector 121 Crossing',
      district: 'Gautam Buddh Nagar',
      state: 'Uttar Pradesh',
      pincode: '201301',
      lat: 28.5871,
      lng: 77.3952,
      addressVerified: 'verified',
      preferredHelpCategories: ['Medical', 'Notes', 'Groceries'],
    },
  ];

  const ensuredUsers = [];

  for (const userData of usersData) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      ensuredUsers.push(existing);
      continue;
    }

    const created = await User.create(userData);
    ensuredUsers.push(created);
  }

  const byEmail = Object.fromEntries(ensuredUsers.map((u) => [u.email, u]));

  const postsData = [
    {
      title: 'Need urgent BP medicine pickup',
      description:
        'Can someone pick up BP medicine from the Sector 120 pharmacy? I will reimburse immediately.',
      category: 'Medical',
      isUrgent: true,
      isSOS: false,
      price: 150,
      lat: 28.5858,
      lng: 77.3904,
      author: byEmail['aarav.sector120@helpcircle.in']._id,
      status: 'open',
    },
    {
      title: 'Need laptop charger for 2 hours',
      description:
        'My 65W USB-C charger stopped working. Need one temporarily for an online exam.',
      category: 'Charger',
      isUrgent: true,
      isSOS: false,
      price: 100,
      lat: 28.588,
      lng: 77.3925,
      author: byEmail['neha.sector120@helpcircle.in']._id,
      status: 'open',
    },
    {
      title: 'Scooter puncture help near gate',
      description:
        'My scooter has a puncture near main gate. Need quick help to move it to repair shop.',
      category: 'Bike Repair',
      isUrgent: false,
      isSOS: false,
      price: 200,
      lat: 28.5902,
      lng: 77.389,
      author: byEmail['rohit.sector120@helpcircle.in']._id,
      status: 'open',
    },
    {
      title: 'Need grocery essentials delivery',
      description:
        'Need milk, bread, and eggs from nearby store. Unable to step out due to fever.',
      category: 'Groceries',
      isUrgent: false,
      isSOS: false,
      price: 180,
      lat: 28.587,
      lng: 77.395,
      author: byEmail['isha.sector120@helpcircle.in']._id,
      status: 'open',
    },
  ];

  let createdPostsCount = 0;
  for (const postData of postsData) {
    const existingPost = await Post.findOne({
      title: postData.title,
      author: postData.author,
    });

    if (!existingPost) {
      await Post.create(postData);
      createdPostsCount += 1;
    }
  }

  await User.updateMany(
    { _id: { $in: ensuredUsers.map((u) => u._id) } },
    { $set: { totalRequestsCreated: 1 } }
  );

  const adminData = {
    name: 'HelpCircle Admin',
    email: 'admin@helpcircle.in',
    password: 'Admin@120',
    aadhaarNumber: 'XXXXXXXX9999',
    aadhaarVerified: true,
    flatNumber: 'HQ-1',
    streetName: 'Sector 120 Operations Desk',
    landmark: 'Near Noida Authority Park',
    district: 'Gautam Buddh Nagar',
    state: 'Uttar Pradesh',
    pincode: '201301',
    lat: 28.5885,
    lng: 77.3918,
    addressVerified: 'verified',
    role: 'admin',
  };

  let admin = await User.findOne({ email: adminData.email });
  if (!admin) {
    admin = await User.create(adminData);
  } else {
    admin.role = 'admin';
    await admin.save();
  }

  console.log('Ensured users:', ensuredUsers.length);
  console.log('New posts created:', createdPostsCount);
  console.log('Created admin:', admin.email);
  console.log('Admin password (plain, for login): Admin@120');
}

seedSector120()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seeding failed:', err.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      // no-op
    }
    process.exit(1);
  });
