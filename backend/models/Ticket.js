const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ticketType: {
      type: String,
      enum: ['child', 'adult', 'senior'],
      required: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ['one-time', 'monthly'],
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'used', 'expired', 'cancelled'],
      default: 'active',
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    scanHistory: [
      {
        type: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Performance Indexes for Admin Aggregations and Capacity Checks
ticketSchema.index({ validFrom: 1, subscriptionPlan: 1, status: 1 });
ticketSchema.index({ status: 1, updatedAt: 1 });
ticketSchema.index({ ticketType: 1, subscriptionPlan: 1 });

// Query function to count tickets grouped by date for the current week window
ticketSchema.statics.countTicketsByDateRange = async function (from, to) {
  const startOfDay = new Date(from);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(to);
  endOfDay.setHours(23, 59, 59, 999);

  const tickets = await this.aggregate([
    {
      $match: {
        validFrom: { $gte: startOfDay, $lte: endOfDay },
        subscriptionPlan: 'one-time',
        status: { $in: ['active', 'used'] },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$validFrom' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Create a map for easy lookup
  const ticketCountMap = {};
  tickets.forEach((t) => {
    ticketCountMap[t._id] = t.count;
  });

  return ticketCountMap;
};

const Ticket = mongoose.model('Ticket', ticketSchema);

// LIVE DATABASE SYNC: Emit WebSocket events whenever tickets are created or updated
// We use a dynamic require to avoid circular dependencies with server.js
const broadcastTicket = (ticket) => {
  try {
    const { io } = require('../server');
    if (io) {
      // 1. Update the specific user's ticket room
      io.to(`user-${ticket.userId}-tickets`).emit('newTicketsPurchased', {
        userId: ticket.userId,
        tickets: [ticket],
      });

      // 2. Notify main dashboard to update counts
      io.emit('userTicketCountUpdate', {
        userId: ticket.userId,
        addedCount: 1,
      });
    }
  } catch (err) {
    // console.log('Socket broadcast skipped during initialization');
  }
};

ticketSchema.post('save', (doc) => {
  broadcastTicket(doc);
});

ticketSchema.post('insertMany', (docs) => {
  docs.forEach((doc) => broadcastTicket(doc));
});

module.exports = Ticket;
