const express = require('express')
const router = express.Router()
const { upload } = require('../middleware/upload')

// POST /uploads - accept single file under 'file' field
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
  const fileUrl = `/uploads/${req.file.filename}`
  return res.status(201).json({ fileUrl, fileName: req.file.filename })
})

module.exports = router
