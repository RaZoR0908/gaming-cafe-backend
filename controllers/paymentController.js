const crypto = require('crypto');
const axios = require('axios');
const Wallet = require('../models/walletModel');
const Payment = require('../models/paymentModel');
const Booking = require('../models/bookingModel');

// PayU Money configuration
const PAYU_CONFIG = {
  merchantKey: process.env.PAYU_MERCHANT_KEY.trim(),
  saltV1: process.env.PAYU_SALT_V1.trim(),
  saltV2: process.env.PAYU_SALT_V2.trim(),
  merchantId: process.env.PAYU_MERCHANT_ID.trim(),
  baseUrl: process.env.NODE_ENV === 'production' 
    ? 'https://secure.payu.in' 
    : 'https://test.payu.in'
};

// Generate PayU hash - FIXED VERSION
const generatePayUHash = ({ key, txnid, amount, productinfo, firstname, email, saltV1, saltV2 }) => {
  // Ensure amount is formatted as string with 2 decimal places
  const formattedAmount = parseFloat(amount).toFixed(2);

  // Normalize product info to 2 decimal places if needed
  const normalizedProductInfo = productinfo.includes('Wallet Top-up') ? `Wallet Top-up - ${formattedAmount}` : productinfo;

  // UDF fields (empty for basic transactions)
  const udf1 = '';
  const udf2 = '';
  const udf3 = '';
  const udf4 = '';
  const udf5 = '';

  // Create hash string using the standard PayU format
  // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
  const hashStringV1 = `${key}|${txnid}|${formattedAmount}|${normalizedProductInfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${saltV1}`;
  const hashStringV2 = `${key}|${txnid}|${formattedAmount}|${normalizedProductInfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${saltV2}`;

  // Generate hashes
  const hash1 = crypto.createHash('sha512').update(hashStringV1).digest('hex');
  const hash2 = crypto.createHash('sha512').update(hashStringV2).digest('hex');

  // Return both individual hashes and the object format
  return {
    v1: hash1,
    v2: hash2,
    // For PayU submission, use v1 hash (most common)
    primary: hash1
  };
};

