import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema(
  {
    product: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    rate: {
      type: Number,
      required: true,
      min: 0.01,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    total: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { _id: false }
);

const invoice = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    lineItems: [lineItemSchema],
    gstSlab: {
      type: Number,
      required: true,
      enum: [5, 12, 18, 28],
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0.01,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", invoice);
