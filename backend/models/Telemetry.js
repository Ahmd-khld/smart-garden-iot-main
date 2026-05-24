const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    moisture: { type: Number },
    humidity: { type: Number },
    temperature: { type: Number },
    rgbDistance: { type: Number },
    servoDistance: { type: Number },
    ldrStatus: { type: String },
    pumpStatus: { type: String },
    servoStatus: { type: String },
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Index for rapid retrieval of latest data
telemetrySchema.index({ timestamp: -1 });

module.exports = mongoose.model('Telemetry', telemetrySchema);
