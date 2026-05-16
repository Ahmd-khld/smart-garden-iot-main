const express = require('express');
const router = express.Router();
const { validatePromoCode } = require('../controllers/promoController');
const { protect } = require('../middleware/authMiddleware');

router.post('/validate', protect, validatePromoCode);

module.exports = router;
