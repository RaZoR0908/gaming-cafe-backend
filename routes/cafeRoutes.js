const express = require('express');
const router = express.Router();
// 1. The import already includes deleteCafe, which is correct.
const {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
} = require('../controllers/cafeController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// Routes for the base URL ('/api/cafes')
router
  .route('/')
  .post(protect, isOwner, createCafe)
  .get(getCafes);

// Routes for a specific cafe ID ('/api/cafes/:id')
router
  .route('/:id')
  .get(getCafeById)
  .put(protect, isOwner, updateCafe)
  // 2. ADD THIS NEW ROUTE
  // DELETE /api/cafes/:id (Protected: Delete a cafe)
  .delete(protect, isOwner, deleteCafe);


module.exports = router;
