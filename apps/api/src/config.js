const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config();

module.exports = {
  config: {
    port: Number(process.env.PORT || 5001),
    nodeEnv: process.env.NODE_ENV || "development",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    mongoUri:
      process.env.MONGODB_URI || "mongodb://localhost:27017/medchat",
    mongoDbName: process.env.MONGODB_DB || "medchat",
    aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
    // Keep both names during the transition: older deployments configured the
    // FastAPI name directly, while the Express API originally read only its
    // own alias.  Both services must use the same value for document ingest.
    aiServiceApiKey:
      process.env.AI_SERVICE_API_KEY || process.env.API_KEY_FOR_AI || "dev-ai-key",
    uploadDir: process.env.UPLOAD_DIR || "./uploads",
  },
};
