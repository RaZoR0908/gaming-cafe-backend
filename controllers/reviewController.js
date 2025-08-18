const Review = require('../models/reviewModel');
const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel'); // We need the Cafe model for the new function

/**
 * @desc    Create a new review
 * @route   POST /api/reviews/:cafeId
 * @access  Private/Customer
 */
const createReview = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const { rating, comment } = req.body;

    // Security Check: Only allow a customer to review a cafe they have a completed booking for.
    const hasCompletedBooking = await Booking.findOne({
      cafe: cafeId,
      customer: req.user._id,
      status: 'Completed',
    });

    if (!hasCompletedBooking) {
      res.status(403); // Forbidden
      throw new Error('You can only review cafes you have visited.');
    }

    const review = new Review({
      cafe: cafeId,
      customer: req.user._id,
      customerName: req.user.name,
      rating,
      comment,
    });

    const createdReview = await review.save();
    res.status(201).json(createdReview);
  } catch (error) {
    res.status(res.statusCode || 400).json({ message: error.message });
  }
};

/**
 * @desc    Get all reviews for a cafe
 * @route   GET /api/reviews/:cafeId
 * @access  Public
 */
const getReviewsForCafe = async (req, res) => {
  try {
    const reviews = await Review.find({ cafe: req.params.cafeId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Get all reviews for the logged-in owner's cafe
 * @route   GET /api/reviews/my-cafe
 * @access  Private/Owner
 */
const getReviewsForOwner = async (req, res) => {
  try {
    // 1. Find the cafe that belongs to the logged-in owner.
    const cafe = await Cafe.findOne({ owner: req.user._id });

    if (!cafe) {
      // If the owner hasn't created a cafe yet, return an empty list.
      return res.json([]);
    }

    // 2. Find all reviews that match the owner's cafe ID.
    const reviews = await Review.find({ cafe: cafe._id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};


module.exports = {
  createReview,
  getReviewsForCafe,
  getReviewsForOwner, // Add the new function to the exports
};
