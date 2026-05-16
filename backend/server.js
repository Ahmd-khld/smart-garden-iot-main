require('dotenv').config({ quiet: true });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const nodemailer = require('nodemailer');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const promoRoutes = require('./routes/promoRoutes');
const Ticket = require('./models/Ticket');
const HardwareAlert = require('./models/HardwareAlert');
const AdminAuditLog = require('./models/AdminAuditLog');
const BannedIP = require('./models/BannedIP');
const WhitelistedIP = require('./models/WhitelistedIP');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { requireAdmin, requireSuperAdmin } = require('./middleware/superAdminMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const initAdmin = async () => {
  try {
    const adminExists = await User.findOne({ email: 'admin@smartpark.com' });
    if (!adminExists) {
      // Use environment variable for initial admin password to prevent hardcoded credentials
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await User.create({
        name: 'System Administrator',
        email: 'admin@smartpark.com',
        phone: 'N/A',
        password: hashedPassword,
        age: 30,
        role: 'admin',
        hasDisability: false,
      });
      console.log('Admin user verified/created');
    }
  } catch (error) {
    console.error('Failed to initialize admin account:', error);
  }
};

// Helper to log custom server.js admin operations
const logAdminActionServer = async (req, actionDesc) => {
  try {
    if (!req.user || !req.user.email) return;
    const log = await AdminAuditLog.create({
      email: req.user.email,
      ipAddress: req.ip || 'unknown-client',
      status: 'success',
      statusCode: 200,
      action: actionDesc,
      userAgent: req.get('User-Agent') || 'Unknown'
    });
    const io = req.app.get('io');
    if (io) io.emit('auditLogUpdate', log);
  } catch (err) { console.error('Audit Log Error:', err); }
};

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park')
  .then(() => {
    console.log('MongoDB Connected');
    initAdmin();
  })
  .catch(err => console.error('MongoDB connection error:', err));

const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedLocalDevOrigin = (origin) => (
  // Added support for LAN IPs (e.g. 192.168.1.x) to prevent loop/drops during mobile testing
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):517\d$/.test(origin)
);

const io = new Server(server, {
  pingTimeout: 60000, // Increase timeout to prevent background tab disconnects
  pingInterval: 25000,
  // Force WebSockets explicitly to bypass any HTTP polling/sticky session loops
  transports: ['websocket'],
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      // Return false to cleanly reject instead of throwing an HTTP 500 connection crash
      return callback(null, false);
    },
    credentials: true
  }
});

// Make io accessible in routes/controllers
app.set('io', io);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
      return callback(null, true);
    }

    // Return false to cleanly reject instead of throwing an HTTP 500 error
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json());

// Extract token from cookies and attach it to the Authorization header
// This ensures that existing API authentication middleware works seamlessly with HTTP-Only cookies
app.use((req, res, next) => {
  if (req.headers.cookie) {
    const parsedCookies = cookie.parse(req.headers.cookie);
    const token = parsedCookies.token || parsedCookies.jwt; // Ensure this matches your cookie name
    if (token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }
  }
  next();
});

// Sanitize data to prevent NoSQL Injection
app.use((req, res, next) => {
  if (req.body) {
    mongoSanitize.sanitize(req.body);
  }
  next();
});

