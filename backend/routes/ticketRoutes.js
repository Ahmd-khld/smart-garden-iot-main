const express = require('express');
const router = express.Router();
const { checkout, getTicketHistory, getTicketInsights } = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

router.post('/checkout', protect, checkout);
router.get('/history', protect, getTicketHistory);
router.get('/insights', getTicketInsights);

module.exports = router;
