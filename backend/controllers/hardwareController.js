const HardwareAlert = require('../models/HardwareAlert');
const net = require('net');

let espIpAddress = null;

/**
 * Receives live telemetry from ESP8266 and broadcasts it to the dashboard.
 * Also captures the ESP's IP address for subsequent remote control.
 */
const receiveTelemetry = async (req, res) => {
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
    timestamp: new Date().toISOString()
  };

  const io = req.app.get('io');
  if (io) {
    console.log('[Hardware] Broadcasting liveTelemetry to all clients...');
    // Broadcast live readings globally to all connected clients
    io.emit('liveTelemetry', telemetryData);
  } else {
    console.warn('[Hardware] Cannot broadcast: io instance not found on app.');
  }

  // Automated monitoring: Create a persistent alert if sensor values are critical
  if (moisture > 800) {
    try {
      const alert = await HardwareAlert.create({
        sensor: 'Soil Moisture',
        type: 'warning',
        message: 'CRITICAL: Soil moisture level is critically low. Verify pump operation.',
        timeString: new Date().toLocaleTimeString()
      });
      if (io) io.emit('hardwareAlert', alert);
    } catch (err) {
      console.error('Failed to create moisture alert:', err);
    }
  }

  res.status(200).json({ status: 'success', received: true });
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

module.exports = { receiveTelemetry, sendControlCommand };
