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
    const cafes = await Cafe.find({ isActive: true });
    res.json(cafes);
  } catch (error) {
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
    res.json(cafe); // Will return the cafe object or null if not found
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
