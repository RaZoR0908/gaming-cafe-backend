const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db'); // Import our DB connection function

// Load environment variables from .env file
dotenv.config();

// Connect to the database
// We will activate this line after we get our MONGO_URI from Atlas
 connectDB();

const app = express();

// Middleware to allow our server to accept and parse JSON data from requests
app.use(express.json());

const PORT = process.env.PORT || 5000;

// A simple test route to confirm the server is running
app.get('/', (req, res) => {
  res.send('Backend API is running...');
});

// We will add our real application routes here later

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
