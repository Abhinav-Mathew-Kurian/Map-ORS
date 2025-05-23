const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  car: {
    make: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true
    },
    batterySize_kWh: {
      type: Number,
      required: true
    },
    batterySOC_percent: {
      type: Number,
      required: true
    },
    batteryTemperature_C: {
      type: Number,
      required: true
    },
    chargingStatus: {
      type: String,
      enum: ['charging', 'idle', 'discharging'],
      default: 'idle'
    },
    range_km: {
      type: Number,
      required: true
    }
  }
});


UserSchema.index({ location: '2dsphere' });

const User = mongoose.model('user', UserSchema);
module.exports = User;
