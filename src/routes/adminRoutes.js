const { Router } = require('express');
const { getDashboardStats, getUsersList, createUser, getUserDetails, adminUnenrollUserFromWorkshop } = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');

const router = Router();

// Admin-only stats endpoint
router.get('/stats', auth.requireAdmin, getDashboardStats);
router.get('/users', auth.requireAdmin, getUsersList);
router.post('/users', auth.requireAdmin, createUser);
// User details and admin-side enrollment management
router.get('/users/:id', auth.requireAdmin, getUserDetails);
router.delete('/users/:id/workshops/:workshopId', auth.requireAdmin, adminUnenrollUserFromWorkshop);

module.exports = router;
