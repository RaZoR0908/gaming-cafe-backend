const express = require('express');
const router = express.Router();
// Update the import to include the new loginUser function
const { registerUser, loginUser } = require('../controllers/userController');

// This route handles new user registration
router.post('/register', registerUser);

// Add this new route to handle user login
router.post('/login', loginUser);

module.exports = router;

