const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// 1. Import your new route file
const authRoutes = require('./routes/authRoutes');

dotenv.config();
connectDB();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Backend API is running...');
});

// 2. Tell the app to use the routes
// Any request to a URL starting with '/api/auth'
// will now be handled by the authRoutes file.
app.use('/api/auth', authRoutes);


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
