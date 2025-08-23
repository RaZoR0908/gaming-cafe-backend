const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

// Helper function to convert "02:00 PM" or "2:00 PM" to a 24-hour number like 14
const timeToHour = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours] = time.split(':');
  
  if (hours === '12') {
    hours = '00';
  }
  if (modifier && modifier.toUpperCase() === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }
  return parseInt(hours, 10);
};

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

    // --- NEW: Smarter Availability Check ---
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await Booking.find({
      cafe: cafeId,
      roomType,
      systemType,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'Confirmed',
    });

    const bookingStartHour = timeToHour(startTime);
    const bookingEndHour = bookingStartHour + duration;
    
    // Check every hour within the new booking's duration
    for (let hour = bookingStartHour; hour < bookingEndHour; hour++) {
      let bookedCountAtTime = 0;
      existingBookings.forEach(booking => {
          const existingStart = timeToHour(booking.startTime);
          const existingEnd = existingStart + booking.duration;
          // Check for any overlap
          if (hour >= existingStart && hour < existingEnd) {
              bookedCountAtTime += booking.numberOfSystems;
          }
      });
      const availableCount = system.count - bookedCountAtTime;
      if (numberOfSystems > availableCount) {
        res.status(400);
        throw new Error(`Sorry, only ${availableCount} ${systemType}(s) are available at ${hour}:00.`);
      }
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

const createWalkInBooking = async (req, res) => {
  try {
    const { cafeId, bookingType, walkInCustomerName, systemsBooked, bookingDate, startTime, duration } = req.body;

    // Validate duration is in 30-minute intervals
    if (duration % 0.5 !== 0) {
      res.status(400);
      throw new Error('Duration must be in 30-minute intervals');
    }

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    if (cafe.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to create a booking for this cafe');
    }

    let totalPrice = 0;
    const validatedSystems = [];

    // Validate all requested systems and calculate total price
    for (const systemBooking of systemsBooked) {
      const { roomType, systemType, numberOfSystems } = systemBooking;
      
      const room = cafe.rooms.find(r => r.name === roomType);
      if (!room) {
        res.status(400);
        throw new Error(`Room '${roomType}' not found at this cafe.`);
      }
      
      const systemsOfType = room.systems.filter(s => s.type === systemType);
      if (systemsOfType.length === 0) {
        res.status(400);
        throw new Error(`System type '${systemType}' not found in '${roomType}'.`);
      }

      // Check availability for this system type in this room
      const startOfDay = new Date(bookingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingBookings = await Booking.find({
        cafe: cafeId,
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['Booked', 'Active'] },
        $or: [
          // Old format bookings
          { roomType, systemType },
          // New format bookings
          { 'systemsBooked.roomType': roomType, 'systemsBooked.systemType': systemType }
        ]
      });

      const bookingStartHour = timeToHour(startTime);
      const bookingEndHour = bookingStartHour + duration;
      
      // Check every hour within the new booking's duration
      for (let hour = bookingStartHour; hour < bookingEndHour; hour++) {
        let bookedCountAtTime = 0;
        existingBookings.forEach(booking => {
          const existingStart = timeToHour(booking.startTime);
          const existingEnd = existingStart + booking.duration;
          // Check for any overlap
          if (hour >= existingStart && hour < existingEnd) {
            // Handle both old and new booking formats
            if (booking.systemsBooked && booking.systemsBooked.length > 0) {
              const matchingSystem = booking.systemsBooked.find(s => 
                s.roomType === roomType && s.systemType === systemType
              );
              if (matchingSystem) {
                bookedCountAtTime += matchingSystem.numberOfSystems;
              }
            } else if (booking.roomType === roomType && booking.systemType === systemType) {
              bookedCountAtTime += booking.numberOfSystems;
            }
          }
        });
        
        const availableCount = systemsOfType.length - bookedCountAtTime;
        if (numberOfSystems > availableCount) {
          res.status(400);
          throw new Error(`Sorry, only ${availableCount} ${systemType}(s) are available in ${roomType} at ${hour}:00.`);
        }
      }

      const pricePerHour = systemsOfType[0].pricePerHour;
      const systemTotalPrice = duration * pricePerHour * numberOfSystems;
      totalPrice += systemTotalPrice;

      validatedSystems.push({
        roomType,
        systemType,
        numberOfSystems,
        pricePerHour
      });
    }

    const booking = new Booking({
      cafe: cafeId,
      owner: cafe.owner,
      walkInCustomerName: bookingType === 'group' ? walkInCustomerName : undefined,
      systemsBooked: validatedSystems,
      bookingDate,
      startTime,
      duration,
      totalPrice,
      status: 'Booked', // Start as 'Booked', will become 'Active' when systems are assigned
    });

    const createdBooking = await booking.save();
    res.status(201).json(createdBooking);
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    Get real-time slot availability for a cafe on a specific date
 * @route   GET /api/bookings/availability/:cafeId?date=YYYY-MM-DD
 * @access  Public
 */
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
          const slotHour = timeToHour(slot);
          let bookedCount = 0;

          bookings.forEach(booking => {
            if (booking.roomType === room.roomType && booking.systemType === system.systemType) {
              const bookingStartHour = timeToHour(booking.startTime);
              const bookingDuration = typeof booking.duration === 'number' ? booking.duration : 0;
              const bookingEndHour = bookingStartHour + bookingDuration;

              if (slotHour >= bookingStartHour && slotHour < bookingEndHour) {
                bookedCount += booking.numberOfSystems;
              }
            }
          });
          
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

    const now = new Date();
    const pastBookings = await Booking.find({
      cafe: cafeId,
      status: 'Confirmed',
    });

    for (const booking of pastBookings) {
      const bookingStartHour = timeToHour(booking.startTime);
      const bookingDateTime = new Date(booking.bookingDate);
      bookingDateTime.setHours(bookingStartHour, 0, 0, 0);

      const bookingEndDateTime = new Date(bookingDateTime.getTime() + booking.duration * 60 * 60 * 1000);

      if (bookingEndDateTime < now) {
        booking.status = 'Completed';
        await booking.save();
      }
    }

    // --- UPDATED LOGIC: Fetch bookings and populate customer details ---
    const allBookingsForCafe = await Booking.find({ cafe: cafeId })
      // This tells the database to find the user linked to the 'customer' ID
      // and include their 'name' in the response.
      .populate('customer', 'name')
      .sort({ bookingDate: -1, startTime: 1 }); // Sort by most recent

    res.json(allBookingsForCafe);
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


/**
 * @desc    Assign systems to a booking and start the session
 * @route   POST /api/bookings/assign-systems
 * @access  Private/Owner
 */
const assignSystemsAndStartSession = async (req, res) => {
  try {
    const { bookingId, systemAssignments } = req.body;
    // systemAssignments: [{ roomType: 'AC Room', systemIds: ['PC01', 'PC02'] }]

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404);
      throw new Error('Booking not found');
    }

    if (booking.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to manage this booking');
    }

    if (booking.status !== 'Booked') {
      res.status(400);
      throw new Error('Only booked sessions can be started');
    }

    const cafe = await Cafe.findById(booking.cafe);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    // Validate and assign systems
    const assignedSystems = [];
    for (const assignment of systemAssignments) {
      const { roomType, systemIds } = assignment;
      
      const room = cafe.rooms.find(r => r.name === roomType);
      if (!room) {
        res.status(400);
        throw new Error(`Room '${roomType}' not found`);
      }

      for (const systemId of systemIds) {
        const system = room.systems.find(s => s.systemId === systemId);
        if (!system) {
          res.status(400);
          throw new Error(`System '${systemId}' not found in '${roomType}'`);
        }

        if (system.status !== 'Available') {
          res.status(400);
          throw new Error(`System '${systemId}' is not available`);
        }

        // Mark system as active
        system.status = 'Active';
        system.activeBooking = booking._id;
        
        assignedSystems.push({
          systemId: systemId,
          roomType: roomType
        });
      }
    }

    // Update booking
    booking.status = 'Active';
    booking.assignedSystems = assignedSystems;
    booking.sessionStartTime = new Date();
    
    // Calculate session end time
    const sessionEndTime = new Date();
    sessionEndTime.setTime(sessionEndTime.getTime() + (booking.duration * 60 * 60 * 1000));
    booking.sessionEndTime = sessionEndTime;

    await cafe.save();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Session started successfully',
      data: { booking, cafe }
    });
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    End an active session and free up systems
 * @route   POST /api/bookings/end-session
 * @access  Private/Owner
 */
const endSession = async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404);
      throw new Error('Booking not found');
    }

    if (booking.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to manage this booking');
    }

    if (booking.status !== 'Active') {
      res.status(400);
      throw new Error('Only active sessions can be ended');
    }

    const cafe = await Cafe.findById(booking.cafe);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    // Free up assigned systems
    if (booking.assignedSystems && booking.assignedSystems.length > 0) {
      for (const assignedSystem of booking.assignedSystems) {
        const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
        if (room) {
          const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
          if (system) {
            system.status = 'Available';
            system.activeBooking = null;
          }
        }
      }
    }

    booking.status = 'Completed';
    
    await cafe.save();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Session ended successfully',
      data: { booking, cafe }
    });
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    Get available systems for assignment
 * @route   GET /api/bookings/available-systems/:cafeId
 * @access  Private/Owner
 */
