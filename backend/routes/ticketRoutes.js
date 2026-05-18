const express = require('express');
const router = express.Router();
const {
  checkout,
  getTicketHistory,
  getTicketInsights,
  cancelTicket,
  rescheduleTicket,
} = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

router.post('/checkout', protect, checkout);
router.get('/history', protect, getTicketHistory);
router.get('/insights', getTicketInsights);
router.patch('/:id/cancel', protect, cancelTicket);
router.put('/:id/reschedule', protect, rescheduleTicket);

module.exports = router;
