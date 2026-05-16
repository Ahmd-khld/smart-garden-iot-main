const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    ticketType: {
        type: String,
        enum: ['child', 'adult', 'senior'],
        required: true
    },
    subscriptionPlan: {
        type: String,
        enum: ['one-time', 'monthly'],
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'used', 'expired', 'cancelled'],
        default: 'active'
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Performance Indexes for Admin Aggregations and Capacity Checks
ticketSchema.index({ validFrom: 1, subscriptionPlan: 1, status: 1 });
ticketSchema.index({ status: 1, updatedAt: 1 });
ticketSchema.index({ ticketType: 1, subscriptionPlan: 1 });

// Query function to count tickets grouped by date for the current week window
ticketSchema.statics.countTicketsByDateRange = async function(from, to) {
    const startOfDay = new Date(from);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);

    const tickets = await this.aggregate([
        {
            $match: {
                validFrom: { $gte: startOfDay, $lte: endOfDay },
                subscriptionPlan: 'one-time',
                status: { $in: ['active', 'used'] }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$validFrom' }
                },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { _id: 1 }
        }
    ]);

    // Create a map for easy lookup
    const ticketCountMap = {};
    tickets.forEach(t => {
        ticketCountMap[t._id] = t.count;
    });

    return ticketCountMap;
};

const Ticket = mongoose.model('Ticket', ticketSchema);
module.exports = Ticket;
