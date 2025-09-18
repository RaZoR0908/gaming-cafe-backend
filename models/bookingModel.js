const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    // The customer who made the booking.
    // This is no longer required, to allow for walk-ins.
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // The name of the walk-in customer, if applicable.
    walkInCustomerName: {
      type: String,
    },
    
    // Phone number for both regular and walk-in customers
    phoneNumber: {
      type: String,
      required: true,
    },
    
    // The cafe that was booked.
    cafe: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Cafe',
    },
    // The owner of the cafe, for easier lookups.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    
    // NEW: Support for multiple room/system combinations
    systemsBooked: [{
      roomType: {
        type: String,
        required: true,
      },
      systemType: {
        type: String,
        required: true,
      },
      numberOfSystems: {
        type: Number,
        required: true,
        default: 1,
      },
      pricePerHour: {
        type: Number,
        required: true,
      }
    }],
    
    // DEPRECATED: Keep for backward compatibility, but use systemsBooked for new bookings
    roomType: {
      type: String,
    },
    systemType: {
      type: String,
    },
    numberOfSystems: {
      type: Number,
      default: 1,
    },
    
    // The date of the booking.
    bookingDate: {
      type: Date,
      required: true,
    },
    // The start time of the slot (e.g., '4:00 PM').
    startTime: {
      type: String,
      required: true,
    },
    // The duration of the booking in hours (must be in 0.5 hour intervals).
    duration: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) {
          return v % 0.5 === 0; // Must be in 30-minute intervals
        },
        message: 'Duration must be in 30-minute intervals'
      }
    },
    // The total price for the booking.
    totalPrice: {
      type: Number,
      required: true,
    },
    // The status of the booking: Booked → Active → Completed
    status: {
      type: String,
      required: true,
      enum: ['Pending Payment', 'Booked', 'Confirmed', 'Active', 'Completed', 'Cancelled'],
      default: 'Pending Payment',
    },
    // NEW: Track assigned systems for active sessions
    assignedSystems: [{
      systemId: {
        type: String,
        required: true,
      },
      roomType: {
        type: String,
        required: true,
      }
    }],
    // NEW: Track when session actually started (for timer calculations)
    sessionStartTime: {
      type: Date,
    },
    // NEW: Track when session ends (for auto-completion)
    sessionEndTime: {
      type: Date,
    },
    // NEW: Calculated end time based on sessionStartTime + duration
    calculatedEndTime: {
      type: Date,
    },
    // NEW: Track if booking is permanently cancelled (after 10 minutes)
    permanentlyCancelled: {
      type: Boolean,
      default: false,
    },
    // NEW: OTP for mobile booking verification (only for mobile bookings, not walk-ins)
    otp: {
      type: String,
      length: 6,
      validate: {
        validator: function(v) {
          // OTP is optional (only for mobile bookings)
          return !v || /^\d{6}$/.test(v);
        },
        message: 'OTP must be exactly 6 digits'
      }
    },
    // NEW: Friend count for group bookings (mobile app)
    friendCount: {
      type: Number,
      default: 1,
      min: 1
    },
    // NEW: Extended time in hours (when session is extended by cafe owner)
    extendedTime: {
      type: Number,
      default: 0,
      min: 0
    },
    // NEW: Payment related fields
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentMethod: {
      type: String,
      enum: ['wallet', 'card', 'upi', 'netbanking', 'cash'],
      default: null
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    // NEW: Extension payment fields
    extensionPaymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: null
    },
    extensionPaymentAmount: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