// Create payment order - FIXED VERSION
const createPaymentOrder = async (req, res) => {
  try {
    const { bookingId, amount, paymentMethod, isExtension, isWalletTopUp } = req.body;

    // Handle wallet payment (unchanged)
    if (paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ customer: req.user._id });
      if (!wallet) {
        return res.status(400).json({ message: 'Wallet not found' });
      }

      if (wallet.balance < amount) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      const payment = new Payment({
        customer: req.user._id,
        booking: bookingId,
        amount: Number(amount),
        paymentMethod: 'wallet',
        paymentGateway: 'none',
        paymentStatus: 'completed',
        isExtension,
        isWalletTopUp,
        paidAt: new Date()
      });

      await payment.save();

      wallet.balance -= Number(amount);
      
      // Get cafe name for transaction description
      let cafeName = '';
      if (bookingId && !isWalletTopUp) {
        const booking = await Booking.findById(bookingId).populate('cafe', 'name');
        cafeName = booking?.cafe?.name || 'Unknown Cafe';
      }
      
      wallet.transactions.push({
        type: 'debit',
        amount: Number(amount),
        method: isExtension ? 'extension' : isWalletTopUp ? 'topup' : 'booking',
        description: isExtension 
          ? `Extension payment (from wallet) - ${cafeName}` 
          : isWalletTopUp 
          ? 'Wallet top-up' 
          : `Gaming session booking (from wallet) - ${cafeName}`,
        bookingId: bookingId
      });
      await wallet.save();

      if (bookingId && !isWalletTopUp) {
        const booking = await Booking.findById(bookingId);
        if (booking) {
          booking.paymentStatus = 'completed';
          booking.paymentMethod = 'wallet';
          booking.isPaid = true;
          booking.status = 'Booked';
          await booking.save();
        }
      }

      return res.json({
        success: true,
        paymentId: payment._id,
        message: 'Payment completed successfully'
      });
    }

    // Handle online payment methods - FIXED
    if (['card', 'upi', 'netbanking'].includes(paymentMethod)) {
      const txnid = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare PayU parameters
      const payuParams = {
        key: PAYU_CONFIG.merchantKey,
        txnid: txnid,
        amount: parseFloat(amount).toFixed(2), // Ensure 2 decimal places
        productinfo: isExtension
          ? `Extension Payment - ${bookingId}`
          : isWalletTopUp
          ? `Wallet Top-up - ${parseFloat(amount).toFixed(2)}`
          : `Booking Payment - ${bookingId}`,
        firstname: req.user.name || 'Customer',
        email: req.user.email || 'customer@example.com',
        phone: req.user.phone || '9999999999',
        surl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
        furl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/failure`,
        hash: ''
      };

      // Generate hash
      const hashData = generatePayUHash({
        key: payuParams.key,
        txnid: payuParams.txnid,
        amount: payuParams.amount,
        productinfo: payuParams.productinfo,
        firstname: payuParams.firstname,
        email: payuParams.email,
        saltV1: PAYU_CONFIG.saltV1,
        saltV2: PAYU_CONFIG.saltV2
      });
      
      // CRITICAL FIX: Send only the primary hash string, not JSON object
      payuParams.hash = hashData.primary;

      // Save payment record
      const payment = new Payment({
        customer: req.user._id,
        booking: bookingId,
        amount: Number(amount),
        paymentMethod,
        paymentGateway: 'payu',
        gatewayOrderId: txnid,
        paymentStatus: 'pending',
        isExtension,
        isWalletTopUp
      });

      await payment.save();

      const paymentUrl = `${PAYU_CONFIG.baseUrl}/_payment`;

      return res.json({
        success: true,
        paymentId: payment._id,
        payuParams,
        paymentUrl,
        message: 'Payment order created'
      });
    }

    res.status(400).json({ message: 'Invalid payment method' });
  } catch (error) {
    console.error('Payment order creation error:', error);
    res.status(500).json({ message: 'Payment order creation failed' });
  }
};

// Verify payment - FIXED VERSION
const verifyPayment = async (req, res) => {
  try {
    const { paymentId, payuResponse } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Skip hash verification for mock/demo responses
    if (payuResponse.hash !== 'mock_hash_for_demo') {
      // CRITICAL FIX: For response verification, use reverse hash calculation
      // PayU sends back: salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
      const reverseHashString = `${PAYU_CONFIG.saltV1}|${payuResponse.status}||||||${payuResponse.udf5 || ''}|${payuResponse.udf4 || ''}|${payuResponse.udf3 || ''}|${payuResponse.udf2 || ''}|${payuResponse.udf1 || ''}|${payuResponse.email}|${payuResponse.firstname}|${payuResponse.productinfo}|${payuResponse.amount}|${payuResponse.txnid}|${PAYU_CONFIG.merchantKey}`;
      
      const calculatedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');
      

      if (calculatedHash !== payuResponse.hash) {
        return res.status(400).json({ message: 'Invalid payment response' });
      }
    }

    if (payuResponse.status === 'success') {
      // Prevent duplicate processing
      if (payment.paymentStatus === 'completed') {
        console.log('Payment already completed');
        let wallet = null;
        if (payment.isWalletTopUp) {
          wallet = await Wallet.findOne({ customer: payment.customer });
        }
        return res.json({
          success: true,
          message: 'Payment already processed',
          newBalance: payment.isWalletTopUp ? (wallet ? wallet.balance : 0) : null
        });
      }

      // Mark payment as completed
      payment.paymentStatus = 'completed';
      payment.transactionId = payuResponse.txnid;
      payment.gatewayResponse = payuResponse;
      payment.paidAt = new Date();
      await payment.save();

      // Update booking if applicable
      if (payment.booking && !payment.isWalletTopUp) {
        const booking = await Booking.findById(payment.booking);
        if (booking) {
          if (payment.isExtension) {
            booking.extensionPaymentStatus = 'completed';
            // Keep the original extension payment amount for record-keeping
            console.log('Extension payment completed for booking:', booking._id);
          } else {
            booking.paymentStatus = 'completed';
            booking.paymentMethod = payment.paymentMethod;
            booking.isPaid = true;
            booking.status = 'Booked';
          }
          await booking.save();
        }
      }

      // Add to wallet if top-up or extension payment
      let wallet = null;
      if (payment.isWalletTopUp || payment.isExtension) {
        wallet = await Wallet.findOne({ customer: payment.customer });
        if (!wallet) {
          wallet = new Wallet({
            customer: payment.customer,
            balance: 0
          });
        }
        
        if (payment.isWalletTopUp) {
          // Add money to wallet for top-up
          wallet.balance += parseFloat(payment.amount);
          wallet.transactions.push({
            type: 'credit',
            amount: parseFloat(payment.amount),
            method: 'online',
            description: `Wallet top-up via ${payment.paymentMethod.toUpperCase()} (PayU)`
          });
        } else if (payment.isExtension) {
          // Get cafe name for extension payment
          let cafeName = '';
          if (payment.booking) {
            const booking = await Booking.findById(payment.booking).populate('cafe', 'name');
            cafeName = booking?.cafe?.name || 'Unknown Cafe';
          }
          
          // Record extension payment transaction (no balance change)
          wallet.transactions.push({
            type: 'debit',
            amount: parseFloat(payment.amount),
            method: 'online',
            description: `Extension payment via ${payment.paymentMethod.toUpperCase()} (PayU) - ${cafeName}`,
            bookingId: payment.booking
          });
        }
        
        await wallet.save();
        console.log('Wallet transaction recorded successfully, new balance:', wallet.balance);
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        newBalance: payment.isWalletTopUp ? wallet.balance : null
      });
    } else {
      payment.paymentStatus = 'failed';
      payment.gatewayResponse = payuResponse;
      await payment.save();

      res.status(400).json({ message: 'Payment failed' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Payment verification failed' });
  }
};

// Create extension payment (unchanged)
const createExtensionPayment = async (req, res) => {
  try {
    const { bookingId, amount, paymentMethod } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const paymentData = {
      bookingId,
      amount,
      paymentMethod,
      isExtension: true
    };

    req.body = paymentData;
    return createPaymentOrder(req, res);
  } catch (error) {
    console.error('Extension payment error:', error);
    res.status(500).json({ message: 'Extension payment failed' });
  }
};

// Process wallet payment (unchanged)
const processWalletPayment = async (req, res) => {
  try {
    const { bookingId, amount, isExtension = false } = req.body;

    const wallet = await Wallet.findOne({ customer: req.user._id });
    if (!wallet) {
      return res.status(400).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    const payment = new Payment({
      customer: req.user._id,
      booking: bookingId,
      amount,
      paymentMethod: 'wallet',
      paymentGateway: 'none',
      paymentStatus: 'completed',
      isExtension,
      paidAt: new Date()
    });

    await payment.save();

    wallet.balance -= amount;
    
    // Get cafe name for transaction description
    let cafeName = '';
    if (bookingId) {
      const booking = await Booking.findById(bookingId).populate('cafe', 'name');
      cafeName = booking?.cafe?.name || 'Unknown Cafe';
    }
    
    wallet.transactions.push({
      type: 'debit',
      amount,
      method: isExtension ? 'extension' : 'booking',
      description: isExtension 
        ? `Extension payment (from wallet) - ${cafeName}` 
        : `Gaming session booking (from wallet) - ${cafeName}`,
      bookingId: bookingId
    });
    await wallet.save();

    const booking = await Booking.findById(bookingId);
    if (booking) {
      if (payment.isExtension) {
        booking.extensionPaymentStatus = 'completed';
        // Keep the original extension payment amount for record-keeping
        console.log('Extension payment completed via wallet for booking:', booking._id);
      } else {
        booking.paymentStatus = 'completed';
        booking.paymentMethod = 'wallet';
        booking.isPaid = true;
        booking.status = 'Booked';
      }
      await booking.save();
    }

    res.json({
      success: true,
      paymentId: payment._id,
      message: 'Wallet payment completed successfully'
    });
  } catch (error) {
    console.error('Wallet payment error:', error);
    res.status(500).json({ message: 'Wallet payment failed' });
  }
};

// Get wallet balance with all transactions
const getWalletBalance = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ customer: req.user._id });
    
    if (!wallet) {
      wallet = new Wallet({
        customer: req.user._id,
        balance: 0
      });
      await wallet.save();
    }

    // Get all payment transactions for this customer (excluding wallet payments to avoid duplicates)
    const payments = await Payment.find({ 
      customer: req.user._id,
      paymentStatus: 'completed',
      paymentMethod: { $ne: 'wallet' } // Exclude wallet payments to prevent duplicates
    }).populate({
      path: 'booking',
      select: 'cafe',
      populate: {
        path: 'cafe',
        select: 'name'
      }
    }).sort({ createdAt: -1 });

    // Convert payment records to transaction format (only for non-wallet payments)
    const paymentTransactions = payments.map(payment => {
      let description = '';
      let type = 'debit';
      
      if (payment.isWalletTopUp) {
        type = 'credit';
        description = `Wallet top-up via ${payment.paymentMethod.toUpperCase()} (PayU)`;
      } else if (payment.isExtension) {
        const cafeName = payment.booking?.cafe?.name || 'Gaming Cafe';
        description = `Extension payment via ${payment.paymentMethod.toUpperCase()} (PayU) - ${cafeName}`;
      } else {
        const cafeName = payment.booking?.cafe?.name || 'Gaming Cafe';
        description = `Gaming session booking via ${payment.paymentMethod.toUpperCase()} (PayU) - ${cafeName}`;
      }

      return {
        type,
        amount: payment.amount,
        method: 'online',
        description,
        bookingId: payment.booking?._id,
        createdAt: payment.paidAt || payment.createdAt,
        paymentId: payment._id,
        paymentMethod: payment.paymentMethod
      };
    });

    // Combine wallet transactions and payment transactions
    const allTransactions = [
      ...wallet.transactions.map(tx => ({
        ...tx.toObject(),
        source: 'wallet'
      })),
      ...paymentTransactions.map(tx => ({
        ...tx,
        source: 'payment'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      balance: wallet.balance,
      transactions: allTransactions
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ message: 'Failed to get wallet balance' });
  }
};

// Create wallet top-up (unchanged)
const createWalletTopUp = async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;

    console.log('Create wallet top-up request:', { amount, paymentMethod, user: req.user._id });

    const paymentData = {
      amount: parseFloat(amount).toFixed(2),
      paymentMethod,
      isWalletTopUp: true
    };

    req.body = paymentData;
    return createPaymentOrder(req, res);
  } catch (error) {
    console.error('Wallet top-up error:', error);
    res.status(500).json({ message: 'Wallet top-up failed' });
  }
};

// Verify wallet top-up - FIXED VERSION
const verifyWalletTopUp = async (req, res) => {
  try {
    const { paymentId, payuResponse } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Skip hash verification for mock/demo responses
    if (payuResponse.hash !== 'mock_hash_for_demo') {
      // Use reverse hash for response verification
      const reverseHashString = `${PAYU_CONFIG.saltV1}|${payuResponse.status}||||||${payuResponse.udf5 || ''}|${payuResponse.udf4 || ''}|${payuResponse.udf3 || ''}|${payuResponse.udf2 || ''}|${payuResponse.udf1 || ''}|${payuResponse.email}|${payuResponse.firstname}|${payuResponse.productinfo}|${payuResponse.amount}|${payuResponse.txnid}|${PAYU_CONFIG.merchantKey}`;
      
      const calculatedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');
      
      console.log('Wallet top-up verification:');
      console.log('Calculated hash:', calculatedHash);
      console.log('Received hash:', payuResponse.hash);

      if (calculatedHash !== payuResponse.hash) {
        return res.status(400).json({ message: 'Invalid payment response' });
      }
    }

    if (payuResponse.status === 'success') {
      if (payment.paymentStatus === 'completed') {
        let wallet = await Wallet.findOne({ customer: payment.customer });
        return res.json({
          success: true,
          message: 'Wallet top-up already processed',
          newBalance: wallet ? wallet.balance : 0
        });
      }

      payment.paymentStatus = 'completed';
      payment.transactionId = payuResponse.txnid;
      payment.gatewayResponse = payuResponse;
      payment.paidAt = new Date();
      await payment.save();

      let wallet = await Wallet.findOne({ customer: payment.customer });
      if (!wallet) {
        wallet = new Wallet({ customer: payment.customer, balance: 0 });
      }
      wallet.balance += parseFloat(payment.amount);
      wallet.transactions.push({
        type: 'credit',
        amount: parseFloat(payment.amount),
        method: 'online',
        description: `Wallet top-up via ${payment.paymentMethod.toUpperCase()} (PayU)`
      });
      await wallet.save();

      res.json({
        success: true,
        message: 'Wallet top-up successful',
        newBalance: wallet.balance
      });
    } else {
      payment.paymentStatus = 'failed';
      payment.gatewayResponse = payuResponse;
      await payment.save();
      res.status(400).json({ message: 'Wallet top-up failed' });
    }
  } catch (error) {
    console.error('Wallet top-up verification error:', error);
    res.status(500).json({ message: 'Wallet top-up verification failed' });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  createExtensionPayment,
  processWalletPayment,
  getWalletBalance,
  createWalletTopUp,
  verifyWalletTopUp
};