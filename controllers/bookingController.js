const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new booking
 * @route   POST /api/bookings
 * @access  Private/Customer
 */
const createBooking = async (req, res) => {
  try {
    // 1. We now also need the 'roomType' from the user and no longer take 'totalPrice'.
    const { cafeId, roomType, systemType, bookingDate, startTime, duration } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    // 2. Find the specific room the user wants to book.
    const room = cafe.rooms.find(r => r.roomType === roomType);
    if (!room) {
      res.status(400);
      throw new Error(`Room type '${roomType}' not found at this cafe.`);
    }

    // 3. Find the system within that specific room.
    const system = room.systems.find(s => s.systemType === systemType);
    if (!system) {
      res.status(400);
      throw new Error(`System type '${systemType}' not found in the '${roomType}'.`);
    }

    // 4. Get the price from that specific system.
    const pricePerHour = system.pricePerHour;

    // 5. Automatically calculate the total price on the backend.
    const totalPrice = duration * pricePerHour;

    const booking = new Booking({
      customer: req.user._id,
      cafe: cafeId,
      owner: cafe.owner,
      roomType, // Save the room type with the booking
      systemType,
      bookingDate,
      startTime,
      duration,
      totalPrice, // Use the securely calculated price
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

const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (booking) {
      if (booking.owner.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('User not authorized to update this booking');
      }
      booking.status = status;
      const updatedBooking = await booking.save();
      res.json(updatedBooking);
    } else {
      res.status(404);
      throw new Error('Booking not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

/**
 * @desc    Extend a booking's duration
 * @route   PUT /api/bookings/:id/extend
 * @access  Private/Owner
 */
const extendBooking = async (req, res) => {
  try {
    // The owner only needs to send how many hours to add.
    const { hoursToAdd } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (booking) {
      if (booking.owner.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('User not authorized');
      }

      const cafe = await Cafe.findById(booking.cafe);
      if (!cafe) {
        res.status(404);
        throw new Error('Cafe not found');
      }

      // Find the correct room and system from the original booking to get the price.
      const room = cafe.rooms.find(r => r.roomType === booking.roomType);
      const system = room ? room.systems.find(s => s.systemType === booking.systemType) : null;

      if (!system) {
        res.status(400);
        throw new Error(`System type from original booking not found.`);
      }

      // Automatically calculate the additional price.
      const pricePerHour = system.pricePerHour;
      const priceToAdd = hoursToAdd * pricePerHour;

      booking.duration += parseFloat(hoursToAdd);
      booking.totalPrice += priceToAdd;

      const updatedBooking = await booking.save();
      res.json(updatedBooking);
    } else {
      res.status(404);
      throw new Error('Booking not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


module.exports = {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
  extendBooking,
};
