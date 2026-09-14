const { Router } = require("express");
const multer = require("multer");
const {
  listMyDocuments,
  uploadDocument,
  deleteDocument,
} = require("../controllers/documents.controller");
const { asyncHandler, AppError } = require("../utils/async");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = Router();
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".markdown", ".docx"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function validateDocumentType(req, _res, next) {
  if (!req.file) return next();

  const name = req.file.originalname || "";
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    return next(
      new AppError(
        "Unsupported document type. Upload a PDF, TXT, MD, Markdown, or DOCX file.",
        400
      )
    );
  }
  next();
}

function uploadErrorHandler(err, _req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "File is too large. Maximum size is 20 MB." });
  }
  return res.status(400).json({ error: `Upload failed: ${err.message}` });
}

router.get("/", requireAuth, requireRole("DOCTOR", "HOD"), asyncHandler(listMyDocuments));
router.post(
  "/",
  requireAuth,
  requireRole("DOCTOR", "HOD"),
  upload.single("file"),
  uploadErrorHandler,
  validateDocumentType,
  asyncHandler(uploadDocument)
);
router.delete("/:id", requireAuth, requireRole("DOCTOR", "HOD"), asyncHandler(deleteDocument));

module.exports = router;
