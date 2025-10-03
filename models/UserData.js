const mongoose = require('mongoose');

const userDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true
  },
  currentOdometer: {
    type: Number,
    required: [true, 'Current odometer is required'],
    min: [0, 'Odometer cannot be negative'],
    default: 0
  },
  activeTrip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    default: null
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

// Update the updatedAt field before saving
userDataSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for getting user details
userDataSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting active trip details
userDataSchema.virtual('activeTripDetails', {
  ref: 'Trip',
  localField: 'activeTrip',
  foreignField: '_id',
  justOne: true
});

// Static method to find user data by user ID
userDataSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

// Static method to create or update user data
userDataSchema.statics.createOrUpdate = function(userId, updateData) {
  return this.findOneAndUpdate(
    { userId },
    { ...updateData, updatedAt: Date.now() },
    { new: true, upsert: true, runValidators: true }
  );
};

// Instance method to set active trip
userDataSchema.methods.setActiveTrip = function(tripId) {
  this.activeTrip = tripId;
  return this.save();
};

// Instance method to clear active trip
userDataSchema.methods.clearActiveTrip = function() {
  this.activeTrip = null;
  return this.save();
};

// Instance method to update odometer
userDataSchema.methods.updateOdometer = function(newOdometer) {
  this.currentOdometer = newOdometer;
  return this.save();
};

module.exports = mongoose.model('UserData', userDataSchema);