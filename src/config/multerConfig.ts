// config/multerConfig.ts
import multer from "multer";
import path from "path";
import fs from "fs";

// ============================================
// PROFILE IMAGE UPLOAD CONFIG
// ============================================

const profileUploadDir = "public/uploads/profiles";
if (!fs.existsSync(profileUploadDir)) fs.mkdirSync(profileUploadDir, { recursive: true });

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profileUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "profile-" + uniqueSuffix + ext);
  },
});

const profileFileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) cb(null, true);
  else cb(new Error("Only image files are allowed!"));
};

export const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: profileFileFilter,
});

// ============================================
// EVENT DOCUMENT UPLOAD CONFIG
// ============================================

const eventUploadDir = "public/uploads/events";
if (!fs.existsSync(eventUploadDir)) fs.mkdirSync(eventUploadDir, { recursive: true });

const eventStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, eventUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "event-" + uniqueSuffix + ext);
  },
});

const eventFileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed!"));
  }
};

export const uploadEventDocument = multer({
  storage: eventStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: eventFileFilter,
});

// ============================================
// GENERAL UPLOAD CONFIG (if needed)
// ============================================

const generalUploadDir = "public/uploads/general";
if (!fs.existsSync(generalUploadDir)) fs.mkdirSync(generalUploadDir, { recursive: true });

const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, generalUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "file-" + uniqueSuffix + ext);
  },
});

export const uploadGeneral = multer({
  storage: generalStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ============================================
// MULTER ERROR HANDLER
// ============================================

export const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum file size is 5MB for images and 10MB for documents.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  
  next();
};