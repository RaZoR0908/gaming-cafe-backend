const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');

// 1. Import all your route files
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes');
const bookingRoutes = require('./routes/bookingRoutes'); // <-- Add this line
const reviewRoutes = require('./routes/reviewRoutes');
dotenv.config();
connectDB();

const app = express();
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const PORT = process.env.PORT || 5000;

// Auto-complete expired sessions every minute
const autoCompleteExpiredSessions = async () => {
  try {
    const now = new Date();
    
    // Find all active bookings that have passed their end time
    const Booking = require('./models/bookingModel');
    const Cafe = require('./models/cafeModel');
    
    // Get all active bookings and filter by actual session duration
    const activeBookings = await Booking.find({
      status: 'Active'
    });
    
    // Filter bookings that have actually expired based on calculatedEndTime
    const expiredBookings = activeBookings.filter(booking => {
      if (!booking.sessionStartTime || !booking.duration) {
        console.log(`⚠️ Booking ${booking._id} missing timing data - sessionStartTime: ${booking.sessionStartTime}, duration: ${booking.duration}`);
        return false; // Skip bookings without proper timing data
      }
      
      // Use calculatedEndTime if available, otherwise calculate it
      let sessionEnd;
      if (booking.calculatedEndTime) {
        sessionEnd = new Date(booking.calculatedEndTime);
      } else {
        // Fallback: calculate from sessionStartTime + duration
        const sessionStart = new Date(booking.sessionStartTime);
        sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
      }
      
      // Check if the session has actually ended
      const hasExpired = sessionEnd <= now;
      
      if (hasExpired) {
        const timeDiff = now.getTime() - sessionEnd.getTime();
        const minutesOverdue = Math.ceil(timeDiff / (1000 * 60));
        console.log(`⏰ Session ${booking._id} has expired: Started ${new Date(booking.sessionStartTime).toLocaleTimeString()}, Duration ${booking.duration}h, Ended ${sessionEnd.toLocaleTimeString()}, Current ${now.toLocaleTimeString()}, Overdue by ${minutesOverdue} minutes`);
      } else {
        const timeDiff = sessionEnd.getTime() - now.getTime();
        const minutesRemaining = Math.ceil(timeDiff / (1000 * 60));
        console.log(`✅ Session ${booking._id} still active: Started ${new Date(booking.sessionStartTime).toLocaleTimeString()}, Duration ${booking.duration}h, Ends ${sessionEnd.toLocaleTimeString()}, Current ${now.toLocaleTimeString()}, ${minutesRemaining} minutes remaining`);
      }
      
      return hasExpired;
    });

    if (expiredBookings.length > 0) {
      console.log(`🔄 Found ${expiredBookings.length} expired sessions to auto-complete`);
      
      for (const booking of expiredBookings) {
        // Log the timing details for debugging
        const sessionStart = new Date(booking.sessionStartTime);
        const calculatedEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
        console.log(`📅 Session ${booking._id}: Started at ${sessionStart.toLocaleTimeString()}, Duration: ${booking.duration}h, Should end at: ${calculatedEnd.toLocaleTimeString()}, Current time: ${now.toLocaleTimeString()}`);
        try {
          const cafe = await Cafe.findById(booking.cafe);
          if (cafe) {
            let cafeUpdated = false;
            
            // Free up assigned systems
            if (booking.assignedSystems && booking.assignedSystems.length > 0) {
              for (const assignedSystem of booking.assignedSystems) {
                const room = cafe.rooms.find(r => r.name === assignedSystem.roomType);
                if (room) {
                  const system = room.systems.find(s => s.systemId === assignedSystem.systemId);
                  if (system && system.status === 'Active') {
                    system.status = 'Available';
                    system.activeBooking = null;
                    cafeUpdated = true;
                    console.log(`🔄 System ${system.systemId} status updated from Active to Available`);
                  }
                }
              }
            }
            
            // Also check if any system has this booking as activeBooking (fallback)
            cafe.rooms.forEach(room => {
              room.systems.forEach(system => {
                if (system.activeBooking && system.activeBooking.toString() === booking._id.toString() && system.status === 'Active') {
                  system.status = 'Available';
                  system.activeBooking = null;
                  cafeUpdated = true;
                  console.log(`🔄 System ${system.systemId} status updated from Active to Available (fallback)`);
                }
              });
            });

            // Save cafe changes if any systems were updated
            if (cafeUpdated) {
              await cafe.save();
              console.log(`💾 Cafe ${cafe.name} updated with system status changes`);
            }

            // Double-check that the session has actually expired before marking as completed
            let sessionEnd;
            if (booking.calculatedEndTime) {
              sessionEnd = new Date(booking.calculatedEndTime);
            } else {
              const sessionStart = new Date(booking.sessionStartTime);
              sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
            }
            
            if (sessionEnd <= now) {
              // Update booking status
              booking.status = 'Completed';
              await booking.save();
              console.log(`✅ Session ${booking._id} completed successfully`);
              
              // Also ensure all systems linked to this booking are freed up
              if (cafeUpdated) {
                console.log(`🔄 Systems already updated for this booking`);
              } else {
                // Fallback: check if any systems still reference this booking
                let fallbackUpdated = false;
                cafe.rooms.forEach(room => {
                  room.systems.forEach(system => {
                    if (system.activeBooking && system.activeBooking.toString() === booking._id.toString()) {
                      if (system.status === 'Active') {
                        system.status = 'Available';
                        system.activeBooking = null;
                        fallbackUpdated = true;
                        console.log(`🔄 Fallback: System ${system.systemId} status updated from Active to Available`);
                      }
                    }
                  });
                });
                
                if (fallbackUpdated) {
                  await cafe.save();
                  console.log(`💾 Cafe ${cafe.name} updated with fallback system changes`);
                }
              }
            } else {
              console.log(`⚠️ Session ${booking._id} not yet expired - skipping completion`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing expired session ${booking._id}:`, error.message);
        }
      }
      
      console.log(`🎯 Auto-completion job completed: ${expiredBookings.length} sessions processed`);
    }

    // Also handle permanently cancelled bookings after 10 minutes
    const cancelledBookings = await Booking.find({
      status: 'Cancelled'
    });

    let permanentlyCancelledCount = 0;
    for (const booking of cancelledBookings) {
      const minutesSinceCancel = (now - new Date(booking.updatedAt)) / (1000 * 60);
      
      // If more than 10 minutes have passed since cancellation, mark as permanently cancelled
      if (minutesSinceCancel >= 10 && !booking.permanentlyCancelled) {
        booking.permanentlyCancelled = true;
        await booking.save();
        permanentlyCancelledCount++;
        console.log(`Marked booking ${booking._id} as permanently cancelled`);
      }
    }

    if (permanentlyCancelledCount > 0) {
      console.log(`Marked ${permanentlyCancelledCount} bookings as permanently cancelled`);
    }
    
  } catch (error) {
    console.error('Error in auto-complete job:', error);
  }
};

// Start the scheduled job
setInterval(autoCompleteExpiredSessions, 60000); // Run every minute (60000ms)

app.get('/', (req, res) => {
  console.log(`📡 Health check request from: ${req.ip}`);
  res.send('Backend API is running...');
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// 2. Tell the app to use the routes
app.use('/api/auth', authRoutes);
app.use('/api/cafes', cafeRoutes);
app.use('/api/bookings', bookingRoutes); // <-- Add this line
app.use('/api/reviews', reviewRoutes); 


// Manual sync endpoint for testing
app.post('/api/sync-sessions', async (req, res) => {
  try {
    console.log('🔄 Manual sync triggered');
    await autoCompleteExpiredSessions();
    res.json({ 
      success: true, 
      message: 'Manual sync completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Manual sync failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Manual sync failed',
      error: error.message 
    });
  }
});

// Fix incorrectly completed bookings endpoint
app.post('/api/fix-bookings', async (req, res) => {
  try {
    console.log('🔧 Fix incorrectly completed bookings triggered');
    
    const Booking = require('./models/bookingModel');
    const now = new Date();
    
    // Find all completed bookings that shouldn't be completed yet
    const activeBookings = await Booking.find({
      status: 'Completed'
    });
    
    let fixedCount = 0;
    for (const booking of activeBookings) {
      if (booking.sessionStartTime && booking.duration) {
        const sessionStart = new Date(booking.sessionStartTime);
        const sessionEnd = new Date(sessionStart.getTime() + (booking.duration * 60 * 60 * 1000));
        
        // If session hasn't actually ended yet, fix it
        if (sessionEnd > now) {
          booking.status = 'Active';
          await booking.save();
          fixedCount++;
          console.log(`🔧 Fixed booking ${booking._id} - changed from Completed to Active`);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Fixed ${fixedCount} incorrectly completed bookings`,
      fixedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fix bookings failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fix bookings failed',
      error: error.message 
    });
  }
});

// Fix system statuses for completed bookings
app.post('/api/fix-system-statuses', async (req, res) => {
  try {
    console.log('🔧 Fix system statuses for completed bookings triggered');
    
    const Booking = require('./models/bookingModel');
    const Cafe = require('./models/cafeModel');
    
    // Find all completed bookings
    const completedBookings = await Booking.find({
      status: 'Completed'
    });
    
    let systemsFixed = 0;
    let cafesUpdated = 0;
    
    for (const booking of completedBookings) {
      try {
        const cafe = await Cafe.findById(booking.cafe);
        if (cafe) {
          let cafeUpdated = false;
          
          // Check all systems in the cafe for this booking
          cafe.rooms.forEach(room => {
            room.systems.forEach(system => {
              if (system.activeBooking && system.activeBooking.toString() === booking._id.toString()) {
                if (system.status === 'Active') {
                  system.status = 'Available';
                  system.activeBooking = null;
                  cafeUpdated = true;
                  systemsFixed++;
                  console.log(`🔧 Fixed system ${system.systemId} - changed from Active to Available`);
                }
              }
            });
          });
          
          // Save cafe if any systems were updated
          if (cafeUpdated) {
            await cafe.save();
            cafesUpdated++;
            console.log(`💾 Updated cafe ${cafe.name}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing booking ${booking._id}:`, error.message);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Fixed ${systemsFixed} system statuses across ${cafesUpdated} cafes`,
      systemsFixed,
      cafesUpdated,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fix system statuses failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fix system statuses failed',
      error: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Server accessible at: http://0.0.0.0:${PORT}`);
  console.log('🔄 Auto-complete job started - checking for expired sessions every minute');
  console.log('🔧 Manual sync available at POST /api/sync-sessions');
  console.log('🔧 Fix bookings available at POST /api/fix-bookings');
  console.log('🔧 Fix system statuses available at POST /api/fix-system-statuses');
});
