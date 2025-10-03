const express = require('express');
const UserData = require('../models/UserData');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get user data
// @route   GET /api/userdata
// @access  Private
const getUserData = async (req, res) => {
  try {
    let userData = await UserData.findByUserId(req.user.id)
      .populate('activeTripDetails');
    
    // If no user data exists, create it
    if (!userData) {
      userData = await UserData.create({
        userId: req.user.id,
        currentOdometer: 0,
        activeTrip: null
      });
    }

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Get user data error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update user data
// @route   PUT /api/userdata
// @access  Private
const updateUserData = async (req, res) => {
  try {
    const { currentOdometer, activeTrip } = req.body;
    
    const updateData = {};
    if (currentOdometer !== undefined) updateData.currentOdometer = currentOdometer;
    if (activeTrip !== undefined) updateData.activeTrip = activeTrip;

    const userData = await UserData.createOrUpdate(req.user.id, updateData);

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Update user data error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update odometer
// @route   PUT /api/userdata/odometer
// @access  Private
const updateOdometer = async (req, res) => {
  try {
    const { currentOdometer } = req.body;
    
    if (currentOdometer === undefined || currentOdometer < 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid odometer reading is required'
      });
    }

    const userData = await UserData.createOrUpdate(req.user.id, { currentOdometer });

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Update odometer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Set active trip
// @route   PUT /api/userdata/active-trip
// @access  Private
const setActiveTrip = async (req, res) => {
  try {
    const { tripId } = req.body;
    
    const userData = await UserData.createOrUpdate(req.user.id, { activeTrip: tripId });

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Set active trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Clear active trip
// @route   DELETE /api/userdata/active-trip
// @access  Private
const clearActiveTrip = async (req, res) => {
  try {
    const userData = await UserData.createOrUpdate(req.user.id, { activeTrip: null });

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Clear active trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Routes
router.get('/', protect, getUserData);
router.put('/', protect, updateUserData);
router.put('/odometer', protect, updateOdometer);
router.put('/active-trip', protect, setActiveTrip);
router.delete('/active-trip', protect, clearActiveTrip);

module.exports = router;