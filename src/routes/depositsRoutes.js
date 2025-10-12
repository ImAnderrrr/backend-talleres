const { Router } = require('express');
const { createDeposit, getDepositsByEmail, updateDeposit, listDeposits, getDepositById, reviewDeposit, deleteDeposit } = require('../controllers/depositsController');
const { upload } = require('../middleware/upload')

const auth = require('../middleware/authMiddleware')

const router = Router();

// Public POST is allowed; createDeposit will validate and require auth or fields as needed
router.post('/', upload.single('receipt'), createDeposit);
router.get('/', auth, getDepositsByEmail); // expects ?email=...
router.put('/:id', auth, upload.single('receipt'), updateDeposit);

// Admin endpoints
router.get('/list', auth, listDeposits);
router.get('/:id', auth, getDepositById);
router.post('/:id/review', auth, reviewDeposit);
router.delete('/:id', auth, deleteDeposit);

module.exports = router;
