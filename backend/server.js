import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import customer from "./routes/customer.js";
import invoice from "./routes/invoice.js";

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect("mongodb://127.0.0.1:27017/invoiceDB")
  .then(() => console.log("MongoDB connected successfully..."))
  .catch((err) => console.error("MongoDB connection error!!", err.message));

app.use("/api/customers", customer);
app.use("/api/invoices", invoice);

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
