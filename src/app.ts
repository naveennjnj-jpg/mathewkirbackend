import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { admin, user, treasurer, member } from "./routes/index.js";
import bodyParser from "body-parser";
import { forgotPassword, verifyPasswordReset } from "./controllers/user/user.js";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8000;
const app = express();

app.set("trust proxy", true);

// ✅ Debug middleware to log incoming requests
app.use((req, res, next) => {
  console.log('🔍 Incoming request from:', req.headers.origin);
  console.log('📋 Method:', req.method);
  console.log('📍 URL:', req.url);
  next();
});

// ✅ CORS Configuration - ONLY for 818live.net and subdomains
const corsOptions = {
  origin: true,  // 👈 Yeh "*" ki tarah hai, sabko allow karega
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["*"],  // 👈 Sab headers allow
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parsing middleware
app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const dir = path.join(__dirname, 'static');
app.use(express.static(dir));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Connect to database
connectDB();

// ✅ Root route
app.get("/", (_, res) => {
  res.send("Hello world entry point 🚀✅");
});

// ✅ Routes
app.use("/api/admin", admin);
app.use("/api/auth", user);
app.use("/api/forgot-password", forgotPassword);
app.use("/api/reset-password", verifyPasswordReset);
app.use("/api/treasurer", treasurer);
app.use("/api/member", member);
app.use("/api", user);

// ✅ Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
  console.log(`✅ CORS enabled for 818live.net and subdomains`);
});

export default app;
