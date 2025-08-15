const mongoose = require('mongoose');

// This is the blueprint for how a cafe's data will be stored.
const cafeSchema = mongoose.Schema(
  {
    // We need to know which user owns this cafe.
    // We create a reference to the 'User' model.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    // We will store an array of URLs for the cafe's photos.
    // The actual images will be stored on a service like Cloudinary.
    photos: [
      {
        type: String,
      },
    ],
    // We will store an array of rooms (e.g., AC, Non-AC).
    // Each room will contain its own list of gaming systems.
    rooms: [
      {
        roomType: {
          type: String, // e.g., 'AC Section', 'Non-AC Section'
          required: true,
        },
        systems: [
          {
            systemType: {
              type: String, // e.g., 'PC', 'PS5'
              required: true,
            },
            count: {
              type: Number, // e.g., 10 PCs in this room
              required: true,
            },
            specs: {
              type: String, // e.g., 'RTX 4080, 240Hz Monitor'
            },
            // ADD THIS NEW FIELD
            pricePerHour: {
              type: Number,
              required: true,
            },
          },
        ],
      },
    ],

    // ADD THIS NEW FIELD FOR LOCATION
    location: {
      type: {
        type: String, // Don't change this. It must be 'Point'.
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // Array of numbers for [longitude, latitude]
        required: true,
      },
    },

    // The cafe's standard opening and closing times.
    openingTime: {
      type: String, // e.g., '10:00 AM'
      required: true,
    },
    closingTime: {
      type: String, // e.g., '10:00 PM'
      required: true,
    },
    // The owner can toggle whether their cafe is visible to customers.
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// ADD THIS LINE TO CREATE THE SPECIAL GEOSPATIAL INDEX
// This makes location-based queries extremely fast.
cafeSchema.index({ location: '2dsphere' });


const Cafe = mongoose.model('Cafe', cafeSchema);

module.exports = Cafe;
