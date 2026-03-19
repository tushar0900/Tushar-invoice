import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import customer from "./routes/customer.js";
import invoice from "./routes/invoice.js";
import { assertAuthConfiguration } from "./utils/auth.js";

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/invoiceDB";
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://tushar0900.github.io",
];
const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]);

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required to connect to MongoDB.");
  process.exit(1);
}

assertAuthConfiguration();
mongoose.set("sanitizeFilter", true);

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 300 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/api/customers", customer);
app.use("/api/invoices", invoice);

app.get("/health", (req, res) => {
  res.json({ ok: true, mongoReadyState: mongoose.connection.readyState });
});

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully...");

    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection error!!", err.message);
    process.exit(1);
  }
};

startServer();
