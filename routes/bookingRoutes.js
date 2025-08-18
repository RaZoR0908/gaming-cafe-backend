const express = require('express');
const router = express.Router();
// 1. Update the import to include all necessary functions
const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
  extendBooking,
  getSlotAvailability,
  createWalkInBooking,
} = require('../controllers/bookingController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// --- CUSTOMER ROUTES ---
// Create a new booking
router.route('/').post(protect, createBooking);
// Get all bookings for the logged-in customer
router.route('/my-bookings').get(protect, getMyBookings);

// --- OWNER ROUTES ---
// Get all bookings for a specific cafe owned by the logged-in user
router.route('/owner/:cafeId').get(protect, isOwner, getOwnerBookings);
// Create a new walk-in booking
router.route('/walk-in').post(protect, isOwner, createWalkInBooking);
// Update a specific booking's status
router.route('/:id').put(protect, isOwner, updateBookingStatus);
// Extend a specific booking's duration
router.route('/:id/extend').patch(protect, isOwner, extendBooking);

// --- PUBLIC ROUTE ---
// Get real-time slot availability for a cafe
router.route('/availability/:cafeId').get(getSlotAvailability);


module.exports = router;
