const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new cafe
 * @route   POST /api/cafes
 * @access  Private/Owner
 */
const createCafe = async (req, res) => {
  try {
    // Get all the cafe details from the request body, including the new 'location' field.
    const { name, address, photos, rooms, openingTime, closingTime, location } = req.body;

    // Create a new cafe object in memory.
    const cafe = new Cafe({
      owner: req.user._id,
      name,
      address,
      photos,
      rooms,
      openingTime,
      closingTime,
      location, // Add the new location field here
    });

    // Save the new cafe object to the database.
    const createdCafe = await cafe.save();

    // Send back a 201 (Created) status and the new cafe's data.
    res.status(201).json(createdCafe);
  } catch (error) {
    // If there's an error (e.g., missing required fields), send an error response.
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Fetch all cafes
 * @route   GET /api/cafes
 * @access  Public
 */
const getCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find({ isActive: true });
    res.json(cafes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Fetch a single cafe by its ID
 * @route   GET /api/cafes/:id
 * @access  Public
 */
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

/**
 * @desc    Update a cafe
 * @route   PUT /api/cafes/:id
 * @access  Private/Owner
 */
const updateCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('User not authorized to update this cafe');
      }
      cafe.name = req.body.name || cafe.name;
      cafe.address = req.body.address || cafe.address;
      cafe.photos = req.body.photos || cafe.photos;
      cafe.rooms = req.body.rooms || cafe.rooms;
      // Also update the location if it's provided
      cafe.location = req.body.location || cafe.location;
      cafe.openingTime = req.body.openingTime || cafe.openingTime;
      cafe.closingTime = req.body.closingTime || cafe.closingTime;
      cafe.isActive = req.body.isActive !== undefined ? req.body.isActive : cafe.isActive;
      const updatedCafe = await cafe.save();
      res.json(updatedCafe);
    } else {
      res.status(404);
      throw new Error('Cafe not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a cafe
 * @route   DELETE /api/cafes/:id
 * @access  Private/Owner
 */
const deleteCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('User not authorized to delete this cafe');
      }
      await cafe.deleteOne();
      res.json({ message: 'Cafe removed' });
    } else {
      res.status(404);
      throw new Error('Cafe not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Get cafes within a certain radius
 * @route   GET /api/cafes/near-me?lng=...&lat=...&distance=...
 * @access  Public
 */
const getCafesNearMe = async (req, res) => {
  try {
    // 1. Get longitude, latitude, and distance from the URL query parameters.
    const { lng, lat, distance } = req.query;

    // 2. Check that all required parameters were provided.
    if (!lng || !lat || !distance) {
      res.status(400);
      throw new Error('Please provide longitude, latitude, and distance in km');
    }

    // 3. Use MongoDB's special geospatial query to find cafes.
    const cafes = await Cafe.find({
      location: {
        // $nearSphere finds documents within a certain distance on a sphere (the Earth).
        $nearSphere: {
          // $geometry specifies the user's location as a GeoJSON Point.
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)], // [longitude, latitude]
          },
          // $maxDistance specifies the search radius in meters.
          $maxDistance: parseInt(distance) * 1000, // We convert the distance from km to meters.
        },
      },
      isActive: true, // Only find active cafes.
    });

    // 4. Send the results back.
    res.json({
      count: cafes.length,
      data: cafes,
    });
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


// UPDATE THE EXPORTS AT THE BOTTOM
module.exports = {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  getCafesNearMe, // Add the new function here
};
