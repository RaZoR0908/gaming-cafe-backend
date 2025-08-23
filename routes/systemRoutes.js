const express = require('express');
const router = express.Router();
const {
    startSession,
    endSession,
    updateSystemMaintenanceStatus,
    extendSystemSession,
    getSystemAvailability
} = require('../controllers/systemController');
const { protect, isOwner } = require('../middleware/authMiddleware');

// @desc    Get real-time system availability for a cafe
// @route   GET /api/systems/availability/:cafeId
router.get('/availability/:cafeId', protect, isOwner, getSystemAvailability);

// @desc    Assign systems to a booking and start the session
// @route   POST /api/systems/start-session
router.post('/start-session', protect, isOwner, startSession);

// @desc    End an active session and free up systems
// @route   POST /api/systems/end-session
router.post('/end-session', protect, isOwner, endSession);

// @desc    Extend a specific system session within a booking
// @route   PATCH /api/systems/extend
router.patch('/extend', protect, isOwner, extendSystemSession);

// @desc    Update a single system's status for maintenance
// @route   PATCH /api/systems/:systemId/maintenance
router.patch('/:systemId/maintenance', protect, isOwner, updateSystemMaintenanceStatus);


module.exports = router;
