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
app.use(cors());

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Backend API is running...');
});

// 2. Tell the app to use the routes
app.use('/api/auth', authRoutes);
app.use('/api/cafes', cafeRoutes);
app.use('/api/bookings', bookingRoutes); // <-- Add this line
app.use('/api/reviews', reviewRoutes); 


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
