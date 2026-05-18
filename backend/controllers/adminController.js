const Ticket = require('../models/Ticket');
const User = require('../models/User');
const HardwareAlert = require('../models/HardwareAlert');
const AdminAuditLog = require('../models/AdminAuditLog');
const BannedIP = require('../models/BannedIP');
const WhitelistedIP = require('../models/WhitelistedIP');
const PromoCode = require('../models/PromoCode');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const failedScans = new Map(); // Track failed scan attempts to prevent brute force

const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();

const isSuperAdmin = (req) => req.user && req.user.email.toLowerCase() === superAdminEmail;

const logAdminAction = async (req, actionDesc) => {
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
    const io = req.app.get('io');
    if (io) io.emit('auditLogUpdate', log);
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

const broadcastOccupancy = async (req) => {
  const io = req.app.get('io');
  if (!io) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const currentOccupancy = await Ticket.countDocuments({
    status: 'used',
    updatedAt: { $gte: startOfDay, $lte: endOfDay },
  });
  const dailyCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
  const capacityPercentage = Math.round((currentOccupancy / dailyCapacity) * 100);
  io.emit('occupancyUpdate', { currentOccupancy, capacityPercentage });
};

// Helper to broadcast ticket status changes in real-time
const broadcastTicketStatus = (req, ticket) => {
  const io = req.app.get('io');
  if (!io) return;

  const payload = {
    ticketId: ticket._id,
    userId: ticket.userId,
    status: ticket.status,
    updatedAt: ticket.updatedAt,
    ticket: ticket, // Send full object for instant frontend updates
  };

  // 1. Emit to the specific user room (e.g. for User Tickets View)
  io.to(`user-${ticket.userId}-tickets`).emit('ticketStatusChanged', payload);
  // Keep legacy event for backward compatibility
  io.to(`user-${ticket.userId}-tickets`).emit('ticketScanned', payload);

  // 2. Global broadcast for admin monitoring if needed
  io.emit('globalTicketUpdate', payload);
};

// Helper to save and broadcast hardware alerts from the Gate Scanner
const createHardwareAlert = async (req, message, type) => {
  try {
    const timeString = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newAlert = new HardwareAlert({ message, type, timeString });
    await newAlert.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('hardwareAlert', {
        id: newAlert._id,
        time: timeString,
        message: newAlert.message,
        type: newAlert.type,
      });
    }
  } catch (err) {
    console.error('Failed to create hardware alert:', err);
  }
};

const getAdminStats = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Run all 5 database queries in parallel for maximum performance
    const [totalTicketsSold, mostSoldAgg, activeUsers, purchasingUsersAgg, currentOccupancy] =
      await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        User.countDocuments({ role: 'user' }),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
        Ticket.countDocuments({ status: 'used', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      ]);

    let mostSoldTicket = 'None yet';
    if (mostSoldAgg.length > 0) {
      const top = mostSoldAgg[0];
      const typeCap = top._id.type
        ? top._id.type.charAt(0).toUpperCase() + top._id.type.slice(1)
        : 'Unknown';
      mostSoldTicket = `${typeCap} (${top._id.plan || 'unknown'})`;
    }

    // Extract the counted value from the aggregation array safely
    const purchasingUsers =
      purchasingUsersAgg.length > 0 ? purchasingUsersAgg[0].totalPurchasingUsers : 0;
    const maxCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
    const capacityPercentage = Math.round((currentOccupancy / maxCapacity) * 100);

    res.status(200).json({
      totalTicketsSold,
      mostSoldTicket,
      activeUsers,
      purchasingUsers,
      currentOccupancy: currentOccupancy,
      capacityPercentage: capacityPercentage,
      maxCapacity: maxCapacity, // Explicitly include capacity for frontend use
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ message: 'Server error retrieving stats' });
  }
};

const scanTicket = async (req, res) => {
  try {
    const clientIp = req.ip || 'gate-scanner';
    const scanStatus = failedScans.get(clientIp) || { count: 0, lockoutUntil: null };

    // Check if currently locked out
    if (scanStatus.lockoutUntil && new Date() < scanStatus.lockoutUntil) {
      const remaining = Math.ceil((scanStatus.lockoutUntil - new Date()) / 1000 / 60);
      return res
        .status(429)
        .json({ message: `Scanner locked. Try again in ${remaining} minute(s).` });
    } else if (scanStatus.lockoutUntil && new Date() >= scanStatus.lockoutUntil) {
      // Reset if lockout period has expired
      scanStatus.count = 0;
      scanStatus.lockoutUntil = null;
      failedScans.set(clientIp, scanStatus);
    }

    const handleFailure = async (alertMsg, alertType, resMsg, statusCode = 400) => {
      scanStatus.count += 1;
      if (scanStatus.count >= 5) {
        scanStatus.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minute lockout
        failedScans.set(clientIp, scanStatus);
        await createHardwareAlert(
          req,
          'SECURITY LOCKOUT: Gate scanner disabled for 5 minutes due to multiple failed scans.',
          'error'
        );
        return res
          .status(429)
          .json({
            message: 'Scanner locked due to multiple failed attempts. Try again in 5 minutes.',
          });
      }
      failedScans.set(clientIp, scanStatus);
      if (alertMsg) await createHardwareAlert(req, alertMsg, alertType);
      return res.status(statusCode).json({ message: resMsg });
    };

    const handleSuccess = async (alertMsg, resMsg) => {
      failedScans.delete(clientIp); // Reset fail counter on success
      await createHardwareAlert(req, alertMsg, 'success');
      return res.status(200).json({ message: resMsg });
    };

    console.log('Attempting to scan ID:', req.body.ticketId);
    const { ticketId } = req.body;

    if (!ticketId) {
      return handleFailure(null, null, 'ticketId is required');
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return handleFailure(
        'Invalid QR format scanned at Gate.',
        'error',
        'Invalid Ticket ID format'
      );
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return handleFailure(
        'Unrecognized Ticket ID scanned at Gate.',
        'error',
        'Ticket not found',
        404
      );
    }

    const now = new Date();
    if (ticket.validFrom && now < ticket.validFrom) {
      return handleFailure(
        `Premature entry attempt. Ticket valid from: ${new Date(ticket.validFrom).toLocaleDateString()}`,
        'warning',
        `Ticket is not valid yet. Valid starting: ${new Date(ticket.validFrom).toLocaleDateString()}`
      );
    }
    if (ticket.validUntil && now > ticket.validUntil) {
      if (ticket.status !== 'expired') {
        ticket.status = 'expired';
        await ticket.save();
      }
      return handleFailure(
        'Expired ticket scanned at Gate.',
        'warning',
        `Ticket has expired on ${new Date(ticket.validUntil).toLocaleDateString()}`
      );
    }

    if (ticket.status === 'expired') {
      return handleFailure('Expired ticket scanned at Gate.', 'warning', 'Ticket is expired');
    }

    const subType = ticket.subscriptionType || ticket.subscriptionPlan || 'one-time';

    if (subType === 'monthly') {
      if (ticket.status !== 'active') {
        return handleFailure(
          'Inactive or revoked monthly pass scanned at Gate.',
          'error',
          'Monthly ticket is not active or has been revoked.'
        );
      }

      if (!ticket.scanHistory) {
        ticket.scanHistory = [];
      }
      ticket.scanHistory.push(new Date());
      await ticket.save();

      await broadcastOccupancy(req);

      return handleSuccess(
        'Monthly pass validated successfully at Gate.',
        'Monthly Pass Validated'
      );
    } else {
      // Default to 'one-time' behavior
      if (ticket.status === 'used') {
        return handleFailure(
          'Duplicate entry attempt: Ticket already used.',
          'warning',
          'Ticket already scanned and used.'
        );
      }

      if (ticket.status === 'active') {
        ticket.status = 'used';
        if (!ticket.scanHistory) {
          ticket.scanHistory = [];
        }
        ticket.scanHistory.push(new Date());
        await ticket.save();

        await broadcastOccupancy(req);
        broadcastTicketStatus(req, ticket); // Add real-time broadcast

        return handleSuccess(
          'Ticket scanned successfully. Access granted.',
          'Ticket scanned successfully. Access granted.'
        );
      }

      return handleFailure(
        'Invalid ticket status encountered at Gate.',
        'error',
        'Invalid ticket status'
      );
    }
  } catch (error) {
    console.error('Scan Ticket Error:', error);
    await createHardwareAlert(req, 'Internal scanner error at Gate.', 'error');
    res.status(500).json({ message: 'Server error scanning ticket' });
  }
};

