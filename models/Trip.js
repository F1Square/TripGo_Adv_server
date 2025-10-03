const mongoose = require('mongoose');

const tripPointSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  timestamp: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const tripSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  purpose: {
    type: String,
    required: [true, 'Trip purpose is required'],
    trim: true,
    minlength: [3, 'Purpose must be at least 3 characters long'],
    maxlength: [200, 'Purpose cannot exceed 200 characters']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
    default: Date.now
  },
  endTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  startOdometer: {
    type: Number,
    required: [true, 'Start odometer reading is required'],
    min: [0, 'Odometer reading cannot be negative']
  },
  endOdometer: {
    type: Number,
    min: [0, 'Odometer reading cannot be negative'],
    validate: {
      validator: function(value) {
        return !value || value >= this.startOdometer;
      },
      message: 'End odometer must be greater than or equal to start odometer'
    }
  },
  startLocation: {
    type: String,
    trim: true,
    maxlength: [500, 'Start location cannot exceed 500 characters']
  },
  endLocation: {
    type: String,
    trim: true,
    maxlength: [500, 'End location cannot exceed 500 characters']
  },
  distance: {
    type: Number,
    default: 0,
    min: [0, 'Distance cannot be negative']
  },
  duration: {
    type: Number,
    default: 0,
    min: [0, 'Duration cannot be negative']
  },
  route: {
    type: [tripPointSchema],
    default: []
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  },
  averageSpeed: {
    type: Number,
    default: 0,
    min: [0, 'Average speed cannot be negative']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient queries
tripSchema.index({ userId: 1, createdAt: -1 });
tripSchema.index({ userId: 1, status: 1 });

// Virtual for calculated odometer distance
tripSchema.virtual('odometerDistance').get(function() {
  return this.endOdometer ? this.endOdometer - this.startOdometer : 0;
});

// Static method to find active trip for user
tripSchema.statics.findActiveTrip = function(userId) {
  return this.findOne({ userId, status: 'active' });
};

// Instance method to calculate trip metrics
tripSchema.methods.calculateMetrics = function() {
  // Calculate distance using Haversine formula when there are at least 2 points
  let totalDistance = 0;
  if (this.route && this.route.length >= 2) {
    for (let i = 1; i < this.route.length; i++) {
      const prev = this.route[i - 1];
      const curr = this.route[i];
      totalDistance += this.calculateHaversineDistance(prev, curr);
    }
  }

  this.distance = totalDistance;

  // Always compute duration when endTime exists, even if there are no route points
  if (this.endTime) {
    const durSec = Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
    this.duration = Math.max(0, durSec);
    this.averageSpeed = this.duration > 0 ? (this.distance / this.duration) * 3.6 : 0; // km/h
  }
};

// Helper method for distance calculation
tripSchema.methods.calculateHaversineDistance = function(point1, point2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Update metrics before saving
tripSchema.pre('save', function(next) {
  this.calculateMetrics();
  next();
});

module.exports = mongoose.model('Trip', tripSchema);