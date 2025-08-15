const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new cafe
 * @route   POST /api/cafes
 * @access  Private/Owner
 */
const createCafe = async (req, res) => {
  try {
    // This is the original, flexible version of the function.
    // It takes all details, including rooms, from the request body.
    const { name, address, photos, rooms, openingTime, closingTime, location } = req.body;
    
    const cafe = new Cafe({
      owner: req.user._id,
      name,
      address,
      photos,
      rooms,
      openingTime,
      closingTime,
      location,
    });

    const createdCafe = await cafe.save();
    res.status(201).json(createdCafe);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ... (The rest of your controller functions are unchanged)
const getCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find({ isActive: true });
    res.json(cafes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const getCafeById = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) { res.json(cafe); } else { res.status(404).json({ message: 'Cafe not found' }); }
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const updateCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401); throw new Error('User not authorized to update this cafe');
      }
      cafe.name = req.body.name || cafe.name;
      cafe.address = req.body.address || cafe.address;
      cafe.photos = req.body.photos || cafe.photos;
      cafe.rooms = req.body.rooms || cafe.rooms;
      cafe.location = req.body.location || cafe.location;
      cafe.openingTime = req.body.openingTime || cafe.openingTime;
      cafe.closingTime = req.body.closingTime || cafe.closingTime;
      cafe.isActive = req.body.isActive !== undefined ? req.body.isActive : cafe.isActive;
      const updatedCafe = await cafe.save();
      res.json(updatedCafe);
    } else {
      res.status(404); throw new Error('Cafe not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

const deleteCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (cafe) {
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401); throw new Error('User not authorized to delete this cafe');
      }
      await cafe.deleteOne();
      res.json({ message: 'Cafe removed' });
    } else {
      res.status(404); throw new Error('Cafe not found');
    }
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

const getCafesNearMe = async (req, res) => {
  try {
    const { lng, lat, distance } = req.query;
    if (!lng || !lat || !distance) {
      res.status(400); throw new Error('Please provide longitude, latitude, and distance in km');
    }
    const cafes = await Cafe.find({
      location: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(distance) * 1000,
        },
      },
      isActive: true,
    });
    res.json({ count: cafes.length, data: cafes });
  } catch (error) {
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};

const getMyCafe = async (req, res) => {
  try {
    const cafe = await Cafe.findOne({ owner: req.user._id });
    if (cafe) {
      res.json(cafe);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  getCafesNearMe,
  getMyCafe,
};
