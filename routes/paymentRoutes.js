const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createPaymentOrder,
  verifyPayment,
  createExtensionPayment,
  processWalletPayment,
  getWalletBalance,
  createWalletTopUp,
  verifyWalletTopUp
} = require('../controllers/paymentController');

// Payment routes
router.route('/create-order').post(protect, createPaymentOrder);
router.route('/verify').post(protect, verifyPayment);
router.route('/extension').post(protect, createExtensionPayment);
router.route('/wallet').get(protect, getWalletBalance);
router.route('/wallet/pay').post(protect, processWalletPayment);
router.route('/wallet/topup').post(protect, createWalletTopUp);
router.route('/wallet/verify').post(protect, verifyWalletTopUp);

module.exports = router;
