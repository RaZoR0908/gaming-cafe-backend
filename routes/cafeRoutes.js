const express = require('express');
const router = express.Router();
// 1. Update the import to include the new getCafesNearMe function
const {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  getCafesNearMe,
} = require('../controllers/cafeController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// Routes for the base URL ('/api/cafes')
router
  .route('/')
  .post(protect, isOwner, createCafe)
  .get(getCafes);

// ADD THIS NEW ROUTE for finding nearby cafes.
// This must come BEFORE the /:id route to work correctly.
router.route('/near-me').get(getCafesNearMe);

// Routes for a specific cafe ID ('/api/cafes/:id')
router
  .route('/:id')
  .get(getCafeById)
  .put(protect, isOwner, updateCafe)
  .delete(protect, isOwner, deleteCafe);

module.exports = router;
