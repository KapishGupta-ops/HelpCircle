# HelpCircle - Hyperlocal Help Network

HelpCircle is a hyperlocal Reddit-style help network designed for small neighborhood requests. It allows neighbors to post help requests and offer assistance to others in their vicinity.

## Tech Stack
- **Frontend**: Pure HTML5, Tailwind CSS v3 (CDN), Vanilla JavaScript
- **Backend**: Node.js, Express.js, MongoDB (Mongoose)
- **Auth**: JWT-based authentication
- **Maps**: Google Maps API for location-based features
- **Media Storage**: Cloudinary (address proof/image uploads)

## Features
- **JWT Auth**: Secure user registration and login.
- **Aadhaar Verification**: Demo 12-digit Aadhaar verification with a mock OTP flow (OTP: 123456).
- **Address Verification**: Mock address and pincode verification.
- **Geolocation**: Browser-based capture of user location during registration and profile updates.
- **Create Post**: Users can request help with various categories (Notes, Charger, Bike Repair, Groceries, Ride, Medical, Other).
- **Urgency**: Urgent posts are marked with 🔥 and pinned to the top of the feed.
- **Location-based Feed**: Only posts within a 10km radius are shown, with distances calculated using the Haversine formula.
- **Karma System**: Users earn karma points for helping others (+15 for helper, +5 for author when help is accepted).
- **Google Maps Integration**:
  - Centers on the user's location (blue marker).
  - Shows nearby posts as orange/red markers.
  - Smooth scroll to post cards when clicking markers.
- **Responsive Design**: Mobile-first UI with toast notifications.

## Folder Structure
```
helpcircle/
├── backend/
│   ├── config/db.js
│   ├── models/
│   │   ├── User.js
│   │   └── Post.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── posts.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── postController.js
│   ├── middleware/auth.js
│   ├── utils/haversine.js
│   ├── server.js
│   ├── .env
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── profile.html
│   ├── css/style.css
│   └── js/
│       ├── utils.js
│       ├── auth.js
│       ├── posts.js
│       ├── map.js
│       └── main.js
└── README.md
```

## Setup Instructions

### Backend
1. Navigate to the `backend` directory: `cd helpcircle/backend`
2. Install dependencies: `npm install`
3. Configure your `.env` file (set `MONGO_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`).
4. Start the server: `npm run start` or `npm run dev` (for nodemon).

### Cloudinary Setup
1. Create a Cloudinary account and copy your Cloud Name, API Key, and API Secret from the dashboard.
2. Add the following values in `backend/.env`:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - Optional: `CLOUDINARY_FOLDER` (default: `helpcircle`)

### Frontend
1. Open `frontend/index.html` in your browser.
2. **Note**: You'll need to replace `YOUR_API_KEY` in `index.html` with a valid Google Maps API Key for the map features to function.

## Usage
1. **Register**: Create a new account with your Aadhaar (12 digits), address, and capture your location. Use mock OTP `123456`.
2. **Login**: Sign in with your registered email and password.
3. **Feed**: View help requests within 10km of your current location.
4. **Post**: Use the floating "+" button to create a new help request.
5. **Help**: Click "Offer Help" on a post to volunteer.
6. **Karma**: Track your contributions on your profile page.
