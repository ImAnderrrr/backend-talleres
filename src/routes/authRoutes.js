const { Router } = require('express');
const {
  register,
  login,
  validateCarnet,
} = require('../controllers/authController');
const { getCurrentUser } = require('../controllers/meController');
const auth = require('../middleware/authMiddleware');
const { updateMe, uploadAvatar } = require('../controllers/authController');
const { upload } = require('../middleware/upload');

const router = Router();

// Ruta protegida que requiere autenticación
router.get('/me', auth, getCurrentUser);
router.put('/me', auth, updateMe);
router.post('/me/avatar', auth, upload.single('avatar'), uploadAvatar);

router.post('/register', register);
router.post('/login', login);
router.post('/validate-carnet', validateCarnet);
router.post('/refresh', require('../controllers/authController').refresh);
router.post('/logout', require('../controllers/authController').logout);

module.exports = router;
