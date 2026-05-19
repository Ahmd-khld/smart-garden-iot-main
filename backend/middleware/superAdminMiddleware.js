const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');

// Simple middleware to protect admin routes
const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id || decoded._id || decoded.userId);

    // Allow both 'admin' and 'sub-admin' roles to pass this check
    if (!user || (user.role !== 'admin' && user.role !== 'sub-admin')) {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
  }
};

// Middleware to protect super-admin exclusive routes
const requireSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id || decoded._id || decoded.userId);

    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
    if (!user || user.role !== 'admin' || user.email.toLowerCase() !== superAdminEmail) {
      // If a legitimate sub-admin tries to access a super-admin route, log the attempt
      if (user && user.role === 'admin') {
        try {
          const clientIp = req.ip || 'unknown-client';
          const log = await AdminAuditLog.create({
            email: user.email,
            ipAddress: clientIp,
            status: 'failed',
            statusCode: 403,
            action: 'Blocked: Unauthorized Super-Admin Route Access',
            userAgent: req.get('User-Agent') || 'Unknown',
          });
          const io = req.app.get('io');
          if (io) io.emit('auditLogUpdate', log);
        } catch (err) {
          console.error('Audit Log Error:', err);
        }
      }
      return res.status(403).json({ message: 'Forbidden: Super-Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
  }
};

module.exports = { requireAdmin, requireSuperAdmin };
