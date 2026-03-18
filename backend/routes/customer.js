import express from "express";
import bcrypt from "bcryptjs";
import Customer from "../models/customer.js";

const router = express.Router();

function sanitizeCustomer(customer) {
  if (!customer) {
    return customer;
  }

  const { password, ...safeCustomer } = customer;
  return safeCustomer;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDuplicateFieldMessage(field) {
  if (field === "mobileNumber") {
    return "Mobile number already registered. Please login.";
  }

  if (field === "name") {
    return "Customer name already registered. Please choose another name or login.";
  }

  return "Customer already exists.";
}

// Create Customer
router.post("/", async (req, res) => {
  try {
    const mobileNumber = req.body.mobileNumber?.trim();
    const name = req.body.name?.trim();
    const companyName = req.body.companyName?.trim();
    const password = req.body.password;
    const address = req.body.address?.trim();
    const gstNumber = req.body.gstNumber?.trim();

    if (!mobileNumber || !name || !companyName || !password || !address || !gstNumber) {
      return res.status(400).json({
        error:
          "Mobile number, name, company name, password, address, and GST number are required.",
      });
    }

    const existingByMobile = await Customer.findOne({ mobileNumber });
    if (existingByMobile) {
      if (!existingByMobile.password) {
        existingByMobile.name = name;
        existingByMobile.companyName = companyName;
        existingByMobile.password = await bcrypt.hash(password, 10);
        existingByMobile.address = address;
        existingByMobile.gstNumber = gstNumber;
        await existingByMobile.save();
        return res.status(200).json(sanitizeCustomer(existingByMobile.toObject()));
      }

      return res.status(409).json({
        error: "Mobile number already registered. Please login.",
      });
    }

    const existingByName = await Customer.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });

    if (existingByName) {
      return res.status(409).json({
        error: "Customer name already registered. Please login.",
      });
    }

    const customer = await Customer.create({
      mobileNumber,
      name,
      companyName,
      password: await bcrypt.hash(password, 10),
      address,
      gstNumber,
    });

    res.status(201).json(sanitizeCustomer(customer.toObject()));
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      return res.status(409).json({ error: getDuplicateFieldMessage(field) });
    }

    res.status(400).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const password = req.body.password;

    if (!name || !password) {
      return res.status(400).json({ error: "Customer name and password are required." });
    }

    const customer = await Customer.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });

    if (!customer || !customer.password) {
      return res.status(401).json({ error: "Invalid name or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid name or password." });
    }

    res.json(sanitizeCustomer(customer.toObject()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get All Customers
router.get("/", async (req, res) => {
  try {
    const customers = await Customer.find();
    res.json(customers.map((customer) => sanitizeCustomer(customer.toObject())));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Customer by Mobile Number
router.get("/mobile/:mobileNumber", async (req, res) => {
  try {
    const customer = await Customer.findOne({
      mobileNumber: req.params.mobileNumber,
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(sanitizeCustomer(customer.toObject()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Customer by ID
router.get("/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(sanitizeCustomer(customer.toObject()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update Customer
router.put("/:id", async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(sanitizeCustomer(customer.toObject()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Customer
router.delete("/:id", async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json({ message: "Customer deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
