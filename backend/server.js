require('dotenv').config({ quiet: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookie = require('cookie');
const mongoSanitize = require('express-mongo-sanitize');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Ticket = require('./models/Ticket');
const AdminAuditLog = require('./models/AdminAuditLog');
const BannedIP = require('./models/BannedIP');
const WhitelistedIP = require('./models/WhitelistedIP');
const HardwareAlert = require('./models/HardwareAlert');

const { protect } = require('./middleware/authMiddleware');
const { requireSuperAdmin, requireAdmin } = require('./middleware/superAdminMiddleware');

const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const promoRoutes = require('./routes/promoRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const io = new Server(server, {
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 60000,
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
  transports: ['websocket'],
  cors: {
    origin(origin, callback) {
      const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const isAllowedLocalDevOrigin = (o) =>
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):517\d$/.test(o);
      if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  },
});

module.exports.io = io;
app.set('io', io);

app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const isAllowedLocalDevOrigin = (o) =>
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):517\d$/.test(o);
      if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

app.use((req, res, next) => {
  if (req.headers.cookie) {
    const parsedCookies = cookie.parse(req.headers.cookie);
    const token = parsedCookies.token || parsedCookies.jwt;
    if (token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.body) {
    mongoSanitize.sanitize(req.body);
  }
  next();
});

const { initTicketCron } = require('./cron/ticketCron');

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park')
  .then(() => {
    console.log('MongoDB Connected');
    initAdmin();
    initTicketCron();
  })
  .catch((err) => console.error('MongoDB connection error:', err));

const initAdmin = async () => {
  try {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
    const adminExists = await User.findOne({ email: superAdminEmail });
    if (!adminExists) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      // Do NOT hash here, User.create will trigger pre-save hook which hashes it
      await User.create({
        name: 'System Administrator',
        email: superAdminEmail,
        phone: 'N/A',
        password: adminPassword,
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

const logAdminActionServer = async (req, actionDesc) => {
  try {
    if (!req.user || !req.user.email) return;
    const log = await AdminAuditLog.create({
      email: req.user.email,
      ipAddress: req.ip || 'unknown-client',
      status: 'success',
      statusCode: 200,
      action: actionDesc,
      userAgent: req.get('User-Agent') || 'Unknown',
    });
    if (io) io.emit('auditLogUpdate', log);
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

app.use('/api/users', userRoutes);
app.use('/api', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/promo', promoRoutes);

app.delete('/api/admin/clear-dummy-tickets', requireSuperAdmin, async (req, res) => {
  try {
    await Ticket.deleteMany({});
    await logAdminActionServer(req, 'Cleared all dummy ticket data');
    if (io) io.emit('dataRefresh');
    res.json({ message: 'Successfully cleared all dummy tickets!' });
  } catch (error) {
    console.error('Clear Dummy Data Error:', error);
    res.status(500).json({ message: 'Failed to clear dummy tickets' });
  }
});

app.post('/api/admin/backups/:filename/restore', requireSuperAdmin, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const backupPath = path.join(__dirname, 'backups', filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup file not found on server.' });
    }
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
    const dbName = mongoose.connection.name;
    const restoreCmd = `mongorestore --uri="${mongoUri}" --archive="${backupPath}" --gzip --nsInclude="${dbName}.*" --drop`;
    const { exec } = require('child_process');
    exec(restoreCmd, async (error, stdout, stderr) => {
      if (error) {
        console.error('Restore Error:', stderr);
        return res.status(500).json({ message: 'Restore failed', error: stderr });
      }
      await logAdminActionServer(req, `Restored database from backup: ${filename}`);
      if (io) io.emit('dataRefresh');
      res.status(200).json({ message: 'Database successfully restored from backup!' });
    });
  } catch (error) {
    console.error('Restore Error:', error);
    res.status(500).json({ message: 'Error initiating restore' });
  }
});

io.on('connection', (socket) => {
  // Allow admins to join any user room, and users to join their OWN room
  socket.on('joinUserRoom', (userId) => {
    socket.join(`user-${userId}-tickets`);
    console.log(`Socket ${socket.id} joined room: user-${userId}-tickets`);
  });

  socket.on('leaveUserRoom', (userId) => {
    socket.leave(`user-${userId}-tickets`);
  });
});

setInterval(async () => {
  const alertTemplates = [
    { message: 'Zone C moisture dropped below 30%. Irrigation scheduled.', type: 'warning' },
    { message: 'RFID Ramp deployed successfully at West Gate.', type: 'info' },
    { message: 'Smart Bin #4 in Sector A is at 95% capacity.', type: 'warning' },
    { message: 'Automated irrigation cycle completed in Sector 2.', type: 'success' },
    { message: 'Unrecognized QR code scanned at Staff Entrance.', type: 'error' },
    { message: 'Solar panel array #3 reporting peak output.', type: 'success' },
    { message: 'Pet hydration station #1 refilled automatically.', type: 'action' },
  ];
  const randomAlert = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  try {
    const newAlert = new HardwareAlert({
      message: randomAlert.message,
      type: randomAlert.type,
      timeString,
    });
    await newAlert.save();
    io.emit('hardwareAlert', { id: newAlert._id, time: timeString, ...randomAlert });
    const isEmailConfigured = process.env.EMAIL_USER && process.env.EMAIL_USER !== 'your-email@gmail.com' && process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your-app-password';
    if (randomAlert.type === 'error' && isEmailConfigured) {
      const adminUser = await User.findOne({ role: 'admin' });
      const adminEmail = (adminUser && adminUser.email) || process.env.EMAIL_USER;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
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
      `,
      });
    }
  } catch (err) {}
}, Math.floor(Math.random() * ((parseInt(process.env.HARDWARE_ALERT_MAX_INTERVAL) || 12000) - (parseInt(process.env.HARDWARE_ALERT_MIN_INTERVAL) || 4000))) + (parseInt(process.env.HARDWARE_ALERT_MIN_INTERVAL) || 4000));

app.use((err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  if (err.message === 'Not authorized, no session' || err.message === 'Not authorized, token failed') {
    statusCode = 401;
  }
  res.status(statusCode).json({ message: err.message });
});

server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
