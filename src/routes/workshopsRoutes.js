const express = require('express')
const router = express.Router()
const workshopsController = require('../controllers/workshopsController')
const authMiddleware = require('../middleware/authMiddleware')
const enrollmentsController = require('../controllers/enrollmentsController')

// Public: list and get
router.get('/', workshopsController.listWorkshops)
router.get('/:id', workshopsController.getWorkshopById)

// Auth: my enrollments summary (to let frontend know remaining slots)
router.get('/enrollments/me/summary', authMiddleware, enrollmentsController.listMyEnrollmentsSummary)

// Admin: create, update, delete
router.post('/', authMiddleware.requireAdmin, workshopsController.createWorkshop)
router.put('/:id', authMiddleware.requireAdmin, workshopsController.updateWorkshop)
router.delete('/:id', authMiddleware.requireAdmin, workshopsController.deleteWorkshop)

// Enrollment endpoints (simple auth uses the middleware function itself)
router.post('/:id/enroll', authMiddleware, enrollmentsController.enrollInWorkshop)
router.get('/:id/enrollment', authMiddleware, enrollmentsController.getMyEnrollment)
router.get('/:id/enrollments', authMiddleware.requireAdmin, enrollmentsController.listEnrollmentsForWorkshop)
router.delete('/:id/enrollment', authMiddleware, enrollmentsController.unenrollFromWorkshop)

module.exports = router
