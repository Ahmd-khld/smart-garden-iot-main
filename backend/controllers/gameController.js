const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const crypto = require('crypto');

// @desc    Get current game status for the user
// @route   GET /api/game/status
const getGameStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Check if we need to reset trials for a new month/year
        if (user.gameStats.lastPlayedMonth !== currentMonth || user.gameStats.lastPlayedYear !== currentYear) {
            user.gameStats.trialsUsed = 0;
            user.gameStats.hasWon = false;
            user.gameStats.lastPlayedMonth = currentMonth;
            user.gameStats.lastPlayedYear = currentYear;
            await user.save();
        }

        res.json({
            trialsUsed: user.gameStats.trialsUsed,
            hasWon: user.gameStats.hasWon,
            canPlay: user.gameStats.trialsUsed < 3 && !user.gameStats.hasWon
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching game status', error: error.message });
    }
};

// @desc    Handle game win and generate promo code
// @route   POST /api/game/win
const handleGameWin = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { score } = req.body;
        
        if (user.gameStats.hasWon) {
            return res.status(400).json({ message: 'User has already won a promo code this month' });
        }

        if (user.gameStats.trialsUsed >= 3) {
            return res.status(400).json({ message: 'No trials left for this month' });
        }

        // Increment trials and set win status
        user.gameStats.trialsUsed += 1;
        user.gameStats.hasWon = true;
        if (score !== undefined) {
            user.gameStats.topScore = Math.max(user.gameStats.topScore || 0, score);
        }
        await user.save();

        // Generate 8-char unique code: SMART-XXXX
        const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
        const code = `SMART-${randomSuffix}`;

        // Save Promo Code
        const newPromo = new PromoCode({
            code,
            userId: user._id,
            discount: 10
        });
        await newPromo.save();

        res.json({
            code,
            message: 'Congratulations! You won a promo code.',
            trialsUsed: user.gameStats.trialsUsed
        });
    } catch (error) {
        res.status(500).json({ message: 'Error handling game win', error: error.message });
    }
};

// @desc    Handle game lose
// @route   POST /api/game/lose
const handleGameLose = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { score } = req.body;
        
        if (user.gameStats.trialsUsed >= 3) {
            return res.status(400).json({ message: 'No trials left for this month' });
        }

        user.gameStats.trialsUsed += 1;
        if (score !== undefined) {
            user.gameStats.topScore = Math.max(user.gameStats.topScore || 0, score);
        }
        await user.save();

        res.json({
            message: 'Game over. Trial recorded.',
            trialsUsed: user.gameStats.trialsUsed
        });
    } catch (error) {
        res.status(500).json({ message: 'Error handling game lose', error: error.message });
    }
};

// @desc    Get top 10 players leaderboard
// @route   GET /api/game/leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const topUsers = await User.find({ 'gameStats.topScore': { $exists: true, $gt: 0 } })
            .sort({ 'gameStats.topScore': -1 })
            .limit(10)
            .select('name gameStats.topScore')
            .lean();
        res.json(topUsers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching leaderboard', error: error.message });
    }
};

module.exports = {
    getGameStatus,
    handleGameWin,
    handleGameLose,
    getLeaderboard
};
