const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const app = express();

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS middleware
// Allow any origin by default to simplify cross-domain calls between
// separately deployed frontend and backend on Vercel. You can replace
// this with a whitelist using process.env.FRONTEND_URL later.
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Connect to MongoDB (optimized for serverless)
let isDbConnected = false;
const connectDB = async () => {
  if (isDbConnected) return;

  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI environment variable');
    return; // Avoid crashing the serverless function; surface errors via routes
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    isDbConnected = !!conn?.connection?.readyState;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error?.message || error);
    // Do not exit in serverless environment; requests will return 500s until fixed
  }
};

// Connect to database
connectDB();

// Import routes
const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const userDataRoutes = require('./routes/userdata');

// Route middlewares
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/userdata', userDataRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Trip Metrics Pro API is running',
    timestamp: new Date().toISOString()
  });
});

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Trip Metrics Pro API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      trips: '/api/trips',
      health: '/api/health'
    }
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Handle unhandled routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Export a serverless handler for Vercel and start a server only in
// traditional environments (local/dev or when explicitly run as a server).
const isServerless = !!process.env.VERCEL;

if (isServerless) {
  // Export the Express app directly; Vercel's Node runtime can invoke it
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API endpoints available at http://localhost:${PORT}/api`);
  });
}