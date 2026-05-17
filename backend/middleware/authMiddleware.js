const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to protect routes, checking for a valid session via JWT
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401);
      return next(new Error('Not authorized, missing or invalid token'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id || decoded._id || decoded.userId).select(
      '-password'
    );

    if (user) {
      req.user = user;
      next();
    } else {
      res.status(401);
      return next(new Error('Not authorized, user not found'));
    }
  } catch (error) {
    res.status(401);
    return next(new Error('Not authorized, token failed'));
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
