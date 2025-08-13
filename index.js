const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// 1. Import all your route files
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes'); // <-- Add this line

dotenv.config();
connectDB();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Backend API is running...');
});

// 2. Tell the app to use the routes
// Any request to a URL starting with '/api/auth' will be handled by the authRoutes file.
app.use('/api/auth', authRoutes);
// Any request to a URL starting with '/api/cafes' will be handled by the cafeRoutes file.
app.use('/api/cafes', cafeRoutes); // <-- Add this line


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