const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, status, role } = req.query;

    const query = {};
    if (role === 'admin') {
      // SUB-ADMIN SECURITY: Sub-admins can NEVER see or list other admins.
      if (!isSuperAdmin(req)) {
        return res
          .status(403)
          .json({ message: 'Forbidden: Sub-admins cannot view other admin accounts.' });
      }
      query.role = 'admin';
    } else {
      // DEFAULT: Always filter for 'user' role unless 'admin' is explicitly requested
      query.role = 'user';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status === 'active') query.isBlocked = false;
    if (status === 'blocked') query.isBlocked = true;

    if (role === 'admin') {
      const admins = await User.find(query)
        .select('-password -savedCards')
        .sort({ createdAt: -1 })
        .lean();
      return res.status(200).json({ users: admins });
    }

    const [usersRaw, total] = await Promise.all([
      User.find(query)
        .select('-password -savedCards')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Efficiently fetch ticket counts for all users in the current page
    const userIds = usersRaw.map((u) => u._id);
    const ticketCounts = await Ticket.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);

    // Map counts back to users
    const countMap = {};
    ticketCounts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });

    const users = usersRaw.map((u) => ({
      ...u,
      ticketCount: countMap[u._id.toString()] || 0,
    }));

    res.status(200).json({
      users,
      totalUsers: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Users Error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// @desc    Get all tickets for a specific user
// @route   GET /api/admin/users/:userId/tickets
// @access  Private (Admin)
const getUserTickets = async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;
    const userId = (rawUserId || '').trim();

    // 1. Resolve the User
    let targetUser = await User.findById(userId).lean();
    if (!targetUser) {
      targetUser = await User.findOne({ _id: userId }).lean();
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // 2. Ticket Search
    const possibleOwnerIds = [targetUser._id];
    const siblingUsers = await User.find({ email: targetUser.email }).select('_id').lean();
    siblingUsers.forEach(u => {
      if (u._id.toString() !== targetUser._id.toString()) {
        possibleOwnerIds.push(u._id);
      }
    });

    const tickets = await Ticket.find({
      userId: { $in: [...possibleOwnerIds, userId] }
    }).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
      tickets: tickets || [],
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving user tickets', error: error.message });
  }
};

// @desc    Scan and expire a specific user ticket
// @route   POST /api/admin/users/:userId/tickets/:ticketId/scan
// @access  Private (Admin)
const scanUserTicket = async (req, res) => {
  try {
    const { userId: rawUserId, ticketId } = req.params;
    const userId = rawUserId.trim();

    const ticket = await Ticket.findOne({
      _id: ticketId,
      $or: [{ userId: userId }, { userId: new mongoose.Types.ObjectId(userId) }],
    });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found for this user' });

    if (ticket.status === 'used' || ticket.status === 'expired') {
      return res.status(400).json({ message: `Ticket is already ${ticket.status}` });
    }

    ticket.status = 'used';
    ticket.scanHistory = ticket.scanHistory || [];
    ticket.scanHistory.push(new Date());
    await ticket.save();

    // Emit targeted socket event to the user's specific room
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${userId}-tickets`).emit('ticketScanned', {
        ticketId: ticket._id,
        status: 'used',
        updatedAt: ticket.updatedAt,
      });
    }

    await logAdminAction(req, `Scanned ticket ${ticketId} for user ${userId}`);

    res.status(200).json({ message: 'Ticket scanned successfully', ticket });
  } catch (error) {
    console.error('Scan User Ticket Error:', error);
    res.status(500).json({ message: 'Server error scanning user ticket' });
  }
};

const toggleBlockUser = async (req, res) => {
  try {
    const { blockReason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.email === superAdminEmail) {
      return res.status(403).json({ message: 'The Super Admin account cannot be blocked.' });
    }

    if (user.role === 'admin' && !isSuperAdmin(req)) {
      return res
        .status(403)
        .json({ message: 'Only the Super Admin can block or unblock sub-admins.' });
    }

    user.isBlocked = !user.isBlocked;

    if (user.isBlocked) {
      user.blockReason = blockReason || 'No reason provided';
    } else {
      user.blockReason = ''; // Clear reason on unblock
    }

    await user.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('userStatusUpdate', {
        userId: user._id,
        isBlocked: user.isBlocked,
        blockReason: user.blockReason,
      });
    }

    await logAdminAction(
      req,
      `Toggled block status for user: ${user.email} (Blocked: ${user.isBlocked})${user.isBlocked ? ' Reason: ' + user.blockReason : ''}`
    );
    res.status(200).json({
      message: `User has been ${user.isBlocked ? 'blocked' : 'unblocked'}`,
      isBlocked: user.isBlocked,
      blockReason: user.blockReason,
    });
  } catch (error) {
    console.error('Block User Error:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
};

const createSubAdmin = async (req, res) => {
  try {
    const { name, email, password, ipAddress, macAddress } = req.body;

    if (!name || !email || !password || !ipAddress) {
      return res
        .status(400)
        .json({ message: 'Name, email, password, and bound IP Address are required' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const ipExists = await WhitelistedIP.findOne({ ipAddress });
    if (ipExists) {
      return res
        .status(400)
        .json({ message: 'This IP Address is already in use by another whitelist entry' });
    }

    const emailWhitelisted = await WhitelistedIP.findOne({ adminEmail: email });
    if (emailWhitelisted) {
      return res.status(400).json({ message: 'This email is already bound to a whitelisted IP' });
    }

    const newAdmin = new User({
      name,
      email,
      phone: 'N/A',
      password, // Hashing is handled by the User model's pre-save middleware
      age: 30,
      role: 'admin',
    });

    await newAdmin.save();

    const newIP = await WhitelistedIP.create({
      ipAddress,
      macAddress: macAddress || '',
      description: `Sub-Admin: ${name}`,
      adminEmail: email,
    });

    const io = req.app.get('io');
    if (io) {
      // Instantly display the new admin on the dashboard
      const safeUser = {
        _id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        phone: newAdmin.phone,
        role: newAdmin.role,
        isBlocked: newAdmin.isBlocked,
        hasDisability: newAdmin.hasDisability,
        createdAt: newAdmin.createdAt,
      };
      io.emit('subAdminCreated', safeUser);
      io.emit('whitelistIpAdded', newIP);
    }

    await logAdminAction(req, `Provisioned new sub-admin: ${email}`);
    res.status(201).json({ message: 'Sub-Admin successfully provisioned and bound to network.' });
  } catch (error) {
    console.error('Create Sub-Admin Error:', error);
    res.status(500).json({ message: 'Error creating sub-admin' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userCheck = await User.findById(req.params.id);
    if (!userCheck) return res.status(404).json({ message: 'User not found' });
    if (userCheck.email === superAdminEmail) {
      return res.status(403).json({ message: 'The Super Admin account cannot be deleted.' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Cascade delete user tickets to accurately update park stats
    await Ticket.deleteMany({ userId: user._id });

    const io = req.app.get('io');

    // Automatically clean up the IP Whitelist if a Sub-Admin is deleted
    if (user.role === 'admin') {
      const deletedIp = await WhitelistedIP.findOneAndDelete({ adminEmail: user.email });
      if (io && deletedIp) io.emit('whitelistIpRemoved', deletedIp._id);
    }

    if (io) {
      if (user.role === 'admin') {
        io.emit('subAdminDeleted', user._id.toString());
      } else {
        io.emit('userDeleted', user._id.toString());
      }

      // Broadcast updated ticket stats
      const [totalTicketsSold, purchasingUsersAgg, mostSoldAgg, salesAgg] = await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        Ticket.aggregate([
          { $match: { status: { $ne: 'cancelled' } } },
          {
            $group: {
              _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
              totalTickets: { $sum: 1 },
              revenue: { $sum: '$price' },
            },
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 },
        ]),
      ]);

      const purchasingUsers =
        purchasingUsersAgg.length > 0 ? purchasingUsersAgg[0].totalPurchasingUsers : 0;
      let mostSoldTicket = 'None yet';
      if (mostSoldAgg.length > 0) {
        const top = mostSoldAgg[0];
        const typeCap = top._id.type
          ? top._id.type.charAt(0).toUpperCase() + top._id.type.slice(1)
          : 'Unknown';
        mostSoldTicket = `${typeCap} (${top._id.plan || 'unknown'})`;
      }
      io.emit('totalTicketsUpdate', { totalTicketsSold, purchasingUsers, mostSoldTicket });

      const formattedSales = salesAgg
        .map((s) => ({
          month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
            month: 'short',
            year: 'numeric',
          }),
          totalTickets: s.totalTickets,
          revenue: s.revenue,
        }))
        .reverse();
      io.emit('monthlySalesUpdate', formattedSales);
    }

    await logAdminAction(req, `Deleted user account: ${userCheck.email}`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

const resetOccupancy = async (req, res) => {
  try {
    const result = await Ticket.updateMany({ status: 'used' }, { $set: { status: 'expired' } });

    await broadcastOccupancy(req);

    await logAdminAction(
      req,
      `Manually reset park occupancy. Archived ${result.modifiedCount} tickets.`
    );
    res.status(200).json({
      message:
        'Park occupancy has been reset successfully. All used tickets are now archived/expired.',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Reset Occupancy Error:', error);
    res.status(500).json({ message: 'Server error while resetting occupancy' });
  }
};

const getHardwareAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.date) {
      const startOfDay = new Date(req.query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(req.query.date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    if (req.query.type && req.query.type !== 'all') {
      query.type = req.query.type;
    }

    // Run fetch and count in parallel, and use .lean()
    const [alerts, total] = await Promise.all([
      HardwareAlert.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HardwareAlert.countDocuments(query),
    ]);

    res.status(200).json({
      alerts,
      totalAlerts: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Fetch Alerts Error:', error);
    res.status(500).json({ message: 'Error fetching hardware alerts' });
  }
};

const unlockScanner = async (req, res) => {
  try {
    failedScans.clear();
    await createHardwareAlert(req, 'Admin manually unlocked the gate scanner.', 'info');
    await logAdminAction(req, 'Manually unlocked the gate scanner.');
    res.status(200).json({ message: 'Scanner unlocked successfully.' });
  } catch (error) {
    console.error('Unlock Scanner Error:', error);
    res.status(500).json({ message: 'Error unlocking scanner' });
  }
};

const getAuditLogs = async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Super Admin access required.' });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminAuditLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAuditLog.countDocuments(),
    ]);

    res.status(200).json({
      logs,
      totalLogs: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Fetch Audit Logs Error:', error);
    res.status(500).json({ message: 'Error fetching audit logs' });
  }
};

const getBannedIPs = async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Super Admin access required.' });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { ipAddress: { $regex: req.query.search, $options: 'i' } },
        { reason: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [bannedIPs, total] = await Promise.all([
      BannedIP.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BannedIP.countDocuments(query),
    ]);

    res.status(200).json({
      bannedIPs,
      totalBannedIPs: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Banned IPs Error:', error);
    res.status(500).json({ message: 'Error fetching banned IPs' });
  }
};

const unbanIP = async (req, res) => {
  try {
    const deleted = await BannedIP.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Banned IP not found' });

    const io = req.app.get('io');
    if (io) io.emit('bannedIpRemoved', req.params.id);

    await logAdminAction(req, `Unbanned IP Address: ${deleted.ipAddress}`);
    res.status(200).json({ message: 'IP unbanned successfully' });
  } catch (error) {
    console.error('Unban IP Error:', error);
    res.status(500).json({ message: 'Error unbanning IP' });
  }
};

const getWhitelistedIPs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { ipAddress: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [ips, total] = await Promise.all([
      WhitelistedIP.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WhitelistedIP.countDocuments(query),
    ]);

    res.status(200).json({
      ips,
      totalIps: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Whitelist Error:', error);
    res.status(500).json({ message: 'Error fetching whitelisted IPs' });
  }
};

const addWhitelistedIP = async (req, res) => {
  try {
    const { ipAddress, description, macAddress } = req.body;
    if (!ipAddress) return res.status(400).json({ message: 'IP Address is required' });

    const exists = await WhitelistedIP.findOne({ ipAddress });
    if (exists) return res.status(400).json({ message: 'IP is already whitelisted' });

    const newIP = await WhitelistedIP.create({ ipAddress, description, macAddress });
    const io = req.app.get('io');
    if (io) io.emit('whitelistIpAdded', newIP);

    await logAdminAction(req, `Whitelisted IP Address: ${ipAddress}`);
    res.status(201).json(newIP);
  } catch (error) {
    console.error('Add Whitelist Error:', error);
    res.status(500).json({ message: 'Error adding to whitelist' });
  }
};

const removeWhitelistedIP = async (req, res) => {
  try {
    const deleted = await WhitelistedIP.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Whitelisted IP not found' });

    // If the removed IP was bound to a sub-admin, we must also delete the sub-admin
    // to prevent orphaning their account, which would make them unable to log in.
    if (deleted.adminEmail) {
      const subAdminUser = await User.findOneAndDelete({
        email: deleted.adminEmail,
        role: 'admin',
      });
      if (subAdminUser) {
        // Also cascade delete their tickets to keep stats accurate
        await Ticket.deleteMany({ userId: subAdminUser._id });
        const io = req.app.get('io');
        if (io) io.emit('subAdminDeleted', subAdminUser._id);
        await logAdminAction(
          req,
          `Deleted sub-admin account (${deleted.adminEmail}) due to IP whitelist removal.`
        );
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('whitelistIpRemoved', req.params.id);

    await logAdminAction(req, `Removed Whitelisted IP: ${deleted.ipAddress}`);
    res.status(200).json({ message: 'IP removed from whitelist' });
  } catch (error) {
    console.error('Remove Whitelist Error:', error);
    res.status(500).json({ message: 'Error removing IP from whitelist' });
  }
};

const getMonthlySales = async (req, res) => {
  try {
    const matchStage = { status: { $ne: 'cancelled' } };

    if (req.query.startDate || req.query.endDate) {
      matchStage.createdAt = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        matchStage.createdAt.$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setMonth(end.getMonth() + 1); // Move to next month
        end.setDate(0); // Roll back 1 day to get the last day of the specified month
        end.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          totalTickets: { $sum: 1 },
          revenue: { $sum: '$price' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ];

    // Only limit to 12 months if no custom date range is provided
    if (!req.query.startDate && !req.query.endDate) {
      pipeline.push({ $limit: 12 });
    }

    const sales = await Ticket.aggregate(pipeline);

    const formattedSales = sales
      .map((s) => ({
        month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        }),
        totalTickets: s.totalTickets,
        revenue: s.revenue,
      }))
      .reverse(); // Reverse for chronological order (left to right) in the chart

    res.status(200).json(formattedSales);
  } catch (error) {
    console.error('Monthly Sales Error:', error);
    res.status(500).json({ message: 'Error fetching monthly sales' });
  }
};

const clearAuditLogs = async (req, res) => {
  try {
    let query = {};
    if (req.query.olderThan) {
      const days = parseInt(req.query.olderThan, 10);
      if (!isNaN(days)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = { createdAt: { $lt: cutoffDate } };
      }
    }

    await AdminAuditLog.deleteMany(query);

    const io = req.app.get('io');
    if (io) {
      io.emit('auditLogsCleared', { partial: !!req.query.olderThan });
    }

    await logAdminAction(
      req,
      `Cleared security audit logs${req.query.olderThan ? ` older than ${req.query.olderThan} days` : ' (All)'}`
    );
    res.status(200).json({ message: 'Audit logs cleared successfully' });
  } catch (error) {
    console.error('Clear Audit Logs Error:', error);
    res.status(500).json({ message: 'Error clearing audit logs' });
  }
};

const clearHardwareAlerts = async (req, res) => {
  try {
    let query = {};
    if (req.query.olderThan) {
      const days = parseInt(req.query.olderThan, 10);
      if (!isNaN(days)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = { createdAt: { $lt: cutoffDate } };
      }
    }

    await HardwareAlert.deleteMany(query);

    const io = req.app.get('io');
    if (io) {
      io.emit('hardwareAlertsCleared', { partial: !!req.query.olderThan });
    }

    await logAdminAction(
      req,
      `Cleared hardware alerts${req.query.olderThan ? ` older than ${req.query.olderThan} days` : ' (All)'}`
    );
    res.status(200).json({ message: 'Hardware alerts cleared successfully' });
  } catch (error) {
    console.error('Clear Hardware Alerts Error:', error);
    res.status(500).json({ message: 'Error clearing hardware alerts' });
  }
};

const createBackup = (req, res) => {
  // Resolve path to the backend/backups folder
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const date = new Date();
  const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
  const archivePath = path.join(backupDir, `smart-park-manual-${timestamp}.gzip`);
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';

  const cmd = `mongodump --uri="${mongoUri}" --archive="${archivePath}" --gzip`;

  exec(cmd, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Manual backup failed: ${error.message}`);

      let errorMessage = 'Backup failed to complete.';
      if (error.message.includes('not recognized') || error.message.includes('ENOENT')) {
        errorMessage = 'The mongodump tool is not installed or not in your system PATH.';
      }
      return res.status(500).json({ message: errorMessage });
    }
    await logAdminAction(
      req,
      `Created manual database backup: smart-park-manual-${timestamp}.gzip`
    );
    res.status(200).json({ message: 'Database backed up successfully!' });
  });
};

