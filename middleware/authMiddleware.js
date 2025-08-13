const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

// This middleware function will protect our routes.
const protect = async (req, res, next) => {
  let token;

  // 1. Check if the request has a token in the headers.
  // Tokens are usually sent in the 'Authorization' header like this: "Bearer <token>"
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 2. Get the token from the header (by removing "Bearer " from the start)
      token = req.headers.authorization.split(' ')[1];

      // 3. Verify the token using our secret key.
      // This will decode the token and give us the user's ID we stored in it.
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4. Find the user in the database by their ID.
      // We attach this user object to the request (`req.user`).
      // We exclude the password field for security.
      req.user = await User.findById(decoded.id).select('-password');

      // 5. Call 'next()' to pass the request on to the next function (our controller).
      next();
    } catch (error) {
      // If the token is invalid or expired, this will fail.
      console.error(error);
      res.status(401); // 401 means Unauthorized
      throw new Error('Not authorized, token failed');
    }
  }

  // If there's no token at all in the header...
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
};

// This is a second middleware to check for a specific role.
const isOwner = (req, res, next) => {
  // We check the user object that our 'protect' middleware attached to the request.
  if (req.user && req.user.role === 'cafeOwner') {
    // If the user is a cafeOwner, call next() to proceed.
    next();
  } else {
    // Otherwise, send a 403 Forbidden error.
    res.status(403);
    throw new Error('Not authorized as a cafe owner');
  }
};

module.exports = { protect, isOwner };
