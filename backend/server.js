import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import customer from "./routes/customer.js";
import invoice from "./routes/invoice.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/invoiceDB";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required to connect to MongoDB.");
  process.exit(1);
}

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
