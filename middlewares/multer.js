const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images are allowed'), false);
    }
 
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return cb(new Error('Only jpg, png, webp files allowed'), false);
    }
    
    cb(null, true);
  }
});

const handleUploadError = (err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'File upload failed' });
  }
  next();
};

module.exports = { upload, handleUploadError };

