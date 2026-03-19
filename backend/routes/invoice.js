import express from "express";
import Invoice from "../models/invoice.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();
const invoiceCustomerSelection = "name mobileNumber address gstNumber";
const allowedGstSlabs = new Set([5, 12, 18, 28]);

router.use(requireAuth);

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeInvoiceNumber(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCompanyName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error("Invoice must contain at least one line item.");
  }

  return lineItems.map((item) => {
    const product = String(item?.product || "")
      .trim()
      .replace(/\s+/g, " ");
    const rate = Number(item?.rate);
    const quantity = Number(item?.quantity);

    if (!product) {
      throw new Error("Each line item must include a product name.");
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Each line item rate must be greater than zero.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Each line item quantity must be greater than zero.");
    }

    return {
      product,
      rate: roundCurrency(rate),
      quantity: roundCurrency(quantity),
      total: roundCurrency(rate * quantity),
    };
  });
}

function calculateInvoiceTotals(lineItems, gstSlab) {
  const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.total, 0));
  const gstAmount = roundCurrency((subtotal * gstSlab) / 100);

  return {
    subtotal,
    gstAmount,
    totalPrice: roundCurrency(subtotal + gstAmount),
  };
}

async function buildNextInvoiceNumber() {
  const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
  let nextNumber = 1;

  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/\d+/);
    if (match) {
      nextNumber = Number.parseInt(match[0], 10) + 1;
    }
  }

  return `INV-${String(nextNumber).padStart(3, "0")}`;
}

async function findOwnedInvoice(invoiceId, customerId) {
  return Invoice.findOne({ _id: invoiceId, customerId }).populate(
    "customerId",
    invoiceCustomerSelection
  );
}

router.get("/generate/number", async (_req, res) => {
  try {
    const invoiceNumber = await buildNextInvoiceNumber();
    return res.json({ invoiceNumber });
  } catch {
    return res.status(500).json({ error: "Unable to generate invoice number right now." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const invoices = await Invoice.find({ customerId: req.auth.customerId })
      .populate("customerId", invoiceCustomerSelection)
      .sort({ createdAt: -1 });

    return res.json(invoices);
  } catch {
    return res.status(500).json({ error: "Unable to load invoice history right now." });
  }
});

router.post("/", async (req, res) => {
  try {
    const companyName = normalizeCompanyName(req.body.companyName);
    const invoiceNumber = normalizeInvoiceNumber(req.body.invoiceNumber);
    const gstSlab = Number(req.body.gstSlab);

    if (!invoiceNumber || !/^INV-[A-Z0-9-]{3,40}$/.test(invoiceNumber)) {
      return res.status(400).json({ error: "A valid invoice number is required." });
    }

    if (!companyName || companyName.length > 120) {
      return res.status(400).json({ error: "Company name must be between 1 and 120 characters." });
    }

    if (!allowedGstSlabs.has(gstSlab)) {
      return res.status(400).json({ error: "Unsupported GST slab selected." });
    }

    const lineItems = normalizeLineItems(req.body.lineItems);
    const { totalPrice } = calculateInvoiceTotals(lineItems, gstSlab);

    const invoice = await Invoice.create({
      invoiceNumber,
      companyName,
      lineItems,
      gstSlab,
      totalPrice,
      customerId: req.auth.customerId,
    });

    const populatedInvoice = await invoice.populate("customerId", invoiceCustomerSelection);
    return res.status(201).json(populatedInvoice);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: "Invoice number already exists. Generate a new invoice number and try again.",
      });
    }

    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: "Unable to create invoice right now." });
  }
});

router.get("/customer/:customerId", async (req, res) => {
  try {
    if (String(req.params.customerId) !== String(req.auth.customerId)) {
      return res.status(403).json({ error: "You can only access your own invoices." });
    }

    const invoices = await Invoice.find({ customerId: req.auth.customerId })
      .populate("customerId", invoiceCustomerSelection)
      .sort({ createdAt: -1 });

    return res.json(invoices);
  } catch {
    return res.status(500).json({ error: "Unable to load invoice history right now." });
  }
});

router.get("/", (_req, res) => {
  return res.status(403).json({ error: "Invoice listing is not available." });
});

router.get("/:id", async (req, res) => {
  try {
    const invoice = await findOwnedInvoice(req.params.id, req.auth.customerId);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    return res.json(invoice);
  } catch {
    return res.status(400).json({ error: "Unable to load invoice right now." });
  }
});

router.post("/:id/lineItems", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, customerId: req.auth.customerId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const [newLineItem] = normalizeLineItems([req.body]);
    invoice.lineItems.push(newLineItem);
    invoice.totalPrice = calculateInvoiceTotals(invoice.lineItems, invoice.gstSlab).totalPrice;
    await invoice.save();
    await invoice.populate("customerId", invoiceCustomerSelection);

    return res.json(invoice);
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: "Unable to add invoice line item right now." });
  }
});

router.delete("/:id/lineItems/:itemIndex", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, customerId: req.auth.customerId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const itemIndex = Number.parseInt(req.params.itemIndex, 10);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= invoice.lineItems.length) {
      return res.status(400).json({ error: "Invalid line item index" });
    }

    invoice.lineItems.splice(itemIndex, 1);

    if (invoice.lineItems.length === 0) {
      return res.status(400).json({ error: "Invoice must contain at least one line item." });
    }

    invoice.totalPrice = calculateInvoiceTotals(invoice.lineItems, invoice.gstSlab).totalPrice;
    await invoice.save();
    await invoice.populate("customerId", invoiceCustomerSelection);

    return res.json(invoice);
  } catch {
    return res.status(500).json({ error: "Unable to remove invoice line item right now." });
  }
});

router.put("/:id/lineItems/:itemIndex", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, customerId: req.auth.customerId });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const itemIndex = Number.parseInt(req.params.itemIndex, 10);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= invoice.lineItems.length) {
      return res.status(400).json({ error: "Invalid line item index" });
    }

    const [nextLineItem] = normalizeLineItems([req.body]);
    invoice.lineItems[itemIndex] = nextLineItem;
    invoice.totalPrice = calculateInvoiceTotals(invoice.lineItems, invoice.gstSlab).totalPrice;
    await invoice.save();
    await invoice.populate("customerId", invoiceCustomerSelection);

    return res.json(invoice);
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({ error: "Unable to update invoice line item right now." });
  }
});

export default router;
