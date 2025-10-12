const { Router } = require('express');
const { listActivities, createActivity } = require('../controllers/activitiesController');
const auth = require('../middleware/authMiddleware');

const router = Router();

// For now allow admins and regular users to fetch recent activities (UI shows recent actions to admins)
router.get('/', auth, listActivities);

// Debug endpoint: create a test activity
router.post('/test', auth, async (req, res) => {
	try {
		const actorEmail = (req.user && req.user.email) || req.body.actorEmail || null;
		const type = req.body.type || 'deposit_created';
		const payload = req.body.payload || { example: true };
		const created = await createActivity({ actorEmail, actorId: req.user && req.user.id, type, payload });
		if (!created) return res.status(500).json({ message: 'Could not create activity' });
		return res.json(created);
	} catch (e) {
		console.error('Error in /activities/test:', e && e.stack ? e.stack : e);
		return res.status(500).json({ message: 'Error creating test activity' });
	}
});

module.exports = router;
