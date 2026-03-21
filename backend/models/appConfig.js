import mongoose from "mongoose";

const appConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    jwtSecret: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.AppConfig || mongoose.model("AppConfig", appConfigSchema);
