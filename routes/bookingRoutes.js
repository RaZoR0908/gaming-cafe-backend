const express = require('express');
const router = express.Router();
// 1. Update the import to include the new updateBookingStatus function
const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
} = require('../controllers/bookingController');
// The import for middleware is correct
const { protect, isOwner } = require('../middleware/authMiddleware');

// This route allows a logged-in user to create a booking.
router.route('/').post(protect, createBooking);

// This route allows a logged-in customer to see their own bookings.
router.route('/my-bookings').get(protect, getMyBookings);

// This route allows a logged-in cafe owner to see all bookings for one of their cafes.
router.route('/owner/:cafeId').get(protect, isOwner, getOwnerBookings);

// 2. ADD THIS NEW ROUTE
// This route allows a logged-in owner to update a specific booking's status.
router.route('/:id').put(protect, isOwner, updateBookingStatus);

module.exports = router;
