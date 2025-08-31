const mongoose = require('mongoose');
const cronService = require('./services/cronService');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Test function to create a test scenario
const testSyncScenario = async () => {
  try {
    console.log('🧪 Testing synchronization scenario...');
    
    // Test 1: Check cron service status
    console.log('\n📊 Cron Service Status:');
    const status = cronService.getStatus();
    console.log(status);
    
    // Test 2: Manual sync trigger
    console.log('\n🔄 Triggering manual sync...');
    await cronService.manualSync();
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await testSyncScenario();
  
  // Close connection
  await mongoose.connection.close();
  console.log('\n🔌 MongoDB connection closed');
  process.exit(0);
};

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

// Run the test
main();
