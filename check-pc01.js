const mongoose = require('mongoose');

async function checkPC01() {
  try {
    console.log('Connecting to database...');
    // Try the most likely database names
    const possibleDbNames = ['gamingcafe', 'nexusgaming', 'nexus-gaming', 'nexusgamingcafee'];
    
    for (const dbName of possibleDbNames) {
      try {
        console.log(`\nTrying database: ${dbName}`);
        await mongoose.connect(`mongodb://localhost:27017/${dbName}`);
        console.log(`Connected to database: ${dbName}`);
        
        const db = mongoose.connection.db;
        const cafes = await db.collection('cafes').find({}).toArray();
        
        if (cafes.length > 0) {
          console.log(`Found ${cafes.length} cafes in ${dbName}`);
          
          for (const cafe of cafes) {
            console.log(`Cafe name: "${cafe.name}"`);
            
            if (cafe.rooms && cafe.rooms.some(room => 
              room.systems && room.systems.some(sys => sys.systemId === 'PC01')
            )) {
              console.log(`\n🎯 Found PC01 in cafe: "${cafe.name}"`);
              
              const room = cafe.rooms.find(r => r.systems.some(s => s.systemId === 'PC01'));
              console.log(`Room: ${room.name}`);
              
              const system = room.systems.find(s => s.systemId === 'PC01');
              
              console.log('\n=== PC01 Status ===');
              console.log('Status:', system.status);
              console.log('activeBooking:', system.activeBooking);
              console.log('sessionStartTime:', system.sessionStartTime);
              console.log('sessionEndTime:', system.sessionEndTime);
              console.log('sessionDuration:', system.sessionDuration);
              
              if (system.activeBooking) {
                console.log('\n❌ PC01 has an active booking ID:', system.activeBooking);
                console.log('This is why it shows as "Active" instead of "Available"');
              } else {
                console.log('\n✅ PC01 has NO active booking');
              }
              
              // Check if there are any conflicting session data
              if (system.sessionStartTime || system.sessionEndTime || system.sessionDuration) {
                console.log('\n⚠️  PC01 has conflicting session data:');
                console.log('sessionStartTime:', system.sessionStartTime);
                console.log('sessionEndTime:', system.sessionEndTime);
                console.log('sessionDuration:', system.sessionDuration);
              } else {
                console.log('\n✅ PC01 has no conflicting session data');
              }
              
              return; // Found PC01, exit
            }
          }
        }
        
        await mongoose.connection.close();
        
      } catch (err) {
        console.log(`Error with ${dbName}:`, err.message);
        if (mongoose.connection.readyState === 1) {
          await mongoose.connection.close();
        }
      }
    }
    
    console.log('\n❌ PC01 not found in any of the tried databases');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    console.log('Database connection closed');
  }
}

checkPC01();
