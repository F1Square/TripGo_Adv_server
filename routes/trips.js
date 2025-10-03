const express = require('express');
const Trip = require('../models/Trip');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// @desc    Get all trips for user
// @route   GET /api/trips
// @access  Private
const getTrips = async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    
    // Build query
    const query = { userId: req.user.id };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    
    const trips = await Trip.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip(skip);

    const total = await Trip.countDocuments(query);

    res.status(200).json({
      success: true,
      count: trips.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: trips
    });
  } catch (error) {
    console.error('Get trips error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching trips'
    });
  }
};

// @desc    Get single trip
// @route   GET /api/trips/:id
// @access  Private
const getTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('Get trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching trip'
    });
  }
};

// @desc    Create new trip
// @route   POST /api/trips
// @access  Private
const createTrip = async (req, res) => {
  try {
    const { purpose, startOdometer, route } = req.body;

    // Validation
    if (!purpose || !startOdometer) {
      return res.status(400).json({
        success: false,
        error: 'Please provide purpose and start odometer reading'
      });
    }

    // Check if user has an active trip
    const activeTrip = await Trip.findActiveTrip(req.user.id);
    if (activeTrip) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active trip. Please end it before starting a new one.'
      });
    }

    // Create trip
    const trip = await Trip.create({
      userId: req.user.id,
      purpose: purpose.trim(),
      startOdometer: Number(startOdometer),
      route: route || [],
      status: 'active'
    });

    res.status(201).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('Create trip error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('User ID:', req.user?.id);
    res.status(500).json({
      success: false,
      error: 'Server error while creating trip'
    });
  }
};

// @desc    Update trip (mainly for adding route points)
// @route   PUT /api/trips/:id
// @access  Private
const updateTrip = async (req, res) => {
  try {
    let trip = await Trip.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Don't allow updates to completed trips
    if (trip.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update completed trip'
      });
    }

    // Update allowed fields
    const { route, startLocation, endLocation } = req.body;
    
    if (route) {
      trip.route = route;
    }
    if (startLocation) {
      trip.startLocation = startLocation;
    }
    if (endLocation) {
      trip.endLocation = endLocation;
    }

    await trip.save();

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('Update trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating trip'
    });
  }
};

// @desc    End trip
// @route   PUT /api/trips/:id/end
// @access  Private
const endTrip = async (req, res) => {
  try {
    const { endOdometer, endLocation } = req.body;

    if (!endOdometer) {
      return res.status(400).json({
        success: false,
        error: 'Please provide end odometer reading'
      });
    }

    let trip = await Trip.findOne({ 
      _id: req.params.id, 
      userId: req.user.id,
      status: 'active'
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Active trip not found'
      });
    }

    // Validate end odometer
    if (Number(endOdometer) < trip.startOdometer) {
      return res.status(400).json({
        success: false,
        error: 'End odometer reading must be greater than or equal to start reading'
      });
    }

    // Update trip
    trip.endTime = new Date();
    trip.endOdometer = Number(endOdometer);
    trip.status = 'completed';
    if (endLocation) {
      trip.endLocation = endLocation;
    }

    await trip.save();

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('End trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while ending trip'
    });
  }
};

// @desc    Delete trip
// @route   DELETE /api/trips/:id
// @access  Private
const deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    await Trip.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting trip'
    });
  }
};

// @desc    Get active trip
// @route   GET /api/trips/active
// @access  Private
const getActiveTrip = async (req, res) => {
  try {
    const trip = await Trip.findActiveTrip(req.user.id);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'No active trip found'
      });
    }

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('Get active trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching active trip'
    });
  }
};

// @desc    Add route point to active trip
// @route   POST /api/trips/active/route
// @access  Private
const addRoutePoint = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, timestamp } = req.body;

    if (!latitude || !longitude || !accuracy || !timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Please provide latitude, longitude, accuracy, and timestamp'
      });
    }

    const trip = await Trip.findActiveTrip(req.user.id);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'No active trip found'
      });
    }

    // Add new point to route
    const newPoint = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: Number(accuracy),
      timestamp: Number(timestamp)
    };

    trip.route.push(newPoint);
    await trip.save();

    res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    console.error('Add route point error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while adding route point'
    });
  }
};

// Routes
router.get('/', getTrips);
router.get('/active', getActiveTrip);
router.post('/', createTrip);
router.post('/active/route', addRoutePoint);
router.get('/:id', getTrip);
router.put('/:id', updateTrip);
router.put('/:id/end', endTrip);
router.delete('/:id', deleteTrip);

module.exports = router;