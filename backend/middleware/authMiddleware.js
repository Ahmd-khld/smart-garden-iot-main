const User = require('../models/User');

// Middleware to protect routes, checking for a valid session
const protect = async (req, res, next) => {
  // We assume the user ID is stored in the session upon login
  if (req.session && req.session.userId) {
    try {
      // Add user from session to request object
      req.user = await User.findById(req.session.userId).select('-password');
      if (req.user) {
        next();
      } else {
        res.status(401);
        return next(new Error('Not authorized, user not found'));
      }
    } catch (error) {
      res.status(401);
      return next(new Error('Not authorized, token failed'));
    }
  } else {
    res.status(401);
    return next(new Error('Not authorized, no session'));
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