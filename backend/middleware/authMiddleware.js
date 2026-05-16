const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to protect routes, checking for a valid token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (req.user) {
        next();
      } else {
        res.status(401).json({ error: 'Not authorized, user not found' });
      }
    } catch (error) {
      res.status(401).json({ error: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ error: 'Not authorized, no token' });
  }
};

// Middleware to check for admin role
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).send('Not authorized as an admin');
  }
};

module.exports = { protect, admin };