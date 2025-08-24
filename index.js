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
    
    const expiredBookings = await Booking.find({
      status: 'Active',
      sessionEndTime: { $lte: now }
    });

    if (expiredBookings.length > 0) {
      console.log(`Found ${expiredBookings.length} expired sessions to auto-complete`);
      
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
                }
              }
            }
            await cafe.save();
          }

          // Update booking status
          booking.status = 'Completed';
          await booking.save();
          
          console.log(`Auto-completed booking ${booking._id} for customer ${booking.customer?.name || booking.walkInCustomerName || 'Walk-in'}`);
        }
      }
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


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Server accessible at: http://0.0.0.0:${PORT}`);
  console.log('Auto-complete job started - checking for expired sessions every minute');
});
