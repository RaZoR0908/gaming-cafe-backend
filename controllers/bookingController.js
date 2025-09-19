const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');
const Wallet = require('../models/walletModel');
const Payment = require('../models/paymentModel');
const User = require('../models/userModel');

// Helper function to generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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
    const { cafeId, roomType, systemType, bookingDate, startTime, duration, numberOfSystems, phoneNumber, systemsBooked, friendCount } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    // Check if this is a multi-system booking (from mobile app with friends)
    if (systemsBooked && systemsBooked.length > 0) {
      // Multi-system booking logic
      let totalPrice = 0;
      const validatedSystems = [];

      // Validate all requested systems and calculate total price
      for (const systemBooking of systemsBooked) {
        const { roomType: reqRoomType, systemType: reqSystemType, numberOfSystems: reqNumberOfSystems } = systemBooking;
        
        const room = cafe.rooms.find(r => r.name === reqRoomType);
        if (!room) {
          res.status(400);
          throw new Error(`Room '${reqRoomType}' not found at this cafe.`);
        }
        
        const systemsOfType = room.systems.filter(s => s.type === reqSystemType);
        if (systemsOfType.length === 0) {
          res.status(400);
          throw new Error(`System type '${reqSystemType}' not found in '${reqRoomType}'.`);
        }

        // Check availability for this system type in this room
        const startOfDay = new Date(bookingDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(bookingDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingBookings = await Booking.find({
          cafe: cafeId,
          bookingDate: { $gte: startOfDay, $lte: endOfDay },
          status: 'Booked',
          $or: [
            // Old format bookings
            { roomType: reqRoomType, systemType: reqSystemType },
            // New format bookings
            { 'systemsBooked.roomType': reqRoomType, 'systemsBooked.systemType': reqSystemType }
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
                  s.roomType === reqRoomType && s.systemType === reqSystemType
                );
                if (matchingSystem) {
                  bookedCountAtTime += matchingSystem.numberOfSystems;
                }
              } else if (booking.roomType === reqRoomType && booking.systemType === reqSystemType) {
                bookedCountAtTime += booking.numberOfSystems;
              }
            }
          });
          
          const availableCount = systemsOfType.length - bookedCountAtTime;
          if (reqNumberOfSystems > availableCount) {
            res.status(400);
            throw new Error(`Sorry, only ${availableCount} ${reqSystemType}(s) are available in ${reqRoomType} at ${hour}:00.`);
          }
        }

        const pricePerHour = systemsOfType[0].pricePerHour;
        const systemTotalPrice = duration * pricePerHour * reqNumberOfSystems;
        totalPrice += systemTotalPrice;

        validatedSystems.push({
          roomType: reqRoomType,
          systemType: reqSystemType,
          numberOfSystems: reqNumberOfSystems,
          pricePerHour
        });
      }

      const booking = new Booking({
        customer: req.user._id,
        cafe: cafeId,
        owner: cafe.owner,
        systemsBooked: validatedSystems,
        bookingDate,
        startTime,
        duration,
        totalPrice,
        phoneNumber,
        friendCount: friendCount || 1,
        otp: generateOTP(), // Generate OTP for mobile bookings
        status: 'Pending Payment', // Set status as pending payment
        paymentStatus: 'pending',
        isPaid: false
      });

      const createdBooking = await booking.save();
      res.status(201).json(createdBooking);
    } else {
      // Single system booking logic (existing code)
      const room = cafe.rooms.find(r => r.name === roomType);
      if (!room) {
        res.status(400);
        throw new Error(`Room type '${roomType}' not found at this cafe.`);
      }

      const system = room.systems.find(s => s.type === systemType);
      if (!system) {
        res.status(400);
        throw new Error(`System type '${systemType}' not found in the '${roomType}'.`);
      }

      // --- NEW: Smarter Availability Check ---
      const startOfDay = new Date(bookingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all systems of the selected type in the room
      const systemsOfType = room.systems.filter(s => s.type === systemType);
      const totalSystemCount = systemsOfType.length;

      const existingBookings = await Booking.find({
        cafe: cafeId,
        roomType,
        systemType,
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        status: 'Booked',
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
        const availableCount = totalSystemCount - bookedCountAtTime;
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
        phoneNumber,
        otp: generateOTP(), // Generate OTP for mobile bookings
        status: 'Pending Payment', // Set status as pending payment
        paymentStatus: 'pending',
        isPaid: false
      });

      const createdBooking = await booking.save();
      res.status(201).json(createdBooking);
    }
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

const createWalkInBooking = async (req, res) => {
  try {
    const { cafeId, bookingType, walkInCustomerName, phoneNumber, systemsBooked, bookingDate, startTime, duration } = req.body;

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
        status: 'Booked',
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
      walkInCustomerName: walkInCustomerName, // Always save the customer name
      phoneNumber, // Save the phone number
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
 * @desc    Check availability for a specific booking request
 * @route   POST /api/bookings/check-availability
 * @access  Private/Customer
 */
const checkAvailability = async (req, res) => {
  try {
    const { cafeId, roomType, systemType, date, duration, numberOfSystems } = req.body;

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    const room = cafe.rooms.find(r => r.name === roomType);
    if (!room) {
      res.status(400);
      throw new Error(`Room type '${roomType}' not found at this cafe.`);
    }

    const systemsOfType = room.systems.filter(s => s.type === systemType);
    if (systemsOfType.length === 0) {
      res.status(400);
      throw new Error(`System type '${systemType}' not found in '${roomType}'.`);
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await Booking.find({
      cafe: cafeId,
      roomType,
      systemType,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'Booked',
    });

    // Check availability for current time + duration
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const bookingEndHour = currentHour + duration;
    
    let isAvailable = true;
    for (let hour = currentHour; hour < bookingEndHour; hour++) {
      let bookedCountAtTime = 0;
      existingBookings.forEach(booking => {
        const existingStart = timeToHour(booking.startTime);
        const existingEnd = existingStart + booking.duration;
        if (hour >= existingStart && hour < existingEnd) {
          bookedCountAtTime += booking.numberOfSystems;
        }
      });
      
      const availableCount = systemsOfType.length - bookedCountAtTime;
      if (numberOfSystems > availableCount) {
        isAvailable = false;
        break;
      }
    }

    res.json({ available: isAvailable });
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

    // Get both Booked and Active bookings for the date
    const bookings = await Booking.find({
      cafe: cafeId,
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['Booked', 'Active'] }, // Check both Booked and Active status
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
      availability[room.name] = {};
      room.systems.forEach(system => {
        availability[room.name][system.type] = {};
        timeSlots.forEach(slot => {
          const slotHour = timeToHour(slot);
          let bookedCount = 0;

          bookings.forEach(booking => {
            if (booking.roomType === room.name && booking.systemType === system.type) {
              const bookingStartHour = timeToHour(booking.startTime);
              const bookingDuration = typeof booking.duration === 'number' ? booking.duration : 0;
              const bookingEndHour = bookingStartHour + bookingDuration;

              if (slotHour >= bookingStartHour && slotHour < bookingEndHour) {
                bookedCount += booking.numberOfSystems;
              }
            }
          });
          
          // Check if this specific system is currently in use (Active status)
          let systemAvailable = 1; // Default: 1 system available
          
          if (system.status === 'Active') {
            // This system is currently in use, so it's not available
            systemAvailable = 0;
          } else if (system.status === 'Under Maintenance') {
            // This system is under maintenance, so it's not available
            systemAvailable = 0;
          }
          
          // For the time slot, consider both future bookings and current system status
          const availableCount = Math.max(0, systemAvailable - bookedCount);
          
          availability[room.name][system.type][slot] = availableCount;
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
    const bookings = await Booking.find({ customer: req.user._id })
      .sort({ createdAt: -1 }); // Sort by creation time, latest first
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
      status: 'Active', // Only auto-complete Active sessions, not new Booked bookings
    });

    for (const booking of pastBookings) {
      // Use sessionStartTime + duration instead of booking time
      if (booking.sessionStartTime && booking.duration) {
        const sessionStart = new Date(booking.sessionStartTime);
        const sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
        
        console.log(`🔍 Checking booking ${booking._id}:`);
        console.log(`   Session Start: ${sessionStart.toLocaleString()}`);
        console.log(`   Duration: ${booking.duration} hours`);
        console.log(`   Session End: ${sessionEnd.toLocaleString()}`);
        console.log(`   Current Time: ${now.toLocaleString()}`);
        console.log(`   Expired: ${sessionEnd <= now}`);

        if (sessionEnd <= now) {
          console.log(`✅ Auto-completing expired booking ${booking._id}`);
          booking.status = 'Completed';
          await booking.save();
        }
      } else {
        console.log(`⚠️ Booking ${booking._id} missing session timing data - skipping auto-complete`);
      }
    }

    // --- UPDATED LOGIC: Fetch bookings and populate customer details ---
    const allBookingsForCafe = await Booking.find({ cafe: cafeId })
      // This tells the database to find the user linked to the 'customer' ID
      // and include their 'name' in the response.
      .populate('customer', 'name')
      .sort({ bookingDate: 1, startTime: 1, createdAt: 1 }); // Sort by date, then time, then creation

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

      let priceToAdd = 0;

      if (booking.systemsBooked && booking.systemsBooked.length > 0) {
        // Group booking - calculate price for all systems
        for (const systemBooking of booking.systemsBooked) {
          const room = cafe.rooms.find(r => r.name === systemBooking.roomType);
          if (room) {
            const system = room.systems.find(s => s.type === systemBooking.systemType);
            if (system) {
              const systemPrice = systemBooking.numberOfSystems * system.pricePerHour * hoursToAdd;
              priceToAdd += systemPrice;
            }
          }
        }
      } else {
        // Single booking - use legacy fields
        const room = cafe.rooms.find(r => r.name === booking.roomType);
        if (room) {
          const system = room.systems.find(s => s.type === booking.systemType);
          if (system) {
            priceToAdd = (booking.numberOfSystems || 1) * system.pricePerHour * hoursToAdd;
          }
        }
      }

      if (priceToAdd === 0) {
        res.status(400);
        throw new Error('Unable to calculate extension price - system information not found');
      }

      booking.duration += parseFloat(hoursToAdd);
      booking.totalPrice += priceToAdd;
      booking.extendedTime = (booking.extendedTime || 0) + parseFloat(hoursToAdd);
      
      // Set extension payment fields for customer to pay
      booking.extensionPaymentAmount = priceToAdd;
      booking.extensionPaymentStatus = 'pending';

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
    
    // Set session start time to current time when session actually starts
    const sessionStartTime = new Date();
    booking.sessionStartTime = sessionStartTime;
    
    // Calculate session end time based on actual session start time + duration
    const calculatedEndTime = new Date(sessionStartTime.getTime() + (booking.duration * 60 * 60 * 1000));
    booking.sessionEndTime = calculatedEndTime;
    booking.calculatedEndTime = calculatedEndTime;
    
    console.log(`🎯 Session started for booking ${booking._id}:`);
    console.log(`   Session Start: ${sessionStartTime.toLocaleString()}`);
    console.log(`   Duration: ${booking.duration} hours`);
    console.log(`   Calculated End: ${calculatedEndTime.toLocaleString()}`);
    console.log(`   Expected End Time: ${calculatedEndTime.toLocaleTimeString()}`);

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

    // Track which systems were updated for the response
    const updatedSystems = [];

    // Free up assigned systems
    if (booking.assignedSystems && booking.assignedSystems.length > 0) {
      for (const assignedSystem of booking.assignedSystems) {
        const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
        if (room) {
          const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
          if (system) {
            system.status = 'Available';
            system.activeBooking = null;
            system.endTime = null; // Clear end time
            
            // Add to updated systems list for response
            updatedSystems.push({
              systemId: system.systemId,
              roomType: assignedSystem.roomType,
              status: system.status,
              endTime: null
            });
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
      data: { 
        booking, 
        cafe,
        updatedSystems // Return the updated systems for immediate frontend update
      }
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
    
    // Get all active bookings and filter by actual session duration
    const activeBookings = await Booking.find({
      status: 'Active'
    });
    
    // Filter bookings that have actually expired based on calculatedEndTime
    const expiredBookings = activeBookings.filter(booking => {
      if (!booking.sessionStartTime || !booking.duration) {
        console.log(`⚠️ Booking ${booking._id} missing timing data - sessionStartTime: ${booking.sessionStartTime}, duration: ${booking.duration}`);
        return false; // Skip bookings without proper timing data
      }
      
      // Use calculatedEndTime if available, otherwise calculate it
      let sessionEnd;
      if (booking.calculatedEndTime) {
        sessionEnd = new Date(booking.calculatedEndTime);
      } else {
        // Fallback: calculate from sessionStartTime + duration
        const sessionStart = new Date(booking.sessionStartTime);
        sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
      }
      
      // Check if the session has actually ended
      const hasExpired = sessionEnd <= now;
      
      if (hasExpired) {
        const timeDiff = now.getTime() - sessionEnd.getTime();
        const minutesOverdue = Math.ceil(timeDiff / (1000 * 60));
        console.log(`⏰ Session ${booking._id} has expired: Started ${new Date(booking.sessionStartTime).toLocaleTimeString()}, Duration ${booking.duration}h, Ended ${sessionEnd.toLocaleTimeString()}, Current ${now.toLocaleTimeString()}, Overdue by ${minutesOverdue} minutes`);
      } else {
        const timeDiff = sessionEnd.getTime() - now.getTime();
        const minutesRemaining = Math.ceil(timeDiff / (1000 * 60));
        console.log(`✅ Session ${booking._id} still active: Started ${new Date(booking.sessionStartTime).toLocaleTimeString()}, Duration ${booking.duration}h, Ends ${sessionEnd.toLocaleTimeString()}, Current ${now.toLocaleTimeString()}, ${minutesRemaining} minutes remaining`);
      }
      
      return hasExpired;
    });

    if (expiredBookings.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No expired sessions found',
        data: { completedBookings: [] }
      });
    }

    const completedBookings = [];
    let systemUpdatesCount = 0;

    for (const booking of expiredBookings) {
      // Log the timing details for debugging
      const sessionStart = new Date(booking.sessionStartTime);
      const calculatedEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
      console.log(`📅 Manual sync - Session ${booking._id}: Started at ${sessionStart.toLocaleTimeString()}, Duration: ${booking.duration}h, Should end at: ${calculatedEnd.toLocaleTimeString()}, Current time: ${now.toLocaleTimeString()}`);
      
      try {
        const cafe = await Cafe.findById(booking.cafe);
        if (cafe) {
          let cafeUpdated = false;
          
          // Free up assigned systems
          if (booking.assignedSystems && booking.assignedSystems.length > 0) {
            for (const assignedSystem of booking.assignedSystems) {
              const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
              if (room) {
                const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
                if (system && system.status === 'Active') {
                  system.status = 'Available';
                  system.activeBooking = null;
                  cafeUpdated = true;
                  systemUpdatesCount++;
                }
              }
            }
          }
          
          // Also check if any system has this booking as activeBooking (fallback)
          cafe.rooms.forEach(room => {
            room.systems.forEach(system => {
              if (system.activeBooking && system.activeBooking.toString() === booking._id.toString() && system.status === 'Active') {
                system.status = 'Available';
                system.activeBooking = null;
                cafeUpdated = true;
                systemUpdatesCount++;
              }
            });
          });

          // Save cafe changes if any systems were updated
          if (cafeUpdated) {
            await cafe.save();
          }

          // Double-check that the session has actually expired before marking as completed
          const sessionStart = new Date(booking.sessionStartTime);
          const sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
          
          if (sessionEnd <= now) {
            // Update booking status
            booking.status = 'Completed';
            await booking.save();
            completedBookings.push(booking._id);
            console.log(`✅ Manual sync - Session ${booking._id} completed successfully`);
          } else {
            console.log(`⚠️ Manual sync - Session ${booking._id} not yet expired - skipping completion`);
          }
        }
      } catch (error) {
        console.error(`Error processing expired session ${booking._id}:`, error.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `${completedBookings.length} sessions auto-completed, ${systemUpdatesCount} systems freed`,
      data: { 
        completedBookings,
        systemUpdatesCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update system maintenance status
 * @route   PATCH /api/bookings/system-maintenance
 * @access  Private/Owner
 */
const updateSystemMaintenanceStatus = async (req, res) => {
  try {
    const { cafeId, roomName, systemId, status } = req.body;

    if (!['Available', 'Under Maintenance'].includes(status)) {
      res.status(400);
      throw new Error('Status must be Available or Under Maintenance');
    }

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      res.status(404);
      throw new Error('Cafe not found');
    }

    if (cafe.owner.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('User not authorized to manage this cafe');
    }

    const room = cafe.rooms.find(r => r.name === roomName);
    if (!room) {
      res.status(404);
      throw new Error('Room not found');
    }

    const system = room.systems.find(s => s.systemId === systemId);
    if (!system) {
      res.status(404);
      throw new Error('System not found');
    }

    if (system.status === 'Active') {
      res.status(400);
      throw new Error('Cannot change maintenance status while system is active');
    }

    system.status = status;
    await cafe.save();

    res.status(200).json({
      success: true,
      message: `System ${systemId} status updated to ${status}`,
      data: cafe
    });
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

/**
 * @desc    Verify OTP for booking (without starting session)
 * @route   POST /api/bookings/verify-otp-only
 * @access  Private/Owner
 */
const verifyOTP = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;

    if (!bookingId || !otp) {
      res.status(400);
      throw new Error('Booking ID and OTP are required');
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      res.status(400);
      throw new Error('OTP must be exactly 6 digits');
    }

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
      throw new Error('Only booked sessions can be verified');
    }

    // Check if booking has OTP (mobile booking)
    if (!booking.otp) {
      res.status(400);
      throw new Error('This booking does not require OTP verification (walk-in booking)');
    }

    // Verify OTP
    if (booking.otp !== otp) {
      res.status(400);
      throw new Error('Invalid OTP. Please check the OTP provided by the customer.');
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: { booking }
    });
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    Verify OTP for booking and start session
 * @route   POST /api/bookings/verify-otp
 * @access  Private/Owner
 */
const verifyOTPAndStartSession = async (req, res) => {
  try {
    const { bookingId, otp, systemAssignments } = req.body;

    if (!bookingId || !otp) {
      res.status(400);
      throw new Error('Booking ID and OTP are required');
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      res.status(400);
      throw new Error('OTP must be exactly 6 digits');
    }

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

    // Check if booking has OTP (mobile booking)
    if (!booking.otp) {
      res.status(400);
      throw new Error('This booking does not require OTP verification (walk-in booking)');
    }

    // Verify OTP
    if (booking.otp !== otp) {
      res.status(400);
      throw new Error('Invalid OTP. Please check the OTP provided by the customer.');
    }

    // OTP is valid, proceed with system assignment
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
    
    // Set session start time to current time when session actually starts
    const sessionStartTime = new Date();
    booking.sessionStartTime = sessionStartTime;
    
    // Calculate session end time based on actual session start time + duration
    const calculatedEndTime = new Date(sessionStartTime.getTime() + (booking.duration * 60 * 60 * 1000));
    booking.sessionEndTime = calculatedEndTime;
    booking.calculatedEndTime = calculatedEndTime;
    
    console.log(`🎯 OTP-verified session started for booking ${booking._id}:`);
    console.log(`   Customer: ${booking.customer?.name || 'Mobile Customer'}`);
    console.log(`   OTP: ${otp} (verified)`);
    console.log(`   Session Start: ${sessionStartTime.toLocaleString()}`);
    console.log(`   Duration: ${booking.duration} hours`);
    console.log(`   Calculated End: ${calculatedEndTime.toLocaleString()}`);

    await cafe.save();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified and session started successfully',
      data: { booking, cafe }
    });
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    Cancel a booking and process refund
 * @route   POST /api/bookings/:id/cancel
 * @access  Private/Customer or Owner
 */
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404);
      throw new Error('Booking not found');
    }

    // Check authorization - either customer or owner can cancel
    const isCustomer = booking.customer && booking.customer.toString() === req.user._id.toString();
    const isOwner = booking.owner && booking.owner.toString() === req.user._id.toString();
    
    if (!isCustomer && !isOwner) {
      res.status(401);
      throw new Error('Not authorized to cancel this booking');
    }

    // Check if booking can be cancelled
    if (booking.status !== 'Booked') {
      res.status(400);
      throw new Error('Only booked sessions can be cancelled');
    }

    // Check cancel conditions based on date and time
    const today = new Date();
    const bookingDate = new Date(booking.bookingDate);
    const bookingDateOnly = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let canCancel = false;

    // If booking is for today, check if within 15 minutes of booking time
    if (bookingDateOnly.getTime() === todayOnly.getTime()) {
      const [timeStr, period] = booking.startTime.split(' ');
      const [hours, minutes] = timeStr.split(':').map(Number);
      let bookingHour = hours;
      if (period === 'PM' && hours !== 12) {
        bookingHour += 12;
      } else if (period === 'AM' && hours === 12) {
        bookingHour = 0;
      }
      
      const bookingTime = new Date(booking.bookingDate);
      bookingTime.setHours(bookingHour, minutes || 0, 0, 0);
      const timeDiff = today.getTime() - bookingTime.getTime();
      const minutesDiff = timeDiff / (1000 * 60);
      
      canCancel = minutesDiff <= 15;
    } else {
      // If booking is for future dates, allow cancellation until that day starts
      canCancel = bookingDateOnly.getTime() > todayOnly.getTime();
    }

    if (!canCancel) {
      res.status(400);
      throw new Error('Booking cannot be cancelled at this time. Cancellation is only allowed within 15 minutes of booking time for today\'s bookings, or anytime before the booking date for future bookings.');
    }

    // Update booking status
    booking.status = 'Cancelled';
    await booking.save();

    // Process refund based on payment method - only for mobile bookings, not walk-ins
    let refundInfo = null;

    // Only process refunds for mobile bookings (not walk-ins)
    if (booking.customer && booking.isPaid && booking.paymentMethod) {
      // Get cafe name for refund description
      const cafe = await Cafe.findById(booking.cafe);
      const cafeName = cafe ? cafe.name : 'Unknown Cafe';
      
      if (booking.paymentMethod === 'wallet') {
        // Refund to wallet
        const wallet = await Wallet.findOne({ customer: booking.customer });
        if (wallet) {
          wallet.balance += booking.totalPrice;
          
          // Add refund transaction with cafe name
          wallet.transactions.push({
            type: 'credit',
            amount: booking.totalPrice,
            method: 'refund',
            description: `Refund for cancelled booking - ${cafeName}`,
            bookingId: booking._id
          });
          
          await wallet.save();
          
          // Update user's wallet balance
          const user = await User.findById(booking.customer);
          if (user) {
            user.walletBalance = wallet.balance;
            await user.save();
          }
          
          
          refundInfo = {
            method: 'wallet',
            amount: booking.totalPrice,
            status: 'completed',
            message: `₹${booking.totalPrice} has been refunded to your wallet`
          };
        }
      } else if (booking.paymentMethod === 'payu') {
        // For PayU, create a pending refund record (simulation for development)
        const refundPayment = new Payment({
          customer: booking.customer,
          booking: booking._id,
          amount: booking.totalPrice,
          paymentMethod: booking.paymentMethod,
          paymentGateway: 'payu',
          paymentStatus: 'refunded',
          isExtension: false,
          gatewayResponse: {
            refundStatus: 'pending',
            refundId: `REF_${Date.now()}`,
            message: 'Refund initiated (PayU Test Mode)'
          }
        });
        
        await refundPayment.save();
        
        refundInfo = {
          method: 'payu',
          amount: booking.totalPrice,
          status: 'pending',
          message: `₹${booking.totalPrice} refund has been initiated. It will be processed within 3-5 business days.`
        };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking,
        refund: refundInfo
      }
    });

  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


module.exports = {
  createBooking,
  createWalkInBooking,
  checkAvailability,
  getMyBookings,
  getOwnerBookings,
  updateBookingStatus,
  extendBooking,
  getSlotAvailability,
  assignSystemsAndStartSession,
  endSession,
  getAvailableSystemsForAssignment,
  autoCompleteExpiredSessions,
  updateSystemMaintenanceStatus,
  verifyOTP,
  verifyOTPAndStartSession,
  cancelBooking,
};
