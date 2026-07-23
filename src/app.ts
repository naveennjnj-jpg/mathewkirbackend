import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { admin, user, treasurer} from "./routes/index.js";
// import { checkValidAdminRole } from "./utils/index.js";
import bodyParser from "body-parser";
import { forgotPassword } from "./controllers/user/user.js";
import { verifyPasswordReset } from "./controllers/user/user.js";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url) // <-- Define __filename
const __dirname = path.dirname(__filename)        // <-- Define __dirname
const PORT = process.env.PORT || 8000;
const app = express();

app.set("trust proxy", true);

// ✅ CORS Configuration - FIXED
const corsOptions = {
 origin: [
    // ✅ Localhost patterns
    /^http:\/\/[a-zA-Z0-9-]*\.?localhost:\d+$/,
    /^http:\/\/[a-zA-Z0-9-]*\.?127\.0\.0\.1:\d+$/,
    /^https:\/\/[a-zA-Z0-9-]*\.?localhost:\d+$/,
    /^https:\/\/[a-zA-Z0-9-]*\.?127\.0\.0\.1:\d+$/,
    
    // ✅ Specific localhost ports
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5174",
    
    // ✅ Production domain with any subdomain
    /^https:\/\/[a-zA-Z0-9-]*\.?thebrtsa\.com$/,
    /^http:\/\/[a-zA-Z0-9-]*\.?thebrtsa\.com$/,
    
    // ✅ Vercel preview deployments
    /^https:\/\/[a-zA-Z0-9-]*\.vercel\.app$/,
    "https://test-app-taupe-ten.vercel.app",
  ],
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  credentials: true,
    allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "x-tenant-subdomain", // ✅ ADD THIS - IMPORTANT!
    "Accept",
    "Origin",
    "Access-Control-Allow-Origin",
  ],
};

app.use(cors(corsOptions));

// ✅ Handle preflight requests
app.options("*", cors(corsOptions));

app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
var dir = path.join(__dirname, 'static')
app.use(express.static(dir))
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Connect to database
connectDB();

// ✅ Root route
app.get("/", (_, res) => {
  res.send("Hello world entry point 🚀✅");
});

// ✅ Routes - FIXED ORDER (more specific first)
app.use("/api/admin", admin);
app.use("/api/auth", user);  // Your auth routes including signup
// app.use("/api/login", login);
app.use("/api/forgot-password", forgotPassword);
app.use("/api/reset-password", verifyPasswordReset);
app.use("/api/treasurer", treasurer);
app.use("/api", user);

// ✅ Error handling middleware (optional but recommended)
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

app.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));