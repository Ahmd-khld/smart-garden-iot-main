const crypto = require('crypto');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const Ticket = require('../models/Ticket');
const PromoCode = require('../models/PromoCode');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const IV_LENGTH = 16;
const DAILY_CAPACITY = parseInt(process.env.DAILY_CAPACITY) || 200;

const isDateValidForBooking = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  const bookingWindow = parseInt(process.env.BOOKING_WINDOW_DAYS) || 30;
  maxDate.setDate(maxDate.getDate() + bookingWindow); // Booking window from env

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate >= today && checkDate <= maxDate;
};

const getCrowdLevel = (count) => {
  const percentage = (count / DAILY_CAPACITY) * 100;
  if (percentage <= 30) return 'quiet';
  if (percentage <= 70) return 'moderate';
  return 'busy';
};

const encryptCard = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

const savePaymentCardIfRequested = async ({
  user,
  cardNumber,
  expiry,
  saveCard,
  useSavedCard,
  savedCardId,
}) => {
  if (!user.savedCards) {
    user.savedCards = [];
  }

  if (useSavedCard) {
    const hasSavedCard = user.savedCards.some((card) => card._id.toString() === savedCardId);

    if (!hasSavedCard) {
      return { status: 'failed', message: 'Selected saved card was not found' };
    }

    return { status: 'used_saved_card' };
  }

  if (!saveCard || !cardNumber) {
    return { status: 'not_saved' };
  }

  const sanitizedCardNumber = String(cardNumber).replace(/\D/g, '');
  if (sanitizedCardNumber.length !== 16) {
    return { status: 'failed', message: 'Card number must be 16 digits' };
  }

  const last4Digits = sanitizedCardNumber.slice(-4);
  const alreadySaved = user.savedCards.some((card) => card.last4Digits === last4Digits);
  if (alreadySaved) {
    return { status: 'already_saved', last4Digits };
  }

  user.savedCards.push({
    last4Digits,
    encryptedData: encryptCard(
      JSON.stringify({
        cardNumber: sanitizedCardNumber,
        expiry,
      })
    ),
  });

  await user.save();
  return { status: 'saved', last4Digits };
};

const buildEmailTicketHtml = ({ user, tickets, selectedDate, subscriptionPlan }) => {
  const ticketList = tickets
    .map(
      (ticket) => `
            <li>
                <strong>${ticket.ticketType.toUpperCase()} Ticket</strong><br/>
                Ticket ID: ${ticket._id}<br/>
                Price: ${ticket.price} EGP
            </li>
        `
    )
    .join('');

  const validity =
    subscriptionPlan === 'monthly'
      ? 'Valid for 30 days from today.'
      : `Valid only on ${new Date(selectedDate).toLocaleDateString()}.`;

  return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Smart Park Ticket Confirmation</h2>
            <p>Hello ${user.name},</p>
            <p>Thank you for booking your ticket.</p>
            <p>Your QR code ticket image is attached to this email.</p>

            <h3>Your Tickets:</h3>
            <ul>
                ${ticketList}
            </ul>

            <p><strong>Validity:</strong> ${validity}</p>
            <p>Please show the attached QR code at the entrance.</p>
        </div>
    `;
};

const sendTicketsViaEmail = async ({ user, tickets, selectedDate, subscriptionPlan }) => {
  if (!tickets.length) {
    return { status: 'skipped', reason: 'No tickets were created' };
  }

  if (!user.email) {
    return { status: 'skipped', reason: 'User has no email address' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return { status: 'skipped', reason: 'Email credentials are not configured' };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const attachments = [];

  for (const ticket of tickets) {
    const qrData = JSON.stringify({
      ticketId: ticket._id.toString(),
      userId: user._id.toString(),
      ticketType: ticket.ticketType,
      subscriptionPlan: ticket.subscriptionPlan,
      validFrom: ticket.validFrom,
      validUntil: ticket.validUntil,
    });

    const qrImage = await QRCode.toBuffer(qrData);

    attachments.push({
      filename: `smart-park-ticket-${ticket._id}.png`,
      content: qrImage,
      contentType: 'image/png',
    });
  }

  console.log(
    `Attempting to send ticket email to ${user.email} with ${attachments.length} attachments...`
  );

  const info = await transporter.sendMail({
    from: `"Smart Park" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: 'Your Smart Park Ticket QR Code',
    html: buildEmailTicketHtml({ user, tickets, selectedDate, subscriptionPlan }),
    attachments,
  });

  console.log(`Email successfully sent to ${user.email}. MessageID: ${info.messageId}`);

  return {
    status: 'sent',
    messageId: info.messageId,
    to: user.email,
  };
};

const checkout = async (req, res) => {
  try {
    if (!req.body.quantities || !req.body.subscriptionPlan) {
      return res.status(400).json({ message: 'Missing quantities or subscription plan' });
    }

    const {
      quantities,
      selectedDate,
      subscriptionPlan,
      cardNumber,
      expiry,
      saveCard,
      useSavedCard,
      savedCardId,
      promoCode,
    } = req.body;

    let requestedCount = 0;
    const validTypes = ['child', 'adult', 'senior'];
    for (const [type, rawCount] of Object.entries(quantities)) {
      if (validTypes.includes(type)) {
        requestedCount += Number(rawCount) || 0;
      }
    }

    if (subscriptionPlan === 'one-time') {
      if (!selectedDate) {
        return res.status(400).json({ message: 'Selected date is required for one-time tickets' });
      }

      if (!isDateValidForBooking(selectedDate)) {
        return res.status(400).json({
          message: 'Date must be today or within the next 30 days',
        });
      }

      const selectedDateStr = new Date(selectedDate).toISOString().split('T')[0];
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Run capacity check and user ticket limit check concurrently
      const [ticketCountMap, userTicketsForDate] = await Promise.all([
        Ticket.countTicketsByDateRange(dayStart.getTime(), dayEnd.getTime()),
        Ticket.countDocuments({
          userId: req.user._id,
          validFrom: { $gte: dayStart, $lte: dayEnd },
          subscriptionPlan: 'one-time',
          status: { $in: ['active', 'used'] },
        }),
      ]);

      const currentCount = ticketCountMap[selectedDateStr] || 0;

      if (currentCount + requestedCount > DAILY_CAPACITY) {
        return res.status(400).json({
          message: `This date does not have enough capacity for ${requestedCount} tickets. Only ${Math.max(0, DAILY_CAPACITY - currentCount)} left.`,
          date: selectedDateStr,
          currentCount,
          capacity: DAILY_CAPACITY,
        });
      }

      const maxTicketsPerTransaction = parseInt(process.env.MAX_TICKETS_PER_TRANSACTION) || 200;
      if (userTicketsForDate + requestedCount > maxTicketsPerTransaction) {
        return res.status(400).json({
          message: `You can only buy a maximum of ${maxTicketsPerTransaction} tickets per day. You already have ${userTicketsForDate} ticket(s) for this date.`,
        });
      }
    } else if (subscriptionPlan === 'monthly') {
      const maxTicketsPerTransaction = parseInt(process.env.MAX_TICKETS_PER_TRANSACTION) || 200;
      if (requestedCount > maxTicketsPerTransaction) {
        return res.status(400).json({
          message: `You can only buy a maximum of ${maxTicketsPerTransaction} tickets per transaction.`,
        });
      }
    }

    const newTickets = [];
    const prices = {
      child:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_CHILD_MONTHLY) || 1500
          : parseInt(process.env.TICKET_PRICE_CHILD_DAILY) || 100,
      adult:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_ADULT_MONTHLY) || 3000
          : parseInt(process.env.TICKET_PRICE_ADULT_DAILY) || 200,
      senior:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_SENIOR_MONTHLY) || 2000
          : parseInt(process.env.TICKET_PRICE_SENIOR_DAILY) || 150,
    };

    for (const [type, rawCount] of Object.entries(quantities)) {
      const count = Number(rawCount);
      if (!prices[type] || count <= 0) {
        continue;
      }

      for (let i = 0; i < count; i += 1) {
        let validFrom = new Date();
        let validUntil = new Date();

        if (subscriptionPlan === 'monthly') {
          validUntil.setDate(validUntil.getDate() + 30);
        } else {
          validFrom = new Date(selectedDate);
          validFrom.setHours(0, 0, 0, 0);
          validUntil = new Date(selectedDate);
          validUntil.setHours(23, 59, 59, 999);
        }

        newTickets.push({
          userId: req.user._id,
          ticketType: type,
          price: prices[type],
          subscriptionPlan,
          validFrom,
          validUntil,
          status: 'active',
        });
      }
    }

    if (!newTickets.length) {
      return res.status(400).json({ message: 'Please select at least one ticket to checkout' });
    }

    const cardResult = await savePaymentCardIfRequested({
      user: req.user,
      cardNumber,
      expiry,
      saveCard,
      useSavedCard,
      savedCardId,
    });

    if (cardResult.status === 'failed') {
      return res.status(400).json({ message: cardResult.message });
    }

    const savedTickets = await Ticket.insertMany(newTickets);

    const io = req.app.get('io');
    if (io) {
      const [totalTicketsSold, purchasingUsersAgg, salesAgg, mostSoldAgg] = await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
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
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
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

    let emailResult = { status: 'skipped', reason: 'Not attempted' };

    try {
      emailResult = await sendTicketsViaEmail({
        user: req.user,
        tickets: savedTickets,
        selectedDate,
        subscriptionPlan,
      });
      console.log('Email ticket result:', emailResult);
    } catch (emailError) {
      emailResult = {
        status: 'failed',
        message: emailError.message,
      };
      console.error('Email Delivery Error:', emailError);
    }

    return res.status(200).json({
      message: 'Checkout successful. Ticket QR code sent to email.',
      tickets: savedTickets,
      email: emailResult,
      card: cardResult,
    });
  } catch (error) {
    console.error('Checkout Error:', error);
    return res.status(500).json({ message: 'Server error during checkout' });
  }
};

const getTicketHistory = async (req, res) => {
  try {
    // Use .lean() for faster JSON transformation on read-only queries
    const tickets = await Ticket.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTicketInsights = async (req, res) => {
  try {
    let weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);

    if (req.query.startDate) {
      const parsed = new Date(req.query.startDate);
      if (!isNaN(parsed.getTime())) {
        weekStart = parsed;
        weekStart.setHours(0, 0, 0, 0);
      }
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const ticketCountMap = await Ticket.countTicketsByDateRange(
      weekStart.getTime(),
      weekEnd.getTime()
    );
    const days = [];

    for (let i = 0; i < 7; i += 1) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = ticketCountMap[dateStr] || 0;

      days.push({
        date: dateStr,
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        displayDate: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count,
        crowdLevel: getCrowdLevel(count),
        isToday: currentDate.toDateString() === new Date().toDateString(),
      });
    }

    res.json({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      days,
      capacity: DAILY_CAPACITY,
    });
  } catch (error) {
    console.error('Ticket Insights Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const cancelTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, userId: req.user._id });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({ message: 'Only active tickets can be cancelled.' });
    }

    const now = new Date();
    if (ticket.validUntil && now > ticket.validUntil) {
      ticket.status = 'expired';
      await ticket.save();
      return res.status(400).json({ message: 'Ticket has already expired.' });
    }

    ticket.status = 'cancelled';
    await ticket.save();

    const io = req.app.get('io');
    if (io) {
      const salesAgg = await Ticket.aggregate([
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
      ]);
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
      io.emit('dataRefresh');
    }

    res.json({ message: 'Ticket cancelled successfully. Refund initiated.' });
  } catch (error) {
    console.error('Cancel Ticket Error:', error);
    res.status(500).json({ message: 'Server error cancelling ticket' });
  }
};

module.exports = { checkout, getTicketHistory, getTicketInsights, cancelTicket };
