const express = require('express');
const Trip = require('../models/Trip');
const UserData = require('../models/UserData');
const { reverseGeocode } = require('../utils/reverseGeocode');
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

    // Attempt reverse geocoding for starting point if route provided
    let startLocationName = undefined;
    try {
      const firstPoint = (route && route.length > 0) ? route[0] : null;
      if (firstPoint && typeof firstPoint.latitude === 'number' && typeof firstPoint.longitude === 'number') {
        startLocationName = await reverseGeocode(firstPoint.latitude, firstPoint.longitude);
      }
    } catch (geoErr) {
      console.warn('Reverse geocode start failed:', geoErr?.message || geoErr);
    }

    // Create trip
    const trip = await Trip.create({
      userId: req.user.id,
      purpose: purpose.trim(),
      startOdometer: Number(startOdometer),
      route: route || [],
      status: 'active',
      startLocation: startLocationName
    });

    // Update UserData: mark active trip and ensure currentOdometer baseline is at least startOdometer
    try {
      await UserData.findOneAndUpdate(
        { userId: req.user.id },
        {
          $set: { activeTrip: trip._id, updatedAt: new Date() },
          $max: { currentOdometer: Number(startOdometer) }
        },
        { new: true, upsert: true }
      );
    } catch (e) {
      console.warn('Failed to set activeTrip / baseline odometer:', e?.message || e);
    }

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

    // Compute final odometer using integer distance rule: round up only if fractional part > 0.5
    const roundDistance = (d) => {
      const base = Math.floor(Number(d) || 0);
      const frac = (Number(d) || 0) - base;
      return base + (frac > 0.5 ? 1 : 0);
    };
    // Prefer server-calculated distance on the trip if available
    const roundedDistance = roundDistance(trip.distance || 0);
    const computedEndOdo = trip.startOdometer + roundedDistance;

    // If client provided a value, use the computed one to guarantee consistency
    const finalEndOdometer = Math.max(computedEndOdo, trip.startOdometer);

    // Update trip
    trip.endTime = new Date();
    trip.endOdometer = finalEndOdometer;
    trip.status = 'completed';
    if (endLocation) {
      trip.endLocation = endLocation;
    } else {
      // Try to reverse geocode last route point for end location
      try {
        const lastPoint = trip.route && trip.route.length > 0 ? trip.route[trip.route.length - 1] : null;
        if (lastPoint) {
          const endLocName = await reverseGeocode(lastPoint.latitude, lastPoint.longitude);
          if (endLocName) trip.endLocation = endLocName;
        }
      } catch (geoErr) {
        console.warn('Reverse geocode end failed:', geoErr?.message || geoErr);
      }
    }

    await trip.save();

    // Update user's current odometer and clear active trip
    try {
      await UserData.findOneAndUpdate(
        { userId: req.user.id },
        {
          $inc: { currentOdometer: roundedDistance },
          $set: { activeTrip: null, updatedAt: new Date() }
        },
        { new: true, upsert: true }
      );
    } catch (e) {
      console.warn('Failed to update user currentOdometer:', e?.message || e);
    }

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

    // Defensive: ensure userData reflects this active trip if missing (e.g., legacy data)
    try {
      await UserData.findOneAndUpdate(
        { userId: req.user.id, activeTrip: { $ne: trip._id } },
        { $set: { activeTrip: trip._id, updatedAt: new Date() } }
      );
    } catch (e) {
      console.warn('Failed to sync activeTrip in userData (single point):', e?.message || e);
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

    // Optionally keep a live estimated odometer: startOdometer + rounded distance so far
    try {
      const roundDistance = (d) => {
        const base = Math.floor(Number(d) || 0);
        const frac = (Number(d) || 0) - base;
        return base + (frac > 0.5 ? 1 : 0);
      };
      const estDistance = roundDistance(trip.distance || 0);
      await UserData.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { currentOdometer: trip.startOdometer + estDistance, updatedAt: new Date() } }
      );
    } catch (e) {
      console.warn('Failed to update live odometer (single point):', e?.message || e);
    }

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

// @desc    Bulk add route points to active trip
// @route   POST /api/trips/active/route/bulk
// @access  Private
const addRoutePointsBulk = async (req, res) => {
  try {
    const { points } = req.body;
    if (!Array.isArray(points) || !points.length) {
      return res.status(400).json({ success: false, error: 'Provide non-empty points array' });
    }

    const trip = await Trip.findActiveTrip(req.user.id);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'No active trip found' });
    }

    // Defensive: ensure activeTrip is set in userData
    try {
      await UserData.findOneAndUpdate(
        { userId: req.user.id, activeTrip: { $ne: trip._id } },
        { $set: { activeTrip: trip._id, updatedAt: new Date() } }
      );
    } catch (e) {
      console.warn('Failed to sync activeTrip in userData (bulk):', e?.message || e);
    }

    const sanitized = [];
    for (const p of points) {
      if (p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && typeof p.accuracy === 'number' && typeof p.timestamp === 'number') {
        sanitized.push({
          latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            timestamp: p.timestamp
        });
      }
    }

    if (!sanitized.length) {
      return res.status(400).json({ success: false, error: 'No valid points provided' });
    }

    // Append and save
    trip.route.push(...sanitized);
    await trip.save();

    try {
      const roundDistance = (d) => {
        const base = Math.floor(Number(d) || 0);
        const frac = (Number(d) || 0) - base;
        return base + (frac > 0.5 ? 1 : 0);
      };
      const estDistance = roundDistance(trip.distance || 0);
      await UserData.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { currentOdometer: trip.startOdometer + estDistance, updatedAt: new Date() } }
      );
    } catch (e) {
      console.warn('Failed to update live odometer (bulk):', e?.message || e);
    }

    res.status(200).json({ success: true, data: trip, added: sanitized.length });
  } catch (error) {
    console.error('Bulk add route points error:', error);
    res.status(500).json({ success: false, error: 'Server error while adding route points' });
  }
};

// Routes
router.get('/', getTrips);
router.get('/active', getActiveTrip);
router.post('/', createTrip);
router.post('/active/route', addRoutePoint);
router.post('/active/route/bulk', addRoutePointsBulk);
router.get('/:id', getTrip);
router.put('/:id', updateTrip);
router.put('/:id/end', endTrip);
router.delete('/:id', deleteTrip);

module.exports = router;