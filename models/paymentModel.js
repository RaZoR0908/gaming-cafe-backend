const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  customer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  booking: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking' 
  }, // Optional, for booking payments
  amount: { 
    type: Number, 
    required: true 
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'card', 'upi', 'netbanking', 'cash'],
    required: true
  },
  paymentGateway: {
    type: String,
    enum: ['payu', 'none'], // none for wallet/cash
    default: 'none'
  },
  transactionId: String, // ID from payment gateway
  gatewayOrderId: String, // Order ID from payment gateway
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  gatewayResponse: Object, // Store full response from gateway
  paidAt: Date,
  isExtension: { 
    type: Boolean, 
    default: false 
  },
  isWalletTopUp: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
