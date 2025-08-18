const express = require('express');
const router = express.Router();
const {
  createReview,
  getReviewsForCafe,
  getReviewsForOwner,
} = require('../controllers/reviewController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// --- PUBLIC ROUTE ---
// Get all reviews for a specific cafe (for customers)
router.route('/:cafeId').get(getReviewsForCafe);

// --- PROTECTED CUSTOMER ROUTE ---
// Create a new review for a specific cafe
router.route('/:cafeId').post(protect, createReview);

// --- PROTECTED OWNER ROUTE ---
// Get all reviews for the logged-in owner's cafe
router.route('/my-cafe/all').get(protect, isOwner, getReviewsForOwner);


module.exports = router;
