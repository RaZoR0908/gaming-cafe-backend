const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  customer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  transactions: [{
    type: { 
      type: String, 
      enum: ['credit', 'debit'] 
    },
    amount: Number,
    method: String, // 'online', 'points', 'refund', 'extension'
    description: String,
    bookingId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Booking' 
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
