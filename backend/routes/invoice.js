import express from "express";
import Invoice from "../models/invoice.js";
import Customer from "../models/customer.js";

const router = express.Router();
const invoiceCustomerSelection = "name mobileNumber address gstNumber";

// Generate next invoice number
router.get("/generate/number", async (req, res) => {
  try {
    // Get the last invoice to determine the next number
    const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
    
    let nextNumber = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/\d+/);
      if (match) {
        nextNumber = parseInt(match[0]) + 1;
      }
    }
    
    // Format as INV-001, INV-002, etc.
    const invoiceNumber = `INV-${String(nextNumber).padStart(3, "0")}`;
    res.json({ invoiceNumber });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create Invoice
router.post("/", async (req, res) => {
  try {
    const companyName = req.body.companyName?.trim();

    // Find customer by mobile number
    const customer = await Customer.findOne({
      mobileNumber: req.body.customerMobileNumber,
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (!companyName) {
      return res.status(400).json({ error: "Company name is required." });
    }

    // Create invoice with lineItems array
    const invoiceData = {
      invoiceNumber: req.body.invoiceNumber,
      companyName,
      lineItems: req.body.lineItems, // Array of line items
      gstSlab: req.body.gstSlab,
      totalPrice: req.body.totalPrice,
      customerId: customer._id,
    };

    const invoice = await Invoice.create(invoiceData);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get invoices for a specific customer
router.get("/customer/:customerId", async (req, res) => {
  try {
    const invoices = await Invoice.find({ customerId: req.params.customerId })
      .populate("customerId", invoiceCustomerSelection)
      .sort({ createdAt: -1 });

    res.json(invoices);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get All Invoices with Customer details
router.get("/", async (req, res) => {
  try {
    const invoices = await Invoice.find().populate("customerId", invoiceCustomerSelection);
    res.json(invoices);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Invoice by ID
router.get("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate(
      "customerId",
      invoiceCustomerSelection
    );
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add line item to invoice
router.post("/:id/lineItems", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    invoice.lineItems.push(req.body);
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove line item from invoice
router.delete("/:id/lineItems/:itemIndex", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const itemIndex = parseInt(req.params.itemIndex);
    if (itemIndex < 0 || itemIndex >= invoice.lineItems.length) {
      return res.status(400).json({ error: "Invalid line item index" });
    }

    invoice.lineItems.splice(itemIndex, 1);
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update line item in invoice
router.put("/:id/lineItems/:itemIndex", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const itemIndex = parseInt(req.params.itemIndex);
    if (itemIndex < 0 || itemIndex >= invoice.lineItems.length) {
      return res.status(400).json({ error: "Invalid line item index" });
    }

    invoice.lineItems[itemIndex] = req.body;
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
