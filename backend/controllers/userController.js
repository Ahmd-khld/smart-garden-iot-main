const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const Ticket = require('../models/Ticket');

const getUserProfile = async (req, res) => {
  try {
    // Use .lean() for faster JSON transformation on read-only queries
    const user = await User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      hasDisability: user.hasDisability,
      role: user.role,
      savedCards: user.savedCards,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.phone = req.body.phone || user.phone;
      if (req.body.hasDisability !== undefined) {
        user.hasDisability = req.body.hasDisability;
      }

      const updatedUser = await user.save();

      const io = req.app.get('io');
      if (io) {
        io.emit('userUpdated', {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          hasDisability: updatedUser.hasDisability,
        });
      }

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        hasDisability: updatedUser.hasDisability,
        message: 'Profile updated successfully',
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'This email address is already in use by another account.',
      });
    }
    res.status(500).json({ message: error.message });
  }
};

const deleteSavedCard = async (req, res) => {
  try {
    // Use an atomic database operation ($pull) instead of loading and saving the whole document
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedCards: { _id: req.params.cardId } } },
      { new: true } // Returns the updated document
    )
      .select('savedCards')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Card removed successfully', savedCards: user.savedCards });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }

    // Create reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000;

    await user.save();

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    const mailOptions = {
      from: `"Smart Park" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #0B4228;">Smart Park Password Reset</h2>
                    <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
                    <p>Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #80C241; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
                </div>
            `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Password reset link sent to email' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired' });
    }

    // Set new password
    user.password = password; // Hashing is handled by the User model's pre-save middleware
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUserProfile = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.user._id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });

    // Cascade delete user tickets to accurately update park stats
    await Ticket.deleteMany({ userId: req.user._id });

    const io = req.app.get('io');
    if (io) {
      io.emit('userDeleted', req.user._id.toString());

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

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  deleteSavedCard,
  forgotPassword,
  resetPassword,
  deleteUserProfile,
};
