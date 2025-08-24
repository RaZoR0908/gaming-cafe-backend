// Test script to manually trigger status updates
// Run this with: node test-status-update.js

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gaming-cafe', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Booking = require('./models/bookingModel');
const Cafe = require('./models/cafeModel');

const testStatusUpdate = async () => {
  try {
    console.log('🔍 Checking for expired sessions...');
    
    const now = new Date();
    console.log(`Current time: ${now.toLocaleString()}`);
    
    // Find all active bookings
    const activeBookings = await Booking.find({ status: 'Active' });
    console.log(`Found ${activeBookings.length} active bookings`);
    
    if (activeBookings.length > 0) {
      console.log('\n📋 Active Bookings:');
      activeBookings.forEach(booking => {
        const startTime = new Date(booking.bookingDate);
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const isPM = booking.startTime.includes('PM');
        if (isPM && startHour !== 12) startHour += 12;
        if (!isPM && startHour === 12) startHour = 0;
        
        startTime.setHours(startHour, 0, 0, 0);
        const endTime = new Date(startTime.getTime() + (booking.duration * 60 * 60 * 1000));
        
        console.log(`  - ${booking.customer?.name || booking.walkInCustomerName || 'Walk-in'}: ${startTime.toLocaleString()} to ${endTime.toLocaleString()} (${booking.duration}h)`);
        console.log(`    Status: ${booking.status}, Expired: ${endTime < now ? 'YES' : 'NO'}`);
      });
    }
    
    // Find expired bookings
    const expiredBookings = await Booking.find({
      status: 'Active',
      sessionEndTime: { $lte: now }
    });
    
    console.log(`\n⏰ Found ${expiredBookings.length} expired sessions`);
    
    if (expiredBookings.length > 0) {
      console.log('\n🔄 Updating expired sessions...');
      
      for (const booking of expiredBookings) {
        const cafe = await Cafe.findById(booking.cafe);
        if (cafe) {
          // Free up assigned systems
          if (booking.assignedSystems && booking.assignedSystems.length > 0) {
            for (const assignedSystem of booking.assignedSystems) {
              const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
              if (room) {
                const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
                if (system) {
                  system.status = 'Available';
                  system.activeBooking = null;
                  console.log(`  - Freed system ${assignedSystem.systemId}`);
                }
              }
            }
            await cafe.save();
          }

          // Update booking status
          booking.status = 'Completed';
          await booking.save();
          
          console.log(`  ✅ Updated booking ${booking._id} to Completed`);
        }
      }
      
      console.log('\n🎉 Status update completed!');
    } else {
      console.log('\n✅ No expired sessions found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the test
testStatusUpdate();

