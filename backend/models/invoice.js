import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema({
  product: {
    type: String,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
});

const invoice = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    lineItems: [lineItemSchema],
    gstSlab: {
      type: Number,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
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
