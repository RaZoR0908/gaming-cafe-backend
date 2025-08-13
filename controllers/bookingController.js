const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

// ... (existing createBooking, getMyBookings, and getOwnerBookings functions are here)
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

const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.user._id });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const getOwnerBookings = async (req, res) => {
  try {
    const cafeId = req.params.cafeId;
    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }
    if (cafe.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to view these bookings');
    }
    const bookings = await Booking.find({ cafe: cafeId });
    res.json(bookings);
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Update a booking's status (e.g., to 'Cancelled' or 'Completed')
 * @route   PUT /api/bookings/:id
 * @access  Private/Owner
 */
const updateBookingStatus = async (req, res) => {
  try {
    // 1. Get the new status from the request body.
    const { status } = req.body;

    // 2. Find the booking to be updated by its ID from the URL parameter.
    const booking = await Booking.findById(req.params.id);

    // 3. If the booking is found...
    if (booking) {
      // 4. IMPORTANT SECURITY CHECK: Make sure the logged-in user is the owner of this booking.
      if (booking.owner.toString() !== req.user._id.toString()) {
        res.status(401); // Unauthorized
        throw new Error('User not authorized to update this booking');
      }

      // 5. Update the booking's status field.
      booking.status = status;

      // 6. Save the updated booking to the database.
      const updatedBooking = await booking.save();

      // 7. Send the updated booking back as the response.
      res.json(updatedBooking);
    } else {
      res.status(404);
      throw new Error('Booking not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


// UPDATE THE EXPORTS AT THE BOTTOM
module.exports = {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus, // Add the new function here
};
