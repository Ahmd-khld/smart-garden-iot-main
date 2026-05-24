const express = require('express');
const router = express.Router();
const { receiveTelemetry, sendControlCommand, getTelemetryHistory } = require('../controllers/hardwareController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/superAdminMiddleware');

// Public route for hardware telemetry ingestion (ESP8266 does not use JWT)
router.post('/telemetry', receiveTelemetry);

// Secure route to fetch telemetry history
router.get('/history', protect, requireAdmin, getTelemetryHistory);

// Secure route for remote control from the dashboard
router.post('/control', protect, requireAdmin, sendControlCommand);

module.exports = router;
