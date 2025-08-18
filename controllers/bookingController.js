const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new booking (for customers)
 * @route   POST /api/bookings
 * @access  Private/Customer
 */
const createBooking = async (req, res) => {
  try {
    const { cafeId, roomType, systemType, bookingDate, startTime, duration, numberOfSystems } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    const room = cafe.rooms.find(r => r.roomType === roomType);
    if (!room) {
      res.status(400);
      throw new Error(`Room type '${roomType}' not found at this cafe.`);
    }

    const system = room.systems.find(s => s.systemType === systemType);
    if (!system) {
      res.status(400);
      throw new Error(`System type '${systemType}' not found in the '${roomType}'.`);
    }

    // --- REAL-TIME AVAILABILITY CHECK ---
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await Booking.find({
      cafe: cafeId,
      roomType,
      systemType,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      startTime: startTime,
      status: 'Confirmed',
    });

    const bookedCount = existingBookings.reduce((acc, b) => acc + b.numberOfSystems, 0);
    const availableCount = system.count - bookedCount;

    if (numberOfSystems > availableCount) {
      res.status(400);
      throw new Error(`Sorry, only ${availableCount} ${systemType}(s) are available at that time.`);
    }

    const pricePerHour = system.pricePerHour;
    const totalPrice = duration * pricePerHour * numberOfSystems;

    const booking = new Booking({
      customer: req.user._id,
      cafe: cafeId,
      owner: cafe.owner,
      roomType,
      systemType,
      numberOfSystems,
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

/**
 * @desc    Create a walk-in booking (for owners)
 * @route   POST /api/bookings/walk-in
 * @access  Private/Owner
 */
const createWalkInBooking = async (req, res) => {
  try {
    const { cafeId, roomType, systemType, bookingDate, startTime, duration, numberOfSystems } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    // Security Check: Make sure the logged-in user owns this cafe
    if (cafe.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to create a booking for this cafe');
    }

    const room = cafe.rooms.find(r => r.roomType === roomType);
    if (!room) { /* ... error handling ... */ }
    const system = room.systems.find(s => s.systemType === systemType);
    if (!system) { /* ... error handling ... */ }

    // Perform the same availability check
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);
    const existingBookings = await Booking.find({
      cafe: cafeId, roomType, systemType,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      startTime: startTime, status: 'Confirmed',
    });
    const bookedCount = existingBookings.reduce((acc, b) => acc + b.numberOfSystems, 0);
    const availableCount = system.count - bookedCount;
    if (numberOfSystems > availableCount) {
      res.status(400);
      throw new Error(`Sorry, only ${availableCount} ${systemType}(s) are available at that time.`);
    }

    const pricePerHour = system.pricePerHour;
    const totalPrice = duration * pricePerHour * numberOfSystems;

    const booking = new Booking({
      // Note: The 'customer' field is left empty for a walk-in
      cafe: cafeId,
      owner: cafe.owner,
      roomType,
      systemType,
      numberOfSystems,
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


const getSlotAvailability = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const { date } = req.query;

    if (!date) {
      res.status(400);
      throw new Error('Please provide a date.');
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      cafe: cafeId,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'Confirmed',
    });

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    const timeSlots = [];
    const opening = parseInt(cafe.openingTime.split(':')[0]);
    const closing = parseInt(cafe.closingTime.split(':')[0]);

    for (let hour = opening; hour < closing; hour++) {
      let displayHour = hour % 12;
      if (displayHour === 0) displayHour = 12;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      timeSlots.push(`${String(displayHour).padStart(2, '0')}:00 ${ampm}`);
    }

    const availability = {};

    cafe.rooms.forEach(room => {
      availability[room.roomType] = {};
      room.systems.forEach(system => {
        availability[room.roomType][system.systemType] = {};
        timeSlots.forEach(slot => {
          const bookingsForSlot = bookings.filter(b => 
            b.roomType === room.roomType && 
            b.systemType === system.systemType && 
            b.startTime === slot
          );
          const bookedCount = bookingsForSlot.reduce((acc, b) => acc + b.numberOfSystems, 0);
          const availableCount = system.count - bookedCount;
          availability[room.roomType][system.systemType][slot] = availableCount;
        });
      });
    });

    res.json(availability);
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
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

const extendBooking = async (req, res) => {
  try {
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

      const room = cafe.rooms.find(r => r.roomType === booking.roomType);
      const system = room ? room.systems.find(s => s.systemType === booking.systemType) : null;

      if (!system) {
        res.status(400);
        throw new Error(`System type from original booking not found.`);
      }

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
  createWalkInBooking,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
  extendBooking,
  getSlotAvailability,
};