const getBackups = (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) return res.json([]);

    const files = fs
      .readdirSync(backupDir)
      .filter((file) => file.endsWith('.gzip'))
      .map((file) => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          filename: file,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          createdAt: stats.ctime,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json(files);
  } catch (error) {
    console.error('Fetch Backups Error:', error);
    res.status(500).json({ message: 'Error fetching backups' });
  }
};

const downloadBackup = (req, res) => {
  try {
    const filename = req.params.filename;
    if (
      !filename ||
      !filename.endsWith('.gzip') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({ message: 'Invalid or unauthorized filename' });
    }
    const filePath = path.join(__dirname, '../backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }
    res.download(filePath);
  } catch (error) {
    console.error('Download Backup Error:', error);
    res.status(500).json({ message: 'Error downloading backup' });
  }
};

const deleteBackup = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (
      !filename ||
      !filename.endsWith('.gzip') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({ message: 'Invalid or unauthorized filename' });
    }
    const filePath = path.join(__dirname, '../backups', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      await logAdminAction(req, `Deleted database backup: ${filename}`);
    }
    res.status(200).json({ message: 'Backup deleted successfully' });
  } catch (error) {
    console.error('Delete Backup Error:', error);
    res.status(500).json({ message: 'Error deleting backup' });
  }
};

