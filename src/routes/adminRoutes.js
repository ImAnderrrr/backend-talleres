const { Router } = require('express');
const { getDashboardStats } = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');

const router = Router();

// Admin-only stats endpoint
router.get('/stats', auth.requireAdmin, getDashboardStats);

module.exports = router;
