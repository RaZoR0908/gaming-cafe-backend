// Import the User model, which is our blueprint for user data in the database.
const User = require('../models/userModel');
// Import the jsonwebtoken library, used to create secure login tokens.
const jwt = require('jsonwebtoken');

// This is a helper function to create a login token (JWT) for a user.
// A token is like a temporary, secure ID card that proves the user is logged in.
const generateToken = (id) => {
  // We "sign" the token with a payload (the user's unique ID),
  // our secret key from the .env file, and an expiration time.
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // This token will be valid for 30 days.
  });
};

/**
 * @desc    Register a new customer
 * @route   POST /api/auth/register
 * @access  Public
 */
// This is an asynchronous function to handle the logic for registering a new user.
const registerUser = async (req, res) => {
  // Destructure the name, email, and password from the incoming request's body.
  const { name, email, password } = req.body;

  // Use a try...catch block to handle potential errors gracefully.
  try {
    // Check if a user with the provided email already exists in the database.
    const userExists = await User.findOne({ email });

    // If a user with that email is found...
    if (userExists) {
      // ...set the HTTP status to 400 (Bad Request)...
      res.status(400);
      // ...and throw an error, which will be caught by the catch block.
      throw new Error('User already exists');
    }

    // If the user does not exist, create a new user document in the database.
    // The password will be automatically encrypted by the pre-save hook in our userModel.
    const user = await User.create({
      name,
      email,
      password,
    });

    // If the user document was created successfully...
    if (user) {
      // ...send back an HTTP status of 201 (Created) and a JSON object with the new user's data.
      res.status(201).json({
        _id: user._id, // The user's unique ID from the database.
        name: user.name,
        email: user.email,
        role: user.role, // This will be 'customer' by default.
        token: generateToken(user._id), // Generate a new login token for them.
      });
    } else {
      // If user creation fails for some reason, send a 400 Bad Request error.
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) {
    // This catch block handles any errors thrown in the try block.
    // It sends back the error status code and a JSON object with the error message.
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


/**
 * @desc    Auth user & get token (Login)
 * @route   POST /api/auth/login
 * @access  Public
 */
// This is an asynchronous function to handle the logic for logging a user in.
const loginUser = async (req, res) => {
  // Destructure the email and password from the incoming request's body.
  const { email, password } = req.body;

  // Use a try...catch block for error handling.
  try {
    // Find a single user in the database that matches the provided email.
    const user = await User.findOne({ email });

    // Check if a user was found AND if the provided password matches the stored, encrypted password.
    // We use the 'matchPassword' method we created in the userModel.
    if (user && (await user.matchPassword(password))) {
      // If both checks pass, send back a JSON object with the user's data and a new login token.
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      // If no user is found or the password doesn't match, send a 401 (Unauthorized) error.
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    // This catch block handles any errors thrown in the try block.
    res.status(res.statusCode || 500).json({ message: error.message });
  }
};


// Export the functions so they can be used in our route files.
module.exports = {
  registerUser,
  loginUser,
};
