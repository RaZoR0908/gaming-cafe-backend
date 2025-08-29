const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gaming-cafe', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const migratePhoneNumbers = async () => {
  try {
    console.log('Starting phone number migration...');
    
    // Find all bookings without phoneNumber field
    const bookingsWithoutPhone = await Booking.find({ phoneNumber: { $exists: false } });
    console.log(`Found ${bookingsWithoutPhone.length} bookings without phone number`);
    
    if (bookingsWithoutPhone.length === 0) {
      console.log('No migration needed - all bookings already have phone numbers');
      return;
    }
    
    // Update all bookings to have a default phone number
    const updateResult = await Booking.updateMany(
      { phoneNumber: { $exists: false } },
      { $set: { phoneNumber: 'Not provided' } }
    );
    
    console.log(`Successfully updated ${updateResult.modifiedCount} bookings`);
    console.log('Phone number migration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the migration
migratePhoneNumbers();
