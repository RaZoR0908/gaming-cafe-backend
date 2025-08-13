const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new booking
 * @route   POST /api/bookings
 * @access  Private/Customer
 */
const createBooking = async (req, res) => {
  try {
    const { cafeId, systemType, bookingDate, startTime, duration, totalPrice } =
      req.body;
    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }
    const booking = new Booking({
      customer: req.user._id,
      cafe: cafeId,
      owner: cafe.owner,
      systemType,
      bookingDate,
      startTime,
      duration,
      totalPrice,
    });
    const createdBooking = await booking.save();
    res.status(201).json(createdBooking);
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Get bookings for the logged-in customer
 * @route   GET /api/bookings/my-bookings
 * @access  Private/Customer
 */
const getMyBookings = async (req, res) => {
  try {
    // 1. Find all bookings in the database where the 'customer' field
    // matches the ID of the logged-in user.
    const bookings = await Booking.find({ customer: req.user._id });

    // 2. Send the list of bookings back as a JSON response.
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};


// UPDATE THE EXPORTS AT THE BOTTOM
module.exports = {
  createBooking,
  getMyBookings, // Add the new function here
};