const getAvailableSystemsForAssignment = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const { roomTypes, systemTypes } = req.query;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    if (cafe.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to view this cafe');
    }

    const roomTypesArray = roomTypes ? roomTypes.split(',') : [];
    const systemTypesArray = systemTypes ? systemTypes.split(',') : [];

    const availableSystems = {};

    for (const room of cafe.rooms) {
      if (roomTypesArray.length === 0 || roomTypesArray.includes(room.name)) {
        availableSystems[room.name] = {};
        
        for (const systemType of systemTypesArray) {
          const systemsOfType = room.systems.filter(s => 
            s.type === systemType && s.status === 'Available'
          );
          
          if (systemsOfType.length > 0) {
            availableSystems[room.name][systemType] = systemsOfType.map(s => ({
              systemId: s.systemId,
              specs: s.specs
            }));
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      data: availableSystems
    });
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

/**
 * @desc    Auto-complete expired sessions
 * @route   POST /api/bookings/auto-complete-sessions
 * @access  Private/Owner (or can be called by a cron job)
 */
const autoCompleteExpiredSessions = async (req, res) => {
  try {
    const now = new Date();
    
    // Find all active bookings that have passed their end time
    const expiredBookings = await Booking.find({
      status: 'Active',
      sessionEndTime: { $lte: now }
    });

    const completedBookings = [];

    for (const booking of expiredBookings) {
      const cafe = await Cafe.findById(booking.cafe);
      if (cafe) {
        // Free up assigned systems
        if (booking.assignedSystems && booking.assignedSystems.length > 0) {
          for (const assignedSystem of booking.assignedSystems) {
            const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
            if (room) {
              const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
              if (system) {
                system.status = 'Available';
                system.activeBooking = null;
              }
            }
          }
          await cafe.save();
        }

        // Update booking status
        booking.status = 'Completed';
        await booking.save();
        
        completedBookings.push(booking._id);
      }
    }

    res.status(200).json({
      success: true,
      message: `${completedBookings.length} sessions auto-completed`,
      data: { completedBookings }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
  assignSystemsAndStartSession,
  endSession,
  getAvailableSystemsForAssignment,
  autoCompleteExpiredSessions,
};