// @desc    Generate comprehensive mock data for the system
// @route   POST /api/admin/generate-mock-data
// @access  Private (Super Admin)
const generateMockData = async (req, res) => {
  try {
    // 0. PARAMETERIZED SCALE CONFIGURATION
    const dailyCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
    
    const SCALE = {
      multiplier: 1.0,           // Adjust this to scale everything (e.g., 2.0 doubles volume)
      baseUserCount: Math.floor(dailyCapacity * 0.4), // Scale users relative to capacity
      adminCount: 10,            // Number of sub-admins
      historicalMonths: 12,      // How many months back to spread history
      ticketsPerMonth: Math.floor(dailyCapacity * 0.12), // Historical volume
      ticketsPerDayWeek: Math.floor(dailyCapacity * 0.35), // Scale current week volume to ~35% of capacity
      occupancyRate: 0.8,        // 80% of today's tickets will be 'used' (Occupancy)
      alertCount: 40,            // Hardware alerts
      auditCount: 60,            // Security audit logs
    };

    const targetUserCount = Math.floor(SCALE.baseUserCount * SCALE.multiplier);
    const targetHistoryTickets = Math.floor(SCALE.ticketsPerMonth * SCALE.historicalMonths * SCALE.multiplier);
    const targetWeekTickets = Math.floor(SCALE.ticketsPerDayWeek * 7 * SCALE.multiplier);

    console.log(`[MockDataHammer] Starting scaled seeding (${SCALE.multiplier}x)...`);

    // 1. CLEAR SLATE (Only for mock data to avoid destroying real data)
    try {
      await User.deleteMany({ email: /mockuser.*@example\.com/ });
      await Ticket.deleteMany({
        userId: { $nin: await User.find({ email: { $not: /mockuser.*@example\.com/ } }).select('_id') },
      });
      await HardwareAlert.deleteMany({ message: /Simulation alert/ });
      await AdminAuditLog.deleteMany({ email: /mockuser.*@example\.com/ });
      await BannedIP.deleteMany({ reason: /Simulation/ });
      await WhitelistedIP.deleteMany({ description: /Simulation/ });
      await PromoCode.deleteMany({ code: /MOCK/ });

      console.log('[MockDataHammer] Step 1: Cleared existing simulation data.');
    } catch (e) {
      console.error('[MockDataHammer] FAILED Step 1 (Clear):', e.message);
    }

    // 2. GENERATE USERS
    const names = [
      'James Smith', 'Maria Garcia', 'Robert Johnson', 'Maria Rodriguez', 'David Smith',
      'Mary Smith', 'Maria Hernandez', 'Maria Martinez', 'James Johnson', 'Robert Smith',
      'Michael Smith', 'Maria Lopez', 'David Johnson', 'Mary Johnson', 'William Smith',
      'Maria Gonzalez', 'Michael Johnson', 'James Williams', 'Mary Garcia', 'Maria Perez',
    ];
    const hashedPassword = await bcrypt.hash('password123', 12);

    const userDocs = [];
    const totalUsersToCreate = targetUserCount + SCALE.adminCount;
    for (let i = 0; i < totalUsersToCreate; i++) {
      const isLastFew = i >= targetUserCount;
      userDocs.push({
        name: names[i % names.length] + ' ' + (i + 1),
        email: `mockuser${i + 1}@example.com`,
        phone: `01${Math.floor(Math.random() * 900000000 + 100000000)}`,
        password: hashedPassword,
        age: Math.floor(Math.random() * 60 + 18),
        role: isLastFew ? 'admin' : 'user',
        isBlocked: !isLastFew && Math.random() > 0.95,
        hasDisability: Math.random() > 0.9,
      });
    }

    const savedUsers = await User.insertMany(userDocs);
    const regularUsers = savedUsers.filter((u) => u.role === 'user');
    const adminUsers = savedUsers.filter((u) => u.role === 'admin');
    console.log(`[MockDataHammer] Step 2: Created ${savedUsers.length} users.`);

    // 3. GENERATE TICKETS
    const ticketTypes = ['child', 'adult', 'senior'];
    const plans = ['one-time', 'monthly'];
    const ticketStatuses = ['active', 'used', 'expired', 'cancelled'];
    const ticketPrices = { child: 100, adult: 200, senior: 150 };

    const ticketDocs = [];
    const now = new Date();

    // Task A: Historical Spread
    for (let m = 0; m < SCALE.historicalMonths; m++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 15);
      const ticketsInMonth = Math.floor(SCALE.ticketsPerMonth * SCALE.multiplier);

      for (let t = 0; t < ticketsInMonth; t++) {
        const user = regularUsers[Math.floor(Math.random() * regularUsers.length)];
        const plan = plans[Math.floor(Math.random() * plans.length)];
        const status = ticketStatuses[Math.floor(Math.random() * ticketStatuses.length)];
        const type = ticketTypes[Math.floor(Math.random() * ticketTypes.length)];

        let validFrom = new Date(monthDate);
        validFrom.setDate(Math.floor(Math.random() * 28) + 1);
        let validUntil = new Date(validFrom);

        if (plan === 'monthly') {
          validUntil.setDate(validFrom.getDate() + 30);
        } else {
          validUntil.setHours(23, 59, 59, 999);
        }

        ticketDocs.push({
          userId: user._id,
          ticketType: type,
          subscriptionPlan: plan,
          price: ticketPrices[type] + (plan === 'monthly' ? 1000 : 0),
          status: status,
          validFrom,
          validUntil,
          createdAt: new Date(validFrom),
          updatedAt: new Date(validFrom), // Logical historical timestamps
        });
      }
    }

    // Task B: Current Week Cluster (High Volume)
    for (let d = 0; d < 7; d++) {
      const ticketsInDay = Math.floor(SCALE.ticketsPerDayWeek * SCALE.multiplier);
      
      for (let i = 0; i < ticketsInDay; i++) {
        const user = regularUsers[Math.floor(Math.random() * regularUsers.length)];
        const type = ticketTypes[Math.floor(Math.random() * ticketTypes.length)];
        
        const validFrom = new Date();
        validFrom.setDate(validFrom.getDate() + d);
        validFrom.setHours(0, 0, 0, 0);
        
        const validUntil = new Date(validFrom);
        validUntil.setHours(23, 59, 59, 999);

        // Logical occupancy for today vs future
        let currentStatus = 'active';
        if (d === 0) {
          // Today: Apply high occupancy rate to simulate "busy" dashboard
          if (Math.random() < SCALE.occupancyRate) {
            currentStatus = 'used'; 
          }
        } else {
          // Future: Some may already be cancelled or used (if simulated scan history existed)
          if (Math.random() > 0.9) currentStatus = 'cancelled';
        }

        ticketDocs.push({
          userId: user._id,
          ticketType: type,
          subscriptionPlan: 'one-time',
          price: ticketPrices[type],
          status: currentStatus,
          validFrom,
          validUntil,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const savedTickets = await Ticket.insertMany(ticketDocs, { timestamps: false });
    console.log(`[MockDataHammer] Step 3: Created ${savedTickets.length} tickets total.`);

    // 4. GENERATE HARDWARE ALERTS
    const alertTemplates = [
      { message: 'Simulation alert: Zone C moisture drop', type: 'warning' },
      { message: 'Simulation alert: West Gate deployment', type: 'info' },
      { message: 'Simulation alert: Smart Bin full', type: 'warning' },
      { message: 'Simulation alert: Irrigation complete', type: 'success' },
      { message: 'Simulation alert: Critical hardware error', type: 'error' },
    ];
    const alertDocs = [];
    const totalAlerts = Math.floor(SCALE.alertCount * SCALE.multiplier);
    for (let l = 0; l < totalAlerts; l++) {
      const tpl = alertTemplates[l % alertTemplates.length];
      alertDocs.push({
        message: tpl.message + ' #' + (l + 1),
        type: tpl.type,
        timeString: new Date().toLocaleTimeString(),
      });
    }
    await HardwareAlert.insertMany(alertDocs);
    console.log(`[MockDataHammer] Step 4: Created ${alertDocs.length} hardware alerts.`);

    // 5. GENERATE ADMIN AUDIT LOGS
    const auditDocs = [];
    const actions = [
      'Scanned ticket',
      'Blocked user',
      'Created sub-admin',
      'Cleared occupancy',
      'Downloaded backup',
      'Updated system settings',
    ];
    const totalAudits = Math.floor(SCALE.auditCount * SCALE.multiplier);
    for (let a = 0; a < totalAudits; a++) {
      const admin = adminUsers[Math.floor(Math.random() * adminUsers.length)];
      auditDocs.push({
        email: admin?.email || 'system@smartpark.com',
        ipAddress: `192.168.1.${100 + (a % 150)}`,
        status: Math.random() > 0.1 ? 'success' : 'failed',
        statusCode: Math.random() > 0.1 ? 200 : 403,
        action: actions[Math.floor(Math.random() * actions.length)],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: new Date(now.getTime() - Math.random() * 1000000000),
      });
    }
    await AdminAuditLog.insertMany(auditDocs);
    console.log(`[MockDataHammer] Step 5: Created ${auditDocs.length} audit logs.`);

    // 6. GENERATE BANNED & WHITELISTED IPS
    const bannedDocs = [];
    const whitelistDocs = [];
    for (let i = 0; i < 15; i++) {
      bannedDocs.push({
        ipAddress: `10.0.0.${10 + i}`,
        reason: 'Simulation: Brute force attempt',
      });
      whitelistDocs.push({
        ipAddress: `172.16.0.${50 + i}`,
        description: 'Simulation: Remote Office IP',
        macAddress: `00:1A:2B:3C:4D:${i.toString(16).padStart(2, '0')}`,
      });
    }
    await BannedIP.insertMany(bannedDocs);
    await WhitelistedIP.insertMany(whitelistDocs);
    console.log('[MockDataHammer] Step 6: Created banned and whitelisted IPs.');

    // 7. Trigger Global Refresh
    const io = req.app.get('io');
    if (io) io.emit('dataRefresh');

    res.status(200).json({
      message: `Scalable simulation seeding complete! (${SCALE.multiplier}x)
      - Users: ${savedUsers.length}
      - Tickets: ${savedTickets.length} (History + 7-Day Cluster)
      - Hardware Alerts: ${alertDocs.length}
      - Audit Logs: ${auditDocs.length}
      - IP Security: ${bannedDocs.length} Banned / ${whitelistDocs.length} Whitelisted`,
    });
  } catch (error) {
    console.error('[MockDataHammer] CRITICAL ERROR:', error.message);
    res.status(500).json({ message: 'Failed to generate mock data', error: error.message });
  }
};

module.exports = {
  getAdminStats,
  scanTicket,
  getUsers,
  toggleBlockUser,
  createSubAdmin,
  deleteUser,
  resetOccupancy,
  getHardwareAlerts,
  unlockScanner,
  getAuditLogs,
  getBannedIPs,
  unbanIP,
  getWhitelistedIPs,
  addWhitelistedIP,
  removeWhitelistedIP,
  getMonthlySales,
  clearAuditLogs,
  clearHardwareAlerts,
  createBackup,
  getBackups,
  downloadBackup,
  deleteBackup,
  getUserTickets,
  scanUserTicket,
  generateMockData,
};