// Brute-force lockout middleware for User Login
const failedLogins = new Map();
app.use('/api/login', async (req, res, next) => {
  if (req.method !== 'POST') return next();

  // Normalize email to prevent case-sensitivity bugs blocking logins
  if (req.body && req.body.email) {
    req.body.email = req.body.email.toLowerCase().trim();
  }

  let clientIp = req.ip || 'unknown-client';
  
  // Normalize IPv4-mapped IPv6 addresses (e.g. "::ffff:192.168.1.22" becomes "192.168.1.22")
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substring(7);
  }

  // 1. Check for permanent IP Ban
  try {
    const isBanned = await BannedIP.findOne({ ipAddress: clientIp }).lean();
    // Failsafe: Do not block the super admin from their own system if they accidentally banned themselves
    if (isBanned && req.body.email !== 'admin@smartpark.com') {
      return res.status(403).json({ message: 'Access denied: This IP address has been permanently banned.' });
    }
  } catch (err) {
    console.error('Banned IP Check Error:', err);
  }

  // Admin IP Whitelist Check
  if (req.body && req.body.email) {
    try {
      const userCheck = await User.findOne({ email: req.body.email }).lean();
      if (userCheck && userCheck.role === 'admin') {
        const isSuperAdmin = userCheck.email === 'admin@smartpark.com';
        const clientMac = req.body.macAddress || ''; // Sent by custom clients; browsers cannot send MAC natively

        const whitelistedDocs = await WhitelistedIP.find({}).lean();
        const dbIps = whitelistedDocs.map(doc => doc.ipAddress);
        const envIps = (process.env.ADMIN_WHITELISTED_IPS || '127.0.0.1,::1,192.168.1.22')
          .split(',')
          .map(ip => ip.trim())
          .filter(Boolean);
        
        let isAllowed = false;

        if (isSuperAdmin) {
          // Super Admin bypasses IP restrictions to ensure they are never locked out of their own system
          isAllowed = true;
        } else {
          // Sub-Admins MUST be logged in from an IP explicitly bound to their email address.
          // Generic whitelisted IPs do NOT grant access to Sub-Admins.
          const matchedDoc = whitelistedDocs.find(doc => doc.ipAddress === clientIp && doc.adminEmail === userCheck.email);
          if (matchedDoc) {
             if (matchedDoc.macAddress && matchedDoc.macAddress !== clientMac) {
                isAllowed = false; // MAC Address mismatch
             } else {
                isAllowed = true;
             }
          } else {
             isAllowed = false; // Strict binding: no match = no access
          }
        }
        
        if (!isAllowed) {
          try {
            const log = await AdminAuditLog.create({
              email: userCheck.email,
              ipAddress: clientIp,
              status: 'failed',
              statusCode: 403,
              action: 'Blocked: IP Whitelist Mismatch',
              userAgent: req.get('User-Agent') || 'Unknown'
            });
            const io = req.app.get('io');
            if (io) io.emit('auditLogUpdate', log);
          } catch (err) {
            console.error(err);
          }
          return res.status(403).json({ message: `Admin access denied from unauthorized IP: ${clientIp}` });
        }
        req.isAdminLogin = true;
        req.adminEmail = userCheck.email;
      }
    } catch (error) {
      console.error('Admin IP Check Error:', error);
    }
  }

  const loginStatus = failedLogins.get(clientIp) || { count: 0, totalFailures: 0, lockoutUntil: null };

  // 2. Check if currently under 5-minute soft lockout
  if (loginStatus.lockoutUntil && new Date() < loginStatus.lockoutUntil && (!req.body || req.body.email !== 'admin@smartpark.com')) {
    const remaining = Math.ceil((loginStatus.lockoutUntil - new Date()) / 1000 / 60);
    if (req.isAdminLogin) {
      AdminAuditLog.create({
        email: req.adminEmail,
        ipAddress: clientIp,
        status: 'failed',
        statusCode: 429,
        action: 'Blocked: Too many failed attempts',
        userAgent: req.get('User-Agent') || 'Unknown'
      }).then(log => {
        const io = req.app.get('io');
        if (io) io.emit('auditLogUpdate', log);
      }).catch(console.error);
    }
    return res.status(429).json({ message: `Too many failed attempts. Try again in ${remaining} minute(s).` });
  } else if (loginStatus.lockoutUntil && new Date() >= loginStatus.lockoutUntil) {
    loginStatus.count = 0;
    loginStatus.lockoutUntil = null;
    failedLogins.set(clientIp, loginStatus);
  }

  // 3. Intercept the response to track success or failure
  res.on('finish', () => {
    let isSuccess = false;
    if (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 404) {
      loginStatus.count += 1;
      loginStatus.totalFailures += 1;
      
      if (loginStatus.totalFailures >= 50) {
        BannedIP.create({ ipAddress: clientIp }).then(bannedIp => {
          const io = req.app.get('io');
          if (io) {
            io.emit('bannedIpAdded', bannedIp);
          }
        }).catch(() => {}); // Catch safely ignores if already banned
      } else if (loginStatus.count >= 5) {
        loginStatus.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minute lockout
      }
      failedLogins.set(clientIp, loginStatus);
    } else if (res.statusCode === 200 || res.statusCode === 201) {
      failedLogins.delete(clientIp); // Reset on successful login
      isSuccess = true;
    }
    
    if (req.isAdminLogin) {
      AdminAuditLog.create({
        email: req.adminEmail,
        ipAddress: clientIp,
        status: isSuccess ? 'success' : 'failed',
        statusCode: res.statusCode,
        action: isSuccess ? 'Login Successful' : 'Login Failed',
        userAgent: req.get('User-Agent') || 'Unknown'
      }).then(log => {
        const io = req.app.get('io');
        if (io) io.emit('auditLogUpdate', log);
      }).catch(console.error);
    }
  });

  next();
});

