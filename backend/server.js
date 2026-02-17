import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import customer from "./routes/customer.js";
import invoice from "./routes/invoice.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/invoiceDB";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected successfully..."))
  .catch((err) => console.error("MongoDB connection error!!", err.message));

app.use("/api/customers", customer);
app.use("/api/invoices", invoice);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
