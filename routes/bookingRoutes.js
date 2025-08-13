const express = require('express');
const router = express.Router();
// 1. Update the import to include the new getMyBookings function
const { createBooking, getMyBookings } = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

// This route handles creating a new booking.
router.route('/').post(protect, createBooking);

// 2. ADD THIS NEW ROUTE
// This route will allow a logged-in user to see all of their own bookings.
router.route('/my-bookings').get(protect, getMyBookings);

module.exports = router;