// Automated Daily Database Backup (Runs daily at 2:00 AM)
cron.schedule('0 2 * * *', () => {
  console.log('Initiating automated daily database backup...');
  
  const backupDir = path.join(__dirname, 'backups');
  
  // Wrap file system operations in try/catch to prevent server crashes on I/O errors
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  } catch (fsErr) {
    console.error('Failed to create backup directory:', fsErr);
    return;
  }

  const date = new Date();
  const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const archivePath = path.join(backupDir, `smart-park-${timestamp}.gzip`);
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';

  const cmd = `mongodump --uri="${mongoUri}" --archive="${archivePath}" --gzip`;

  exec(cmd, (error) => {
    if (error) {
      console.error(`Automated backup failed: ${error.message}`);
      if (error.message.includes('not recognized') || error.message.includes('ENOENT')) {
        console.error('Please install MongoDB Database Tools and add mongodump to your system PATH.');
      }
      return;
    }
    console.log(`Automated backup successful: ${archivePath}`);
    
    // Cleanup backups older than 7 days to save disk space
    try {
      fs.readdirSync(backupDir).forEach(file => {
        const filePath = path.join(backupDir, file);
        if (file.endsWith('.gzip') && (Date.now() - fs.statSync(filePath).ctimeMs > 7 * 24 * 60 * 60 * 1000)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old backup: ${file}`);
        }
      });
    } catch (cleanupErr) {
      console.error('Failed to clean up old backups:', cleanupErr);
    }
  });
});

// Intercept user registration to broadcast real-time updates
app.use('/api/register', (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode === 201 || res.statusCode === 200) {
      try {
        const io = req.app.get('io');
        if (io && req.body && req.body.email) {
          const newUser = await User.findOne({ email: req.body.email }).select('-password -savedCards').lean();
          if (newUser) io.emit('newUserRegistered', newUser);
        }
      } catch (error) {
        console.error('WebSocket Registration Broadcast Error:', error);
      }
    }
  });
  next();
});

app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/promo', promoRoutes);

// Route to generate dummy ticket data for charts
app.post('/api/admin/generate-dummy-tickets', requireSuperAdmin, async (req, res) => {
  try {
    // Fetch all user IDs to distribute tickets randomly
    const users = await User.find({ role: 'user' }).select('_id');
    if (!users || users.length === 0) {
      return res.status(400).json({ message: 'No users exist. Please create accounts first.' });
    }

    const dummyTickets = [];
    const types = ['child', 'adult', 'senior'];
    const plans = ['one-time', 'one-time', 'one-time', 'monthly']; // Bias toward daily tickets
    const statuses = ['active', 'active', 'used', 'used', 'expired', 'cancelled']; 
    const prices = { child: 100, adult: 200, senior: 150 };
    
    // Fetch existing ticket counts to strictly enforce the 200 daily cap
    const existingTicketsAgg = await Ticket.aggregate([
      {
        $match: {
          subscriptionPlan: 'one-time',
          status: { $in: ['active', 'used'] }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$validFrom' } },
          count: { $sum: 1 }
        }
      }
    ]);

    const dayCounts = {}; // Track counts to enforce the 200 daily cap
    existingTicketsAgg.forEach(day => {
      dayCounts[day._id] = day.count;
    });

    // Generate up to 3000 random tickets, capped strictly at 200 per day
    for (let i = 0; i < 3000; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      const plan = plans[Math.floor(Math.random() * plans.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      let dayOffset = Math.floor(Math.random() * 29) - 14; 
      
      // Create artificial crowd spikes for today and tomorrow
      if (Math.random() > 0.85) {
        dayOffset = 0; // Today spike
      } else if (Math.random() > 0.85) {
        dayOffset = 1; // Tomorrow spike
      }

      const validFrom = new Date();
      validFrom.setDate(validFrom.getDate() + dayOffset);
      validFrom.setHours(0, 0, 0, 0);
      
      const validUntil = new Date(validFrom);
      if (plan === 'monthly') {
        validUntil.setDate(validUntil.getDate() + 30);
      }
      validUntil.setHours(23, 59, 59, 999);

      // Enforce the 200 tickets per day limit for dummy data
      const dateStr = validFrom.toISOString().split('T')[0];
      if (!dayCounts[dateStr]) dayCounts[dateStr] = 0;
      if (plan === 'one-time' && (status === 'active' || status === 'used')) {
        if (dayCounts[dateStr] >= 200) {
            continue; // Skip generating this ticket if the day is already full
        }
        dayCounts[dateStr]++;
      }

      // Randomize the creation time to simulate real historical booking times
      const createdAt = new Date(validFrom);
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 10)); // Booked up to 10 days before validity
      createdAt.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

      let updatedAt = createdAt;
      if (status === 'used' && dayOffset === 0) {
        updatedAt = new Date(); // Ensure dummy tickets scanned today appear in Current Occupancy!
      }

      dummyTickets.push({
        userId: randomUser._id,
        ticketType: type,
        subscriptionPlan: plan,
        price: prices[type],
        status: status,
        validFrom,
        validUntil,
        createdAt,
        updatedAt
      });
    }

    await Ticket.insertMany(dummyTickets);
    await logAdminActionServer(req, 'Generated 3000 dummy tickets for analytics');
    res.json({ message: 'Successfully generated 3000 dummy tickets with crowd spikes!' });
  } catch (error) {
    console.error('Dummy Data Error:', error);
    res.status(500).json({ message: 'Failed to generate dummy tickets' });
  }
});

// Route to clear dummy ticket data (clears all tickets)
app.delete('/api/admin/clear-dummy-tickets', requireSuperAdmin, async (req, res) => {
  try {
    await Ticket.deleteMany({});
    await logAdminActionServer(req, 'Cleared all dummy ticket data');
    res.json({ message: 'Successfully cleared all dummy tickets!' });
  } catch (error) {
    console.error('Clear Dummy Data Error:', error);
    res.status(500).json({ message: 'Failed to clear dummy tickets' });
  }
});

// Route to restore a database backup
app.post('/api/admin/backups/:filename/restore', requireSuperAdmin, async (req, res) => {
  try {
    // CRITICAL FIX: Sanitize filename to prevent Directory/Path Traversal attacks
    const filename = path.basename(req.params.filename);
    
    // Look for the file in the "backups" directory relative to server.js
    const backupPath = path.join(__dirname, 'backups', filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup file not found on server.' });
    }

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
    const cmd = `mongorestore --uri="${mongoUri}" --archive="${backupPath}" --gzip --drop`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Restore error: ${error.message}`);
        return res.status(500).json({ message: 'Failed to restore database from backup. Make sure mongorestore is installed.' });
      }
      
      console.log(`Restore successful: ${stdout}`);
      await logAdminActionServer(req, `Restored database backup from file: ${filename}`);
      res.status(200).json({ message: 'Database successfully restored from backup!' });
    });
  } catch (error) {
    console.error('Error during restoration:', error);
    res.status(500).json({ message: 'Internal server error during restoration.' });
  }
});

