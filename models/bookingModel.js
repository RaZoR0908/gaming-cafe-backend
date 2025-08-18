const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    // The customer who made the booking.
    // This is no longer required, to allow for walk-ins.
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    // The specific room the customer booked (e.g., 'AC Section').
    roomType: {
      type: String,
      required: true,
    },
    // The specific type of system the customer booked (e.g., 'PC', 'PS5').
    systemType: {
      type: String,
      required: true,
    },
    // This will store how many systems the user booked (e.g., 3 PCs)
    numberOfSystems: {
      type: Number,
      required: true,
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
    // The duration of the booking in hours.
    duration: {
      type: Number,
      required: true,
    },
    // The total price for the booking.
    totalPrice: {
      type: Number,
      required: true,
    },
    // The status of the booking.
    status: {
      type: String,
      required: true,
      enum: ['Confirmed', 'Cancelled', 'Completed'],
      default: 'Confirmed',
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
