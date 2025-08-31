const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const Cafe = require('../models/cafeModel');

/**
 * Cron job service to automatically synchronize expired sessions
 * Runs every minute to check for expired bookings and update system statuses
 */
class CronService {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }

  /**
   * Start the cron job
   */
  start() {
    if (this.isRunning) {
      console.log('Cron job is already running');
      return;
    }

    // Schedule job to run every minute
    this.job = cron.schedule('* * * * *', async () => {
      await this.syncExpiredSessions();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isRunning = true;
    console.log('🕐 Cron job started - checking for expired sessions every minute');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      this.isRunning = false;
      console.log('🛑 Cron job stopped');
    }
  }

  /**
   * Main function to synchronize expired sessions
   */
  async syncExpiredSessions() {
    try {
      const now = new Date();
      console.log(`🔄 Running session sync at ${now.toISOString()}`);
      
      // Find all active bookings that have expired
      const expiredBookings = await Booking.find({
        status: 'Active',
        sessionEndTime: { $lte: now }
      });

      if (expiredBookings.length === 0) {
        console.log('✅ No expired sessions found');
        return;
      }

      console.log(`📋 Found ${expiredBookings.length} expired sessions to process`);

      let completedCount = 0;
      let systemUpdatesCount = 0;

      for (const booking of expiredBookings) {
        try {
          // Update booking status to completed
          booking.status = 'Completed';
          await booking.save();
          completedCount++;

          // Find and update the cafe's system status
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
                    systemUpdatesCount++;
                    
                    console.log(`🔄 System ${system.systemId} status updated from Active to Available`);
                  }
                }
              }
            }

            // Save cafe changes if any systems were updated
            if (cafeUpdated) {
              await cafe.save();
              console.log(`💾 Cafe ${cafe.name} updated with system status changes`);
            }
          }

          console.log(`✅ Session ${booking._id} completed successfully`);
        } catch (error) {
          console.error(`❌ Error processing expired session ${booking._id}:`, error.message);
        }
      }

      console.log(`🎯 Sync completed: ${completedCount} bookings completed, ${systemUpdatesCount} systems freed`);
      
    } catch (error) {
      console.error('❌ Error in session sync cron job:', error);
    }
  }

  /**
   * Manual trigger for testing purposes
   */
  async manualSync() {
    console.log('🔧 Manual sync triggered');
    await this.syncExpiredSessions();
  }

  /**
   * Get cron job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.job ? 'Every minute' : null
    };
  }
}

// Create singleton instance
const cronService = new CronService();

module.exports = cronService;
