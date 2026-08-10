import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { admin, user, treasurer,member} from "./routes/index.js";
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

// ✅ CORS Configuration - ONLY for 818live.net and subdomains
const corsOptions = {
  origin: [
    // Your main domain
    "https://818live.net",
    "http://818live.net", // Include HTTP just in case
    
    // All subdomains (HTTP and HTTPS)
    /^https?:\/\/([a-zA-Z0-9-]+\.)*818live\.net$/,
  ],
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  credentials: true,
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "x-tenant-subdomain", // Keep this if your app uses it
    "Accept",
    "Origin",
    "Access-Control-Allow-Origin",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight requests

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
app.use("/api/member", member);
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
