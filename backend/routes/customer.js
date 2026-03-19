import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import Customer from "../models/customer.js";
import Invoice from "../models/invoice.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearAuthCookie, setAuthCookie, signAuthToken } from "../utils/auth.js";

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const passwordPolicy =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,72}$/;
const passwordPolicyMessage =
  "Password must be 12 to 72 characters and include uppercase, lowercase, number, and special character.";
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Please try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

function sanitizeCustomer(customer) {
  if (!customer) {
    return customer;
  }

  const rawCustomer = typeof customer.toObject === "function" ? customer.toObject() : customer;
  const { password: _password, ...safeCustomer } = rawCustomer;
  return safeCustomer;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeMobileNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeAddress(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGstNumber(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidPassword(password) {
  return passwordPolicy.test(password || "");
}

function isValidMobileNumber(mobileNumber) {
  return /^\d{10,15}$/.test(mobileNumber);
}

function isValidGstNumber(gstNumber) {
  return /^[0-9A-Z]{15}$/.test(gstNumber);
}

function buildCustomerPayload(body) {
  return {
    mobileNumber: normalizeMobileNumber(body.mobileNumber),
    name: normalizeName(body.name),
    password: String(body.password || ""),
    address: normalizeAddress(body.address),
    gstNumber: normalizeGstNumber(body.gstNumber),
  };
}

function validateCustomerPayload(payload, { requirePassword = true } = {}) {
  if (!payload.mobileNumber || !payload.name || !payload.address || !payload.gstNumber) {
    return "Mobile number, name, address, and GST number are required.";
  }

  if (requirePassword && !payload.password) {
    return "Password is required.";
  }

  if (!isValidMobileNumber(payload.mobileNumber)) {
    return "Mobile number must contain 10 to 15 digits.";
  }

  if (payload.name.length < 2 || payload.name.length > 80) {
    return "Customer name must be between 2 and 80 characters.";
  }

  if (payload.address.length < 5 || payload.address.length > 300) {
    return "Address must be between 5 and 300 characters.";
  }

  if (!isValidGstNumber(payload.gstNumber)) {
    return "GST number must be 15 uppercase letters or digits.";
  }

  if (requirePassword && !isValidPassword(payload.password)) {
    return passwordPolicyMessage;
  }

  if (!requirePassword && payload.password && !isValidPassword(payload.password)) {
    return passwordPolicyMessage;
  }

  return "";
}

function isSelfRequest(req, customerId) {
  return String(req.auth.customerId) === String(customerId);
}

async function ensureUniqueCustomerFields({ mobileNumber, name, excludeCustomerId = "" }) {
  const mobileQuery = { mobileNumber };
  if (excludeCustomerId) {
    mobileQuery._id = { $ne: excludeCustomerId };
  }

  const mobileConflict = await Customer.findOne(mobileQuery);

  if (mobileConflict) {
    return "Mobile number already registered. Please login.";
  }

  const nameQuery = {
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  };
  if (excludeCustomerId) {
    nameQuery._id = { $ne: excludeCustomerId };
  }

  const nameConflict = await Customer.findOne(nameQuery);

  if (nameConflict) {
    return "Customer name already registered. Please choose another name or login.";
  }

  return "";
}

router.post("/", signupLimiter, async (req, res) => {
  try {
    const payload = buildCustomerPayload(req.body);
    const validationError = validateCustomerPayload(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const uniquenessError = await ensureUniqueCustomerFields(payload);
    if (uniquenessError) {
      return res.status(409).json({ error: uniquenessError });
    }

    const customer = await Customer.create({
      mobileNumber: payload.mobileNumber,
      name: payload.name,
      password: await bcrypt.hash(payload.password, BCRYPT_ROUNDS),
      address: payload.address,
      gstNumber: payload.gstNumber,
    });

    return res.status(201).json(sanitizeCustomer(customer));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Customer already exists." });
    }

    return res.status(500).json({ error: "Unable to create customer right now." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const password = String(req.body.password || "");

    if (!name || !password) {
      return res.status(400).json({ error: "Customer name and password are required." });
    }

    const customer = await Customer.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    }).select("+password");

    if (!customer || !customer.password) {
      return res.status(401).json({ error: "Invalid name or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid name or password." });
    }

    const authToken = signAuthToken({
      customerId: customer.id,
      mobileNumber: customer.mobileNumber,
    });

    setAuthCookie(res, authToken);
    return res.json(sanitizeCustomer(customer));
  } catch {
    return res.status(500).json({ error: "Unable to login right now." });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  return res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  return res.json(sanitizeCustomer(req.customer));
});

router.get("/", requireAuth, (_req, res) => {
  return res.status(403).json({ error: "Customer listing is not available." });
});

router.get("/mobile/:mobileNumber", requireAuth, async (req, res) => {
  try {
    const mobileNumber = normalizeMobileNumber(req.params.mobileNumber);

    if (mobileNumber !== req.auth.mobileNumber) {
      return res.status(403).json({ error: "You can only access your own customer record." });
    }

    return res.json(sanitizeCustomer(req.customer));
  } catch {
    return res.status(500).json({ error: "Unable to load customer right now." });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    if (!isSelfRequest(req, req.params.id)) {
      return res.status(403).json({ error: "You can only access your own customer record." });
    }

    return res.json(sanitizeCustomer(req.customer));
  } catch {
    return res.status(500).json({ error: "Unable to load customer right now." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    if (!isSelfRequest(req, req.params.id)) {
      return res.status(403).json({ error: "You can only update your own account." });
    }

    const updateData = {};
    const nextMobileNumber =
      req.body.mobileNumber !== undefined
        ? normalizeMobileNumber(req.body.mobileNumber)
        : req.customer.mobileNumber;
    const nextName = req.body.name !== undefined ? normalizeName(req.body.name) : req.customer.name;
    const nextAddress =
      req.body.address !== undefined ? normalizeAddress(req.body.address) : req.customer.address;
    const nextGstNumber =
      req.body.gstNumber !== undefined ? normalizeGstNumber(req.body.gstNumber) : req.customer.gstNumber;
    const nextPassword = req.body.password ? String(req.body.password) : "";
    const currentPassword = String(req.body.currentPassword || "");

    const validationError = validateCustomerPayload(
      {
        mobileNumber: nextMobileNumber,
        name: nextName,
        password: nextPassword,
        address: nextAddress,
        gstNumber: nextGstNumber,
      },
      { requirePassword: false }
    );

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const uniquenessError = await ensureUniqueCustomerFields({
      mobileNumber: nextMobileNumber,
      name: nextName,
      excludeCustomerId: req.auth.customerId,
    });

    if (uniquenessError) {
      return res.status(409).json({ error: uniquenessError });
    }

    updateData.mobileNumber = nextMobileNumber;
    updateData.name = nextName;
    updateData.address = nextAddress;
    updateData.gstNumber = nextGstNumber;

    if (nextPassword) {
      if (!isValidPassword(nextPassword)) {
        return res.status(400).json({ error: passwordPolicyMessage });
      }

      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to set a new password." });
      }

      const currentCustomer = await Customer.findById(req.auth.customerId).select("+password");
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        currentCustomer?.password || ""
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      updateData.password = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
    }

    const customer = await Customer.findByIdAndUpdate(req.auth.customerId, updateData, {
      new: true,
      runValidators: true,
    });

    return res.json(sanitizeCustomer(customer));
  } catch {
    return res.status(500).json({ error: "Unable to update customer right now." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    if (!isSelfRequest(req, req.params.id)) {
      return res.status(403).json({ error: "You can only delete your own account." });
    }

    const currentPassword = String(req.body.currentPassword || "");
    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required to delete your account." });
    }

    const customer = await Customer.findById(req.auth.customerId).select("+password");
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, customer?.password || "");

    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    await Invoice.deleteMany({ customerId: req.auth.customerId });
    await Customer.findByIdAndDelete(req.auth.customerId);
    clearAuthCookie(res);
    return res.json({ message: "Customer deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Unable to delete customer right now." });
  }
});

export default router;
