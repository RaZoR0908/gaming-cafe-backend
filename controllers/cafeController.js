const Cafe = require('../models/cafeModel');
const User = require('../models/userModel'); // Assuming you have a User model

/**
 * @desc    Create a new cafe
 * @route   POST /api/cafes
 * @access  Private/Owner
 */
const createCafe = async (req, res) => {
  try {
    // The frontend will send a complete, structured request body
    // including the nested rooms and systems array.
    const cafeData = { ...req.body, owner: req.user.id };

    const cafe = new Cafe(cafeData);
    const createdCafe = await cafe.save();

    // Optional but good practice: update the user document to indicate they own a cafe.
    // This can be useful for UI logic on the frontend.
    await User.findByIdAndUpdate(req.user.id, { hasCafe: true });

    res.status(201).json({
      success: true,
      data: createdCafe,
      message: 'Cafe created successfully!',
    });
  } catch (error) {
    console.error('Error creating cafe:', error);
    res.status(400).json({ success: false, message: 'Failed to create cafe.', error: error.message });
  }
};

/**
 * @desc    Update an existing cafe
 * @route   PUT /api/cafes/:id
 * @access  Private/Owner
 */
const updateCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);

    if (!cafe) {
      return res.status(404).json({ success: false, message: 'Cafe not found' });
    }

    // Ensure the user trying to update the cafe is the actual owner
    if (cafe.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'User not authorized to update this cafe' });
    }

    // Use findByIdAndUpdate for a clean and efficient update.
    // It takes the new data from req.body and applies it to the found document.
    const updatedCafe = await Cafe.findByIdAndUpdate(req.params.id, req.body, {
      new: true, // This option returns the document after the update has been applied.
      runValidators: true, // This ensures that any updates still adhere to the schema rules.
    });

    res.status(200).json({
      success: true,
      data: updatedCafe,
      message: 'Cafe updated successfully!',
    });
  } catch (error) {
    console.error('Error updating cafe:', error);
    res.status(400).json({ success: false, message: 'Failed to update cafe.', error: error.message });
  }
};


// --- UNCHANGED FUNCTIONS ---
// The following functions do not need to be changed as they are primarily for reading data.

const getCafes = async (req, res) => {
  try {
    // For mobile app, show all cafes (not just active ones)
    // This ensures mobile users can see all available cafes
    const cafes = await Cafe.find({});
    console.log(`📡 GET /api/cafes - Found ${cafes.length} cafes in database`);
    
    if (cafes.length > 0) {
      cafes.forEach((cafe, index) => {
        console.log(`   ${index + 1}. ${cafe.name} - Active: ${cafe.isActive}`);
      });
    }
    
    res.json(cafes);
  } catch (error) {
    console.error('❌ Error in getCafes:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getCafeById = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      res.json(cafe);
    } else {
      res.status(404).json({ message: 'Cafe not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const deleteCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      if (cafe.owner.toString() !== req.user.id.toString()) {
        return res.status(401).json({ message: 'User not authorized' });
      }
      await cafe.deleteOne();
      res.json({ message: 'Cafe removed' });
    } else {
      res.status(404).json({ message: 'Cafe not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle cafe open/close status
const toggleCafeStatus = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (!cafe) {
      return res.status(404).json({ message: 'Cafe not found' });
    }
    
    if (cafe.owner.toString() !== req.user.id.toString()) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    cafe.isOpen = !cafe.isOpen;
    const updatedCafe = await cafe.save();
    
    res.json({
      message: `Cafe ${cafe.isOpen ? 'opened' : 'closed'} successfully`,
      cafe: updatedCafe
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCafesNearMe = async (req, res) => {
  try {
    const { lng, lat, distance } = req.query;
    if (!lng || !lat || !distance) {
      return res.status(400).json({ message: 'Please provide longitude, latitude, and distance' });
    }
    const cafes = await Cafe.find({
      location: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(distance) * 1000, // convert km to meters
        },
      },
      isActive: true,
    });
    res.json({ count: cafes.length, data: cafes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findOne({ owner: req.user.id });
    
    if (cafe) {
      // Add safeguard: Auto-correct inconsistent system statuses
      await correctSystemStatuses(cafe);
    }
    
    res.json(cafe); // Will return the cafe object or null if not found
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// Helper function to correct system statuses
const correctSystemStatuses = async (cafe) => {
  const now = new Date();
  let cafeUpdated = false;
  const Booking = require('../models/bookingModel');
  
  // Check all systems for inconsistencies
  for (const room of cafe.rooms) {
    for (const system of room.systems) {
      if (system.status === 'Active' && system.activeBooking) {
        try {
          // Get the booking to check if it's actually expired
          const booking = await Booking.findById(system.activeBooking);
          
          if (!booking) {
            // Booking doesn't exist, free the system
            console.log(`🔧 Auto-correcting system ${system.systemId} - booking not found`);
            system.status = 'Available';
            system.activeBooking = null;
            system.sessionStartTime = null;
            system.sessionEndTime = null;
            system.sessionDuration = null;
            cafeUpdated = true;
            continue;
          }
          
          if (booking.status !== 'Active') {
            // Booking is not active, free the system
            console.log(`🔧 Auto-correcting system ${system.systemId} - booking status is ${booking.status}`);
            system.status = 'Available';
            system.activeBooking = null;
            system.sessionStartTime = null;
            system.sessionEndTime = null;
            system.sessionDuration = null;
            cafeUpdated = true;
            continue;
          }
          
          // Check if booking has expired based on calculatedEndTime
          let sessionEnd;
          if (booking.calculatedEndTime) {
            sessionEnd = new Date(booking.calculatedEndTime);
          } else if (booking.sessionStartTime && booking.duration) {
            const sessionStart = new Date(booking.sessionStartTime);
            sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
          } else {
            // No timing data, free the system
            console.log(`🔧 Auto-correcting system ${system.systemId} - booking missing timing data`);
            system.status = 'Available';
            system.activeBooking = null;
            system.sessionStartTime = null;
            system.sessionEndTime = null;
            system.sessionDuration = null;
            cafeUpdated = true;
            continue;
          }
          
          if (sessionEnd <= now) {
            // Session has expired, free the system and complete the booking
            console.log(`🔧 Auto-correcting system ${system.systemId} - session expired`);
            system.status = 'Available';
            system.activeBooking = null;
            system.sessionStartTime = null;
            system.sessionEndTime = null;
            system.sessionDuration = null;
            cafeUpdated = true;
            
            // Also complete the booking
            booking.status = 'Completed';
            await booking.save();
            console.log(`🔧 Auto-completed booking ${booking._id}`);
          }
        } catch (error) {
          console.error(`Error checking system ${system.systemId}:`, error.message);
        }
      }
    }
  }
  
  // Save corrections if any were made
  if (cafeUpdated) {
    await cafe.save();
    console.log(`🔧 Auto-corrected inconsistent system statuses in cafe ${cafe.name}`);
  }
  
  return cafeUpdated;
};

module.exports = {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  toggleCafeStatus,
  getCafesNearMe,
  getMyCafe,
};