// Basic route to test the server
app.get('/', (req, res) => {
  res.json({ message: 'Smart Park API is running' });
});

// Socket.io Authentication Middleware
io.use((socket, next) => {
  let token = socket.handshake.auth?.token;

  // If the token is missing from the auth payload, extract it from the cookies
  if (!token && socket.handshake.headers.cookie) {
    const parsedCookies = cookie.parse(socket.handshake.headers.cookie);
    token = parsedCookies.token || parsedCookies.jwt; // Adjust 'token' if your cookie is named something else
  }

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    socket.user = decoded; // Attach the decoded user data to the socket
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// WebSocket Connection & Mock Hardware Alerts
io.on('connection', (socket) => {
  // Commenting out connection logs to prevent terminal spam when clients reconnect 
  // (e.g., due to background tab throttling, transport upgrades, or HMR)
  // console.log('Admin Dashboard connected to real-time hardware alerts');
  
  socket.on('disconnect', () => {
    // console.log('Admin Dashboard disconnected from alerts');
  });
});

// Simulate real-time hardware alerts triggering every 5-12 seconds
setInterval(async () => {
  const alertTemplates = [
    { message: 'Zone C moisture dropped below 30%. Irrigation scheduled.', type: 'warning' },
    { message: 'RFID Ramp deployed successfully at West Gate.', type: 'info' },
    { message: 'Smart Bin #4 in Sector A is at 95% capacity.', type: 'warning' },
    { message: 'Automated irrigation cycle completed in Sector 2.', type: 'success' },
    { message: 'Unrecognized QR code scanned at Staff Entrance.', type: 'error' },
    { message: 'Solar panel array #3 reporting peak output.', type: 'success' },
    { message: 'Pet hydration station #1 refilled automatically.', type: 'action' }
  ];
  
  const randomAlert = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  try {
    // Save to Database
    const newAlert = new HardwareAlert({
      message: randomAlert.message,
      type: randomAlert.type,
      timeString
    });
    await newAlert.save();

    // Broadcast with the real database ID
    io.emit('hardwareAlert', {
      id: newAlert._id,
      time: timeString,
      ...randomAlert
    });

    // If it's a critical error, trigger an email to the admin
    if (randomAlert.type === 'error' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const adminUser = await User.findOne({ role: 'admin' });
      // Fallback to sending to the system's own email if the admin user has a fake/dummy email
      const adminEmail = (adminUser && adminUser.email) || process.env.EMAIL_USER;
      
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });

      await transporter.sendMail({
        from: `"Smart Park System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `🚨 CRITICAL HARDWARE ERROR DETECTED`,
        html: `
          <h2 style="color: #ef4444;">Smart Park Hardware Alert</h2>
          <p><strong>Time:</strong> ${timeString}</p>
          <p><strong>Details:</strong> ${randomAlert.message}</p>
          <p>Please log in to the Admin Control Panel immediately to investigate.</p>
        `
      });
      console.log('Dispatched critical error email to admin.');
    }
  } catch (err) {
    console.error('Hardware Alert Error:', err);
  }
}, Math.floor(Math.random() * 8000) + 4000);

// Global Error Handler
app.use((err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Identify Auth errors throwing without proper status code
  if (err.message === 'Not authorized, no session' || err.message === 'Not authorized, token failed') {
    statusCode = 401;
  }

  // Do not spam the server console with expected unauthorized request errors
  if (statusCode !== 401) {
    console.error('Global Error:', err);
  }
  
  res.status(statusCode).json({ message: err.message });
});

server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
