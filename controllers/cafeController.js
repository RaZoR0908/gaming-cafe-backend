const Cafe = require('../models/cafeModel');

/**
 * @desc    Create a new cafe
 * @route   POST /api/cafes
 * @access  Private/Owner
 */
const createCafe = async (req, res) => {
  try {
    const { name, address, photos, rooms, openingTime, closingTime } = req.body;

    const cafe = new Cafe({
      owner: req.user._id,
      name,
      address,
      photos,
      rooms,
      openingTime,
      closingTime,
    });

    const createdCafe = await cafe.save();
    res.status(201).json(createdCafe);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Fetch all cafes
 * @route   GET /api/cafes
 * @access  Public
 */
const getCafes = async (req, res) => {
  try {
    // 1. Find all cafes in the database.
    // We only want to show cafes that the owner has marked as 'active'.
    const cafes = await Cafe.find({ isActive: true });

    // 2. Send the list of cafes back as a JSON response.
    res.json(cafes);
  } catch (error) {
    // If there's an error, send an error response.
    res.status(500).json({ message: 'Server Error' });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Fetch a single cafe by its ID
 * @route   GET /api/cafes/:id
 * @access  Public
 */
const getCafeById = async (req, res) => {
  try {
    // 1. Find the cafe in the database using the ID from the URL parameters.
    const cafe = await Cafe.findById(req.params.id);

    // 2. If a cafe with that ID is found...
    if (cafe) {
      // ...send it back as a JSON response.
      res.json(cafe);
    } else {
      // 3. If no cafe is found, send a 404 Not Found error.
      res.status(404).json({ message: 'Cafe not found' });
    }
  } catch (error) {
    // If the provided ID is not a valid MongoDB ID format, this will trigger.
    res.status(500).json({ message: 'Server Error' });
  }
};

// ADD THIS NEW FUNCTION
/**
 * @desc    Update a cafe
 * @route   PUT /api/cafes/:id
 * @access  Private/Owner
 */
const updateCafe = async (req, res) => {
  try {
    // 1. Find the cafe to be updated by its ID.
    const cafe = await Cafe.findById(req.params.id);

    // 2. If the cafe exists...
    if (cafe) {
      // 3. IMPORTANT SECURITY CHECK: Make sure the logged-in user is the owner of this cafe.
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401); // Unauthorized
        throw new Error('User not authorized to update this cafe');
      }

      // 4. Update the cafe fields with the new data from the request body.
      // If a field isn't provided in the request, it will keep its old value.
      cafe.name = req.body.name || cafe.name;
      cafe.address = req.body.address || cafe.address;
      cafe.photos = req.body.photos || cafe.photos;
      cafe.rooms = req.body.rooms || cafe.rooms;
      cafe.openingTime = req.body.openingTime || cafe.openingTime;
      cafe.closingTime = req.body.closingTime || cafe.closingTime;
      cafe.isActive = req.body.isActive !== undefined ? req.body.isActive : cafe.isActive;

      // 5. Save the updated cafe to the database.
      const updatedCafe = await cafe.save();

      // 6. Send the updated cafe back as the response.
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
    // 1. Find the cafe to be deleted by its ID.
    const cafe = await Cafe.findById(req.params.id);

    // 2. If the cafe exists...
    if (cafe) {
      // 3. IMPORTANT SECURITY CHECK: Make sure the logged-in user is the owner of this cafe.
      if (cafe.owner.toString() !== req.user._id.toString()) {
        res.status(401); // Unauthorized
        throw new Error('User not authorized to delete this cafe');
      }

      // 4. Delete the cafe from the database.
      await cafe.deleteOne();

      // 5. Send back a success message.
      res.json({ message: 'Cafe removed' });
    } else {
      res.status(404);
      throw new Error('Cafe not found');
    }
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
};
