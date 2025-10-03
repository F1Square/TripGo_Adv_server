const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const UserData = require('../models/UserData');
const { protect } = require('../middleware/auth');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide name, email, and password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      fullName: name.trim(),
      email: email.toLowerCase().trim(),
      password
    });

    // Create initial user data
    await UserData.create({
      userId: user._id,
      currentOdometer: 0,
      activeTrip: null
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Check for user (include password for comparison)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await user.correctPassword(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
};

// @desc    Google authentication
// @route   POST /api/auth/google
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists, update Google ID if not present
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = picture;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        fullName: name,
        email: email.toLowerCase(),
        googleId: googleId,
        profilePicture: picture,
        // Generate a random password for Google users (not used)
        password: Math.random().toString(36).substring(7) + Math.random().toString(36).substring(7)
      });

      // Create UserData profile for new user
      await UserData.create({
        userId: user._id,
        preferences: {
          theme: 'light',
          notifications: true,
          units: 'metric'
        }
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(400).json({
      success: false,
      error: 'Google authentication failed'
    });
  }
};

// @desc    Google OAuth callback
// @route   POST /api/auth/google/callback
// @access  Public
const googleCallback = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/auth/callback',
      grant_type: 'authorization_code'
    });

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists, update Google ID if not present
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = picture;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        fullName: name,
        email: email.toLowerCase(),
        googleId: googleId,
        profilePicture: picture,
        // Generate a random password for Google users (not used)
        password: Math.random().toString(36).slice(-8)
      });

      // Create corresponding UserData
      await UserData.create({
        userId: user._id,
        totalTrips: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalExpenses: 0
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Google authentication failed'
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/google/callback', googleCallback);
router.get('/me', protect, getMe);

module.exports = router;