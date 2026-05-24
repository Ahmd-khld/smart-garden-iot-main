const HardwareAlert = require('../models/HardwareAlert');
const Telemetry = require('../models/Telemetry');
const net = require('net');

let espIpAddress = null;

/**
 * Receives live telemetry from ESP8266, logs it to DB, and broadcasts it to the dashboard.
 * Also captures the ESP's IP address for subsequent remote control.
 */
const receiveTelemetry = async (req, res) => {
  try {
    console.log('[Hardware] Incoming Telemetry:', req.body);
    const { 
      moisture, humidity, temperature, 
      rgbDistance, servoDistance, 
      ldrStatus, pumpStatus, servoStatus 
    } = req.body;

    // Capture the ESP's IP address (normalized to IPv4)
    espIpAddress = req.ip.replace('::ffff:', '');

    const telemetryData = {
      moisture, humidity, temperature,
      rgbDistance, servoDistance,
      ldrStatus, pumpStatus, servoStatus,
      ipAddress: espIpAddress,
      timestamp: new Date()
    };

    // 1. LOG TO DATABASE
    await Telemetry.create(telemetryData);

    const io = req.app.get('io');
    if (io) {
      console.log('[Hardware] Broadcasting liveTelemetry to all clients...');
      // 2. BROADCAST TO DASHBOARD
      io.emit('liveTelemetry', {
        ...telemetryData,
        timestamp: telemetryData.timestamp.toISOString()
      });
    } else {
      console.warn('[Hardware] Cannot broadcast: io instance not found on app.');
    }

    // 3. AUTOMATED MONITORING / ALERTS
    if (moisture > 800) {
      const alert = await HardwareAlert.create({
        sensor: 'Soil Moisture',
        type: 'warning',
        message: 'CRITICAL: Soil moisture level is critically low. Verify pump operation.',
        timeString: new Date().toLocaleTimeString()
      });
      if (io) io.emit('hardwareAlert', alert);
    }

    res.status(200).json({ status: 'success', received: true });
  } catch (error) {
    console.error('[Hardware] Telemetry Process Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Fetches recent telemetry history for the dashboard.
 */
const getTelemetryHistory = async (req, res) => {
  try {
    const history = await Telemetry.find().sort({ timestamp: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch telemetry history' });
  }
};

/**
 * Sends a raw TCP command to the ESP8266's internal server.
 */
const sendControlCommand = async (req, res) => {
  const { command } = req.body; // Expected: "SERVO_ON", "SERVO_OFF", "LAMP_ON", "LAMP_OFF"
  
  if (!espIpAddress) {
    return res.status(400).json({ 
      message: 'ESP Identity Unknown. The hardware must transmit telemetry once before it can be controlled.' 
    });
  }

  const client = new net.Socket();
  
  // Timeout after 5 seconds
  client.setTimeout(5000);

  client.connect(80, espIpAddress, () => {
    console.log(`[Hardware] Sending command: ${command} to ${espIpAddress}`);
    client.write(command + '\n');
    client.end(); // Gracefully close
    res.status(200).json({ message: `Command '${command}' successfully dispatched to hardware.` });
  });

  client.on('error', (err) => {
    console.error('[Hardware] TCP Dispatch Error:', err.message);
    res.status(500).json({ message: 'Hardware Link Offline', error: err.message });
  });

  client.on('timeout', () => {
    client.destroy();
    res.status(504).json({ message: 'Hardware Link Timeout. Check ESP connectivity.' });
  });
};

module.exports = { receiveTelemetry, sendControlCommand, getTelemetryHistory };
