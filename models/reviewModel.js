const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // The cafe that is being reviewed.
    cafe: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Cafe',
    },
    // The customer who wrote the review.
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The customer's name, saved directly for easy display.
    customerName: {
      type: String,
      required: true,
    },
    // The star rating from 1 to 5.
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // The text comment (optional).
    comment: {
      type: String,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
