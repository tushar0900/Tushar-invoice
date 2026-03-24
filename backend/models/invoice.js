import mongoose from "mongoose";

const defaultBranding = {
  templateKey: "professional",
  brandLabel: "GST Tax Invoice",
  headerNote: "Clear billing with a branded customer-ready layout.",
  footerNote: "Thank you for your business. This invoice is computer generated.",
};

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

const brandingSchema = new mongoose.Schema(
  {
    templateKey: {
      type: String,
      required: true,
      enum: ["professional", "retail", "studio"],
      default: defaultBranding.templateKey,
    },
    brandLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
      default: defaultBranding.brandLabel,
    },
    headerNote: {
      type: String,
      trim: true,
      maxlength: 120,
      default: defaultBranding.headerNote,
    },
    footerNote: {
      type: String,
      trim: true,
      maxlength: 180,
      default: defaultBranding.footerNote,
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
    branding: {
      type: brandingSchema,
      default: () => ({ ...defaultBranding }),
    },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", invoice);
