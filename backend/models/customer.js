import mongoose from "mongoose";

const customer = new mongoose.Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{10,15}$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    gstNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[0-9A-Z]{15}$/,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Customer", customer);
