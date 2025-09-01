const crypto = require('crypto');

/**
 * Generate a unique 6-character booking code
 * Format: 2 letters + 4 numbers (e.g., AB1234)
 */
const generateBookingCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let code = '';
  
  // Generate 2 random letters
  for (let i = 0; i < 2; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  // Generate 4 random numbers
  for (let i = 0; i < 4; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
};

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Verify OTP
 */
const verifyOTP = (inputOTP, storedOTP) => {
  if (!storedOTP) return false;
  return inputOTP === storedOTP;
};

module.exports = {
  generateBookingCode,
  generateOTP,
  verifyOTP
};
