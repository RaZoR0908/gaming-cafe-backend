const express = require('express');
const router = express.Router();
const {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  getCafesNearMe,
  getMyCafe,
} = require('../controllers/cafeController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// --- Grouping routes for better organization ---

// Base route: /api/cafes
router
  .route('/')
  .get(getCafes) // Public
  .post(protect, isOwner, createCafe); // Protected

// --- IMPORTANT: Specific routes must come BEFORE generic routes ---

// Specific route: /api/cafes/my-cafe
router.route('/my-cafe').get(protect, isOwner, getMyCafe); // Protected

// Specific route: /api/cafes/near-me
router.route('/near-me').get(getCafesNearMe); // Public

// Generic route with a parameter: /api/cafes/:id
// This MUST come last.
router
  .route('/:id')
  .get(getCafeById) // Public
  .put(protect, isOwner, updateCafe) // Protected
  .delete(protect, isOwner, deleteCafe); // Protected

module.exports = router;
