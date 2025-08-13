const express = require('express');
const router = express.Router();
// Update the import to include the new registerOwner function
const {
  registerUser,
  loginUser,
  registerOwner,
} = require('../controllers/userController');

// This route is for customers to register
router.post('/register', registerUser);

// ADD THIS NEW ROUTE for cafe owners to register
router.post('/register-owner', registerOwner);

// This route is for any user to log in
router.post('/login', loginUser);

module.exports = router;


