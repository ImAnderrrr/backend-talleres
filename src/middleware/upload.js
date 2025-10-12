const path = require('path')
const fs = require('fs')
const multer = require('multer')

// Uploads directory (same location used previously in index.js)
const uploadsDir = path.join(__dirname, '..', '..', 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_\.]/g, '_')
    cb(null, uniqueSuffix + '-' + safeName)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido'), false)
    }
    cb(null, true)
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
})

module.exports = { upload, uploadsDir }
