const express = require('express');
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
  extendBooking,
} = require('../controllers/bookingController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// ... (other routes are correct)
router.route('/').post(protect, createBooking);
router.route('/my-bookings').get(protect, getMyBookings);
router.route('/owner/:cafeId').get(protect, isOwner, getOwnerBookings);

// This route is for updating a booking's STATUS
router.route('/:id').put(protect, isOwner, updateBookingStatus);

// FIX: This route is for EXTENDING a booking. We change the method to PATCH.
router.route('/:id/extend').patch(protect, isOwner, extendBooking);


module.exports = router;
