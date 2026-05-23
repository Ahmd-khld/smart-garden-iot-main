const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/superAdminMiddleware');

/**
 * GET /api/grc/summary
 * Executes grc_bridge.py to fetch live risk and compliance data from Python scripts
 */
router.get('/summary', protect, requireAdmin, async (req, res) => {
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'grc_bridge.py');

  console.log(`DEBUG: Executing GRC Bridge: ${pythonCommand} "${scriptPath}"`);

  const child = spawn(pythonCommand, [scriptPath]);

  let stdoutData = '';
  let stderrData = '';

  child.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error('PYTHON_CRITICAL_FAILURE:', stderrData || 'Process exited with code ' + code);
      console.error('Raw Output (stdout):', stdoutData);

      // Try to parse stdout even on error, as bridge might have output JSON error
      try {
        const errorJson = JSON.parse(stdoutData);
        if (errorJson.error) {
          return res.status(500).json({ 
            message: 'GRC Engine Logic Error', 
            error: errorJson.error,
            details: errorJson.path 
          });
        }
      } catch (e) {}

      return res.status(500).json({ 
        message: 'GRC Script Execution Failed', 
        error: stderrData || 'Unknown Python Error',
        code: code 
      });
    }

    try {
      if (!stdoutData.trim()) {
        throw new Error('Python script returned empty output');
      }

      const parsedData = JSON.parse(stdoutData);

      if (parsedData.error) {
        console.error('GRC BRIDGE JSON ERROR:', parsedData.error);
        return res.status(500).json({ message: 'GRC Bridge Error', error: parsedData.error });
      }

      if (!parsedData.timestamp) {
        parsedData.timestamp = new Date().toISOString();
      }

      res.json(parsedData);
    } catch (parseError) {
      console.error('GRC JSON PARSE FATAL ERROR');
      console.error('Parse Error Message:', parseError.message);
      console.error('Raw Output:', stdoutData);
      res.status(500).json({ 
        message: 'Failed to parse GRC engine output', 
        error: parseError.message,
        raw: stdoutData,
        stderr: stderrData
      });
    }
  });

  child.on('error', (err) => {
    console.error('FAILED_TO_START_PYTHON:', err.message);
    res.status(500).json({ 
      message: 'Failed to start Python interpreter', 
      error: err.message,
      suggestion: 'Ensure Python is installed and in the system PATH'
    });
  });
});

/**
 * PATCH /api/grc/compliance/:id
 * Updates the status of a specific compliance control
 */
router.patch('/compliance/:id', protect, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  // In a real app, this would update the database via models.py
  // Since we are in a mock environment, we just log it and return success
  console.log(`DEBUG: Updating Compliance Control ${id} to status: ${status}`);

  // Simulate database latency
  setTimeout(() => {
    res.json({ 
      message: `Control ${id} updated successfully`,
      controlId: id,
      newStatus: status
    });
  }, 300);
});

module.exports = router;

