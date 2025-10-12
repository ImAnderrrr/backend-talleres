const { Router } = require('express');
const {
  listBanks,
  getBank,
  createBank,
  updateBank,
  deleteBank,
} = require('../controllers/banksController');
const auth = require('../middleware/authMiddleware');

const router = Router();

router.get('/', listBanks);
router.get('/:id', getBank);
// Protect write operations: only admins can create/update/delete banks
router.post('/', auth.requireAdmin, createBank);
router.put('/:id', auth.requireAdmin, updateBank);
router.delete('/:id', auth.requireAdmin, deleteBank);

module.exports = router;
