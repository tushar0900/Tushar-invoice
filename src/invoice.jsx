import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import html2pdf from "html2pdf.js";
import API_BASE_URL from "./api";
import { clearAuthSession, setAuthUser } from "./authStorage";
import {
  BRANDING_COLOR_CONTROLS,
  BRANDING_TEMPLATES,
  getBrandingCssVars,
  getBrandingTemplate,
  getTemplateColorDefaults,
  getStoredBranding,
  normalizeBranding,
  persistBranding,
} from "./invoiceBranding";
import { extractReceiptDraftFromText } from "./receiptParser";
import "./App.css";

function createLineItem() {
  return { product: "", rate: 0, quantity: 0, total: 0 };
}

function createInitialLineItems() {
  return [createLineItem()];
}

function hasInvoiceDraftContent(companyName, items) {
  if (companyName.trim()) {
    return true;
  }

  return items.some(
    (item) => item.product.trim() || Number(item.rate) > 0 || Number(item.quantity) > 0
  );
}

function formatOcrStatus(status, progress) {
  const label = status
    ? status
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Scanning Receipt";

  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return label;
  }

  return `${label} ${Math.round(progress * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function normalizeInvoiceRecord(invoice) {
  if (!invoice) {
    return invoice;
  }

  return {
    ...invoice,
    branding: normalizeBranding(invoice.branding),
  };
}

function createCustomerSnapshot(customer) {
  if (!customer) {
    return {};
  }

  return {
    _id: customer._id,
    name: customer.name || "",
    mobileNumber: customer.mobileNumber || "",
    address: customer.address || "",
    gstNumber: customer.gstNumber || "",
  };
}

function createEditableLineItems(items) {
  const nextItems = Array.isArray(items)
    ? items.map((item) => ({
        product: String(item?.product || ""),
        rate: Number(item?.rate) || 0,
        quantity: Number(item?.quantity) || 0,
        total: Number(item?.total) || 0,
      }))
    : [];

  return nextItems.length ? nextItems : createInitialLineItems();
}

function normalizeDuplicateText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function buildLineItemDuplicateSignature(lineItems) {
  return (Array.isArray(lineItems) ? lineItems : [])
    .map((item) => {
      const product = normalizeDuplicateText(item?.product);
      const rate = roundCurrency(item?.rate);
      const quantity = roundCurrency(item?.quantity);
      const total = roundCurrency(item?.total || rate * quantity);

      if (!product || rate <= 0 || quantity <= 0 || total <= 0) {
        return "";
      }

      return `${product}:${rate.toFixed(2)}:${quantity.toFixed(2)}:${total.toFixed(2)}`;
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

function describeDuplicateMatch(match) {
  if (match.sameItems && match.sameGstSlab) {
    return "Same company, GST slab, total, and line items.";
  }

  if (match.sameItems) {
    return "Same company, total, and line items.";
  }

  return "Same company, GST slab, and total.";
}

function findPotentialDuplicateInvoices({
  historyInvoices,
  companyName,
  lineItems,
  gstRate,
  grandTotal,
  excludeInvoiceId = "",
}) {
  const normalizedCompanyName = normalizeDuplicateText(companyName);
  const draftLineItemSignature = buildLineItemDuplicateSignature(lineItems);
  const roundedGrandTotal = roundCurrency(grandTotal);

  if (!normalizedCompanyName || !draftLineItemSignature || roundedGrandTotal <= 0) {
    return [];
  }

  return historyInvoices
    .map((invoice) => {
      const sameCompany = normalizeDuplicateText(invoice?.companyName) === normalizedCompanyName;
      const sameGstSlab = Number(invoice?.gstSlab) === Number(gstRate);
      const sameTotal = roundCurrency(invoice?.totalPrice) === roundedGrandTotal;
      const sameItems =
        buildLineItemDuplicateSignature(invoice?.lineItems) === draftLineItemSignature;
      const score = [sameCompany, sameGstSlab, sameTotal, sameItems].filter(Boolean).length;

      return {
        invoice,
        sameCompany,
        sameGstSlab,
        sameTotal,
        sameItems,
        score,
      };
    })
    .filter(
      (match) =>
        match.invoice?._id !== excludeInvoiceId &&
        match.sameCompany &&
        match.sameTotal &&
        (match.sameItems || match.sameGstSlab)
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.invoice?.createdAt || 0) - new Date(left.invoice?.createdAt || 0);
    });
}

function buildInvoiceMarkup({
  invoiceNumber,
  customerName,
  companyName,
  address,
  gstNumber,
  mobileNumber,
  lineItems,
  gstSlab,
  totalPrice,
  branding,
  createdAt,
}) {
  const invoiceSubtotal = lineItems.reduce((sum, item) => sum + Number(item.total), 0);
  const invoiceGstAmount = (invoiceSubtotal * Number(gstSlab)) / 100;
  const normalizedBranding = normalizeBranding(branding);
  const brandingCssVars = getBrandingCssVars(normalizedBranding);
  const bannerBackground = brandingCssVars["--brand-banner"];
  const createdAtMarkup = createdAt
    ? `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <span style="font-size:11px;color:#5b6166;text-transform:uppercase;letter-spacing:0.45px;">Created On</span>
            <strong style="font-size:14px;color:#222;">${escapeHtml(formatDateTime(createdAt))}</strong>
          </div>
        `
    : "";
  const mobileMarkup = mobileNumber
    ? `<div><strong>Mobile Number:</strong><br />${escapeHtml(mobileNumber)}</div>`
    : "";

  return `
    <div style="padding:20px;background:#fff;color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="margin-bottom:24px;padding:22px;border:1px solid ${normalizedBranding.border};border-radius:18px;background:${bannerBackground};">
        <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;">
          <div style="flex:1 1 auto;min-width:0;">
            <h1 style="margin:0 0 10px;font-size:30px;font-weight:700;color:${normalizedBranding.accentStrong};">
              ${escapeHtml(normalizedBranding.brandLabel)}
            </h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#425466;">
              ${escapeHtml(normalizedBranding.headerNote)}
            </p>
          </div>
          <div style="width:220px;max-width:100%;padding:16px;border-radius:14px;background:#fff;border:1px solid rgba(255,255,255,0.45);box-shadow:0 8px 24px rgba(15,23,42,0.08);display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:11px;color:#5b6166;text-transform:uppercase;letter-spacing:0.45px;">Invoice Number</span>
              <strong style="font-size:16px;color:#222;">${escapeHtml(invoiceNumber)}</strong>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:11px;color:#5b6166;text-transform:uppercase;letter-spacing:0.45px;">Company</span>
              <strong style="font-size:14px;color:#222;">${escapeHtml(companyName || "-")}</strong>
            </div>
            ${createdAtMarkup}
          </div>
        </div>
      </div>
      <div style="border:1px solid ${normalizedBranding.border};border-left:4px solid ${normalizedBranding.accent};border-radius:14px;padding:18px;margin-bottom:20px;background:${normalizedBranding.background};">
        <h4 style="margin:0 0 14px;color:${normalizedBranding.accentStrong};text-transform:uppercase;font-size:16px;">Customer Information</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div><strong>Name:</strong><br />${escapeHtml(customerName || "-")}</div>
          <div><strong>Company Name:</strong><br />${escapeHtml(companyName || "-")}</div>
          <div><strong>Address:</strong><br />${escapeHtml(address || "-")}</div>
          <div><strong>GST Number:</strong><br />${escapeHtml(gstNumber || "-")}</div>
          ${mobileMarkup}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr>
            <th style="padding:12px 10px;border-bottom:2px solid ${normalizedBranding.border};text-align:left;color:#5b6166;text-transform:uppercase;font-size:12px;letter-spacing:0.35px;">Product</th>
            <th style="padding:12px 10px;border-bottom:2px solid ${normalizedBranding.border};text-align:left;color:#5b6166;text-transform:uppercase;font-size:12px;letter-spacing:0.35px;">Rate</th>
            <th style="padding:12px 10px;border-bottom:2px solid ${normalizedBranding.border};text-align:left;color:#5b6166;text-transform:uppercase;font-size:12px;letter-spacing:0.35px;">Quantity</th>
            <th style="padding:12px 10px;border-bottom:2px solid ${normalizedBranding.border};text-align:left;color:#5b6166;text-transform:uppercase;font-size:12px;letter-spacing:0.35px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems
            .map(
              (item) => `
                <tr>
                  <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};">${escapeHtml(item.product || "-")}</td>
                  <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};">${formatCurrency(item.rate)}</td>
                  <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};">${item.quantity}</td>
                  <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};">${formatCurrency(item.total)}</td>
                </tr>
              `
            )
            .join("")}
          <tr>
            <td colspan="2"></td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;">Subtotal:</td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;">${formatCurrency(invoiceSubtotal)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;">GST (${gstSlab}%):</td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;">${formatCurrency(invoiceGstAmount)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;background:${normalizedBranding.background};color:${normalizedBranding.accentStrong};">Grand Total:</td>
            <td style="padding:12px 10px;border-bottom:1px solid ${normalizedBranding.border};font-weight:700;background:${normalizedBranding.background};color:${normalizedBranding.accentStrong};">${formatCurrency(totalPrice)}</td>
          </tr>
        </tbody>
      </table>
      <div style="border:1px solid ${normalizedBranding.border};border-radius:14px;padding:18px;background:${normalizedBranding.background};">
        <strong style="display:block;margin-bottom:10px;">Amount in words</strong>
        <div>${escapeHtml(numberToWords(Number(totalPrice)))}</div>
      </div>
      <div style="margin-top:18px;padding:18px;border-radius:14px;background:#fff;border:1px dashed ${normalizedBranding.border};">
        <strong style="display:block;margin-bottom:10px;color:${normalizedBranding.accentStrong};">Footer note</strong>
        <div style="line-height:1.6;color:#425466;">${escapeHtml(normalizedBranding.footerNote)}</div>
      </div>
    </div>
  `;
}

function InvoiceDocumentPreview({
  invoiceNumber,
  customerName,
  companyName,
  address,
  gstNumber,
  mobileNumber,
  lineItems,
  gstSlab,
  totalPrice,
  branding,
  createdAt,
}) {
  const normalizedBranding = normalizeBranding(branding);
  const invoiceSubtotal = lineItems.reduce((sum, item) => sum + Number(item.total), 0);
  const invoiceGstAmount = (invoiceSubtotal * Number(gstSlab)) / 100;

  return (
    <div className="invoice-preview branded-invoice-preview" style={getBrandingCssVars(normalizedBranding)}>
      <div className="invoice-brand-banner">
        <div className="invoice-brand-copy">
          <h1>{normalizedBranding.brandLabel}</h1>
          <p>{normalizedBranding.headerNote}</p>
        </div>

        <div className="invoice-brand-meta-card">
          <div className="invoice-brand-meta-item">
            <label>Invoice Number</label>
            <strong>{invoiceNumber || "-"}</strong>
          </div>
          <div className="invoice-brand-meta-item">
            <label>Company</label>
            <strong>{companyName || "-"}</strong>
          </div>
          {createdAt ? (
            <div className="invoice-brand-meta-item">
              <label>Created On</label>
              <strong>{formatDateTime(createdAt)}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="customer-details-box">
        <h4>Customer Information</h4>
        <div className="details-grid">
          <div className="detail-item">
            <label>Name:</label>
            <span>{customerName || "-"}</span>
          </div>
          <div className="detail-item">
            <label>Company Name:</label>
            <span>{companyName || "-"}</span>
          </div>
          <div className="detail-item">
            <label>Address:</label>
            <span>{address || "-"}</span>
          </div>
          <div className="detail-item">
            <label>GST Number:</label>
            <span>{gstNumber || "-"}</span>
          </div>
          {mobileNumber ? (
            <div className="detail-item">
              <label>Mobile Number:</label>
              <span>{mobileNumber}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="table-shell table-shell-preview">
        <table className="invoice-table invoice-preview-table responsive-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Rate</th>
              <th>Quantity</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {lineItems.map((item, index) => (
              <tr key={`${item.product}-${index}`}>
                <td data-label="Product">{item.product || "-"}</td>
                <td data-label="Rate">{formatCurrency(item.rate)}</td>
                <td data-label="Quantity">{item.quantity}</td>
                <td data-label="Total">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-totals-grid">
        <div className="totals-card">
          <label>Subtotal</label>
          <strong>{formatCurrency(invoiceSubtotal)}</strong>
        </div>
        <div className="totals-card">
          <label>GST ({gstSlab}%)</label>
          <strong>{formatCurrency(invoiceGstAmount)}</strong>
        </div>
        <div className="totals-card totals-card-emphasis">
          <label>Grand Total</label>
          <strong>{formatCurrency(totalPrice)}</strong>
        </div>
      </div>

      <div className="amount-words">
        <label>Amount in words:</label>
        <p className="amount-words-copy">{numberToWords(totalPrice)}</p>
      </div>

      <div className="invoice-brand-footer">
        <label>Footer Note</label>
        <p>{normalizedBranding.footerNote}</p>
      </div>
    </div>
  );
}

export default function Invoice() {
  const navigate = useNavigate();
  const receiptPreviewUrlRef = useRef(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [lineItems, setLineItems] = useState(createInitialLineItems);
  const [gstRate, setGstRate] = useState(5);
  const [branding, setBranding] = useState(getStoredBranding);
  const [editingInvoiceId, setEditingInvoiceId] = useState("");
  const [activeView, setActiveView] = useState("create");
  const [historyInvoices, setHistoryInvoices] = useState([]);
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [receiptImagePreview, setReceiptImagePreview] = useState("");
  const [receiptFileName, setReceiptFileName] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatusMessage, setOcrStatusMessage] = useState("");
  const [ocrExtractedText, setOcrExtractedText] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [isBrandingMenuOpen, setIsBrandingMenuOpen] = useState(false);

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const gstAmount = (subtotal * gstRate) / 100;
  const grandTotal = subtotal + gstAmount;
  const isEditingInvoice = Boolean(editingInvoiceId);
  const previewBranding = normalizeBranding(branding);
  const activeBrandingTemplate = getBrandingTemplate(previewBranding.templateKey);
  const loggedInCustomerSnapshot = createCustomerSnapshot(loggedInUser);
  const duplicateMatches = isEditingInvoice
    ? []
    : findPotentialDuplicateInvoices({
        historyInvoices,
        companyName,
        lineItems,
        gstRate,
        grandTotal,
      });
  const redirectToLogin = () => {
    clearAuthSession();
    navigate("/login");
  };

  useEffect(() => {
    const loadInvoiceNumber = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/invoices/generate/number`);
        setInvoiceNo(response.data.invoiceNumber);
      } catch (error) {
        if (error.response?.status === 401) {
          clearAuthSession();
          navigate("/login");
          return;
        }

        console.error("Error generating invoice number (backend failed):", error);
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        setInvoiceNo(`INV-${y}${m}${d}${hh}${mm}${ss}`);
      }
    };

    loadInvoiceNumber();
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrlRef.current) {
        URL.revokeObjectURL(receiptPreviewUrlRef.current);
        receiptPreviewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    persistBranding(branding);
  }, [branding]);

  useEffect(() => {
    let isActive = true;

    const hydrateLoggedInUser = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/customers/me`);
        if (isActive) {
          applyLoggedInCustomer(response.data);
        }
      } catch {
        if (isActive) {
          clearAuthSession();
          navigate("/login");
        }
      }
    };

    hydrateLoggedInUser();

    return () => {
      isActive = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!loggedInUser?._id) {
      return;
    }

    const loadInvoiceHistory = async () => {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const response = await axios.get(`${API_BASE_URL}/api/invoices/me`);
        const nextInvoices = response.data.map(normalizeInvoiceRecord);
        setHistoryInvoices(nextInvoices);
        setSelectedHistoryInvoice((currentSelection) =>
          currentSelection
            ? nextInvoices.find((invoice) => invoice._id === currentSelection._id) || null
            : null
        );
      } catch (error) {
        if (error.response?.status === 401) {
          clearAuthSession();
          navigate("/login");
          return;
        }

        setHistoryError(
          error.response?.data?.error || "Unable to load invoice history. Please try again."
        );
      } finally {
        setHistoryLoading(false);
      }
    };

    loadInvoiceHistory();
  }, [loggedInUser?._id, navigate]);

  const applyLoggedInCustomer = (user) => {
    setAuthUser(user);
    setLoggedInUser(user);
    setMobile(user.mobileNumber || "");
    setName(user.name || "");
    setAddress(user.address || "");
    setGstNo(user.gstNumber || "");
  };

  const replaceReceiptPreview = (file) => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    receiptPreviewUrlRef.current = nextPreviewUrl;
    setReceiptImagePreview(nextPreviewUrl);
    setReceiptFileName(file.name);
  };

  const clearReceiptImport = () => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }

    setReceiptImagePreview("");
    setReceiptFileName("");
    setOcrStatusMessage("");
    setOcrExtractedText("");
    setOcrLoading(false);
  };

  const generateInvoiceNumber = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/generate/number`);
      setInvoiceNo(response.data.invoiceNumber);
    } catch (error) {
      if (error.response?.status === 401) {
        redirectToLogin();
        return;
      }

      console.error("Error generating invoice number (backend failed):", error);
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      setInvoiceNo(`INV-${y}${m}${d}${hh}${mm}${ss}`);
    }
  };

  const fetchInvoiceHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/me`);
      const nextInvoices = response.data.map(normalizeInvoiceRecord);
      setHistoryInvoices(nextInvoices);
      setSelectedHistoryInvoice((currentSelection) =>
        currentSelection
          ? nextInvoices.find((invoice) => invoice._id === currentSelection._id) || null
          : null
      );
    } catch (error) {
      if (error.response?.status === 401) {
        redirectToLogin();
        return;
      }

      setHistoryError(
        error.response?.data?.error || "Unable to load invoice history. Please try again."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const openInvoiceForEditing = (invoice) => {
    if (!invoice?._id) {
      return;
    }

    setEditingInvoiceId(invoice._id);
    setInvoiceNo(invoice.invoiceNumber || "");
    setCompanyName(invoice.companyName || "");
    setLineItems(createEditableLineItems(invoice.lineItems));
    setGstRate(Number(invoice.gstSlab) || 5);
    setBranding(normalizeBranding(invoice.branding));
    clearReceiptImport();
    setSelectedHistoryInvoice(null);
    setActiveView("create");

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleLineItemChange = (index, field, value) => {
    const updatedItems = [...lineItems];
    updatedItems[index][field] = field === "product" ? value : Number(value);

    if (field === "rate" || field === "quantity") {
      updatedItems[index].total = updatedItems[index].rate * updatedItems[index].quantity;
    }

    setLineItems(updatedItems);
  };

  const addRow = () => {
    setLineItems([...lineItems, createLineItem()]);
  };

  const removeRow = (index) => {
    if (lineItems.length === 1) {
      alert("Invoice must have at least one line item");
      return;
    }

    setLineItems(lineItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetInvoiceForm = async () => {
    setCompanyName("");
    setLineItems(createInitialLineItems());
    setGstRate(5);
    clearReceiptImport();
    await generateInvoiceNumber();
  };

  const cancelInvoiceEditing = async () => {
    setEditingInvoiceId("");
    await resetInvoiceForm();
  };

  const buildHistoryMarkup = (invoice) => {
    const invoiceCustomer = invoice.customerId || loggedInUser || {};

    return buildInvoiceMarkup({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoiceCustomer.name || name,
      companyName: invoice.companyName || "-",
      address: invoiceCustomer.address || address,
      gstNumber: invoiceCustomer.gstNumber || gstNo,
      mobileNumber: invoiceCustomer.mobileNumber || mobile,
      lineItems: invoice.lineItems,
      gstSlab: invoice.gstSlab,
      totalPrice: invoice.totalPrice,
      branding: invoice.branding,
      createdAt: invoice.createdAt,
    });
  };

  const downloadInvoicePdf = (invoice) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildHistoryMarkup(invoice);

    const options = {
      margin: 10,
      filename: `Invoice-${invoice.invoiceNumber}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
    };

    html2pdf().set(options).from(wrapper).save();
  };

  const handleReceiptImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    if (
      hasInvoiceDraftContent(companyName, lineItems) &&
      !window.confirm("Importing a receipt will replace the current invoice rows. Continue?")
    ) {
      return;
    }

    const previousDraft = {
      companyName,
      gstRate,
      lineItems: lineItems.map((item) => ({ ...item })),
    };

    replaceReceiptPreview(file);
    setOcrLoading(true);
    setOcrStatusMessage("Preparing receipt scan...");
    setOcrExtractedText("");

    try {
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(file, "eng", {
        logger: (message) => {
          setOcrStatusMessage(formatOcrStatus(message.status, message.progress));
        },
      });

      const extractedText = result.data?.text?.trim() || "";
      setOcrExtractedText(extractedText);

      if (!extractedText) {
        setOcrStatusMessage(
          "No readable text was detected. Try a clearer image with better lighting."
        );
        setCompanyName(previousDraft.companyName);
        setGstRate(previousDraft.gstRate);
        setLineItems(previousDraft.lineItems);
        return;
      }

      const draft = extractReceiptDraftFromText(extractedText);
      const nextLineItems = draft.lineItems.length
        ? draft.lineItems
        : previousDraft.lineItems.length
          ? previousDraft.lineItems
          : createInitialLineItems();

      setLineItems(nextLineItems);

      if (draft.companyName) {
        setCompanyName(draft.companyName);
      } else {
        setCompanyName(previousDraft.companyName);
      }

      setGstRate(draft.gstRate || 5);

      if (!draft.lineItems.length) {
        setOcrStatusMessage(
          "Text was detected, but line items could not be mapped cleanly. Review the extracted text and enter rows manually."
        );
        return;
      }

      const importSummary = [
        `${draft.lineItems.length} item${draft.lineItems.length === 1 ? "" : "s"}`,
        `GST ${draft.gstRate || 5}%`,
      ];

      if (draft.companyName) {
        importSummary.unshift(`company "${draft.companyName}"`);
      }

      setOcrStatusMessage(`Imported ${importSummary.join(", ")}. Review before saving.`);
    } catch (error) {
      console.error("Receipt import failed:", error);
      setCompanyName(previousDraft.companyName);
      setGstRate(previousDraft.gstRate);
      setLineItems(previousDraft.lineItems);
      setOcrStatusMessage(
        "Receipt scanning failed. Please try a sharper image or enter the details manually."
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const updateBrandingField = (field, value) => {
    setBranding((currentBranding) => ({
      ...currentBranding,
      [field]: value,
    }));
  };

  const selectBrandingTemplate = (templateKey) => {
    const templateColors = getTemplateColorDefaults(templateKey);

    setBranding((currentBranding) => ({
      ...currentBranding,
      templateKey,
      ...templateColors,
    }));
  };

  const resetBrandingColors = () => {
    const templateColors = getTemplateColorDefaults(previewBranding.templateKey);

    setBranding((currentBranding) => ({
      ...currentBranding,
      ...templateColors,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!invoiceNo || !loggedInUser?.mobileNumber || !companyName.trim() || lineItems.length === 0) {
      alert("Please fill all required fields");
      return;
    }

    const validItems = lineItems.every(
      (item) => item.product && item.rate > 0 && item.quantity > 0
    );

    if (!validItems) {
      alert("Please fill all line item details (Product, Rate, Quantity)");
      return;
    }

    const editingMode = isEditingInvoice;
    const activeDuplicateMatches = editingMode
      ? []
      : findPotentialDuplicateInvoices({
          historyInvoices,
          companyName,
          lineItems,
          gstRate,
          grandTotal,
        });

    if (activeDuplicateMatches.length > 0) {
      const duplicateSummary = activeDuplicateMatches
        .slice(0, 3)
        .map(
          (match) =>
            `${match.invoice.invoiceNumber} | ${formatDateTime(match.invoice.createdAt)} | ${formatCurrency(match.invoice.totalPrice)}`
        )
        .join("\n");

      if (
        !window.confirm(
          `Potential duplicate invoice found for ${companyName.trim()}.\n\n${duplicateSummary}\n\nSave this invoice anyway?`
        )
      ) {
        return;
      }
    }

    setSaveLoading(true);

    try {
      const invoicePayload = {
        companyName: companyName.trim(),
        lineItems,
        gstSlab: gstRate,
        totalPrice: grandTotal,
        branding: previewBranding,
      };
      const response = editingMode
        ? await axios.put(`${API_BASE_URL}/api/invoices/${editingInvoiceId}`, invoicePayload)
        : await axios.post(`${API_BASE_URL}/api/invoices`, {
            invoiceNumber: invoiceNo,
            ...invoicePayload,
          });

      const savedInvoice = normalizeInvoiceRecord({
        ...response.data,
        companyName: response.data.companyName || companyName.trim(),
        customerId: response.data.customerId || loggedInCustomerSnapshot,
      });

      setHistoryInvoices((currentInvoices) => {
        if (editingMode) {
          return currentInvoices.map((invoice) =>
            invoice._id === savedInvoice._id ? savedInvoice : invoice
          );
        }

        return [
          savedInvoice,
          ...currentInvoices.filter((invoice) => invoice._id !== savedInvoice._id),
        ];
      });
      setSelectedHistoryInvoice(null);
      setEditingInvoiceId("");
      setActiveView("history");
      await resetInvoiceForm();
      await fetchInvoiceHistory();
      alert(editingMode ? "Invoice updated successfully" : "Invoice saved successfully");
    } catch (error) {
      if (error.response?.status === 401) {
        redirectToLogin();
        return;
      }

      alert(error.response?.data?.error || `Error saving invoice: ${error.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!invoiceNo || !loggedInUser?.mobileNumber || !companyName.trim() || lineItems.length === 0) {
      alert("Please fill all required fields before downloading the invoice.");
      return;
    }

    const validItems = lineItems.every(
      (item) => item.product && item.rate > 0 && item.quantity > 0
    );

    if (!validItems) {
      alert("Please fill all line item details before downloading the invoice.");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildInvoiceMarkup({
      invoiceNumber: invoiceNo,
      customerName: name,
      companyName: companyName.trim(),
      address,
      gstNumber: gstNo,
      mobileNumber: mobile,
      lineItems,
      gstSlab: gstRate,
      totalPrice: grandTotal,
      branding: previewBranding,
    });

    const options = {
      margin: 10,
      filename: `Invoice-${invoiceNo}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
    };

    html2pdf().set(options).from(wrapper).save();
  };

  const handleLogout = () => {
    axios
      .post(`${API_BASE_URL}/api/customers/logout`)
      .catch(() => {})
      .finally(() => {
        clearAuthSession();
        navigate("/login");
      });
  };

  return (
    <div className="annexure invoice-page">
      <div className="page-toolbar">
        <div className="toolbar-copy">
          <h2>
            {activeView === "history"
              ? "Invoice History"
              : isEditingInvoice
                ? "Edit Invoice"
                : "Generate Invoice"}
          </h2>
          <small>
            Signed in as <strong>{name || "Customer"}</strong>
          </small>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className={`mode-btn ${activeView === "create" ? "active" : ""}`}
            onClick={() => setActiveView("create")}
          >
            Create Invoice
          </button>
          <button
            type="button"
            className={`mode-btn ${activeView === "history" ? "active" : ""}`}
            onClick={() => {
              setSelectedHistoryInvoice(null);
              setActiveView("history");
            }}
          >
            Invoice History
          </button>
          <button type="button" className="secondary-btn toolbar-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {activeView === "create" ? (
        <>
          {isEditingInvoice ? (
            <div className="editor-mode-banner">
              <div className="editor-mode-copy">
                <h4>Editing Saved Invoice</h4>
                <small>
                  Update the items, GST slab, company name, or invoice theme for {invoiceNo}.
                </small>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => void cancelInvoiceEditing()}
                disabled={saveLoading}
              >
                Cancel Edit
              </button>
            </div>
          ) : null}

          {!isEditingInvoice && duplicateMatches.length > 0 ? (
            <div className="duplicate-warning-panel">
              <div className="duplicate-warning-header">
                <div>
                  <h4>Duplicate Invoice Warning</h4>
                  <small>
                    This draft looks similar to {duplicateMatches.length} saved invoice
                    {duplicateMatches.length === 1 ? "" : "s"} for this customer.
                  </small>
                </div>
              </div>

              <div className="duplicate-warning-list">
                {duplicateMatches.slice(0, 3).map((match) => (
                  <div key={match.invoice._id} className="duplicate-warning-card">
                    <div className="duplicate-warning-copy">
                      <strong>{match.invoice.invoiceNumber}</strong>
                      <small>
                        {formatDateTime(match.invoice.createdAt)} •{" "}
                        {formatCurrency(match.invoice.totalPrice)}
                      </small>
                      <span>{describeDuplicateMatch(match)}</span>
                    </div>

                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setSelectedHistoryInvoice(null);
                        setActiveView("history");
                      }}
                    >
                      Open History
                    </button>
                  </div>
                ))}
              </div>

              {duplicateMatches.length > 3 ? (
                <small className="duplicate-warning-more">
                  {duplicateMatches.length - 3} more matching invoices found in history.
                </small>
              ) : null}
            </div>
          ) : null}

          <div className="receipt-import-panel">
            <h4>Receipt or Image to Invoice</h4>
            <small>
              Upload a clear receipt image to prefill company name, GST slab, and line items.
              Review the imported values before saving.
            </small>

            <div className="receipt-import-actions">
              <label className="secondary-btn receipt-upload-btn">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="receipt-upload-input"
                  onChange={handleReceiptImport}
                  disabled={ocrLoading}
                />
                {ocrLoading ? "Scanning Receipt..." : "Upload Receipt Image"}
              </label>

              {receiptImagePreview ? (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={clearReceiptImport}
                  disabled={ocrLoading}
                >
                  Clear Scan
                </button>
              ) : null}

              <small className="receipt-file-copy">
                {receiptFileName
                  ? `Selected file: ${receiptFileName}`
                  : "Use a flat, well-lit image for better OCR results."}
              </small>
            </div>

            {ocrStatusMessage ? (
              <div className={`receipt-status ${ocrLoading ? "receipt-status-loading" : ""}`}>
                {ocrStatusMessage}
              </div>
            ) : null}

            {receiptImagePreview ? (
              <div className="receipt-preview">
                <img src={receiptImagePreview} alt="Uploaded receipt preview" />
              </div>
            ) : null}

            {ocrExtractedText ? (
              <div className="receipt-text-panel">
                <label>Extracted Text</label>
                <textarea
                  className="receipt-text-output"
                  value={ocrExtractedText}
                  readOnly
                  rows={6}
                />
              </div>
            ) : null}
          </div>

          <div className="customer-selection">
            <h4>Logged In Customer</h4>

            <div className="row single">
              <label>Customer Mobile Number</label>
              <input value={mobile} disabled />
            </div>

            <div className="details-grid">
              <div className="detail-item">
                <label>Name:</label>
                <span>{name}</span>
              </div>
              <div className="detail-item">
                <label>Address:</label>
                <span>{address}</span>
              </div>
              <div className="detail-item">
                <label>GST Number:</label>
                <span>{gstNo}</span>
              </div>
            </div>

            <div className="row single">
              <label>Company Name</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name for this invoice"
                required
              />
            </div>
          </div>

          <div className="branding-panel">
            <button
              type="button"
              className="branding-menu-toggle"
              aria-expanded={isBrandingMenuOpen}
              aria-controls="invoice-theme-menu"
              onClick={() => setIsBrandingMenuOpen((currentValue) => !currentValue)}
            >
              <div className="branding-menu-copy">
                <div className="branding-panel-copy">
                  <h4>Invoice Theme</h4>
                  <small>
                    Pick a visual theme and adjust the invoice copy shown in the header and footer.
                    {isEditingInvoice ? " Changes here will update this saved invoice." : ""}
                  </small>
                </div>

                <div className="branding-menu-summary">
                  <strong>{activeBrandingTemplate.name}</strong>
                  <span>{isBrandingMenuOpen ? "Hide theme options" : "Show theme options"}</span>
                </div>
              </div>

              <span
                className={`branding-menu-chevron ${isBrandingMenuOpen ? "is-open" : ""}`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 20 20" fill="none">
                  <path
                    d="m5 7.5 5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            <div
              id="invoice-theme-menu"
              className="branding-panel-content"
              hidden={!isBrandingMenuOpen}
            >
              <div className="branding-template-grid">
                {BRANDING_TEMPLATES.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    className={`branding-template-card ${
                      previewBranding.templateKey === template.key ? "active" : ""
                    }`}
                    onClick={() => selectBrandingTemplate(template.key)}
                    style={{
                      "--template-accent": template.accent,
                      "--template-banner": `linear-gradient(135deg, ${template.bannerStart} 0%, ${template.bannerEnd} 100%)`,
                    }}
                  >
                    <span className="branding-template-swatch" />
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </button>
                ))}
              </div>

              <div className="branding-fields-grid">
                <div className="summary-field">
                  <label htmlFor="brand-label">Brand Label</label>
                  <input
                    id="brand-label"
                    value={branding.brandLabel || ""}
                    onChange={(e) => updateBrandingField("brandLabel", e.target.value)}
                    placeholder="GST Tax Invoice"
                    maxLength={60}
                  />
                </div>

                <div className="summary-field">
                  <label htmlFor="brand-header-note">Header Note</label>
                  <textarea
                    id="brand-header-note"
                    value={branding.headerNote || ""}
                    onChange={(e) => updateBrandingField("headerNote", e.target.value)}
                    placeholder="Add a short line below the invoice title"
                    maxLength={120}
                    rows={3}
                  />
                </div>

                <div className="summary-field branding-footer-field">
                  <label htmlFor="brand-footer-note">Footer Note</label>
                  <textarea
                    id="brand-footer-note"
                    value={branding.footerNote || ""}
                    onChange={(e) => updateBrandingField("footerNote", e.target.value)}
                    placeholder="Thank you for your business. This invoice is computer generated."
                    maxLength={180}
                    rows={3}
                  />
                </div>
              </div>

              <div className="branding-panel-copy">
                <h4>Template Colors</h4>
                <small>
                  Fine-tune the selected theme colors for this invoice preview and any invoices you
                  save from here.
                </small>
              </div>

              <div className="branding-color-grid">
                {BRANDING_COLOR_CONTROLS.map((control) => (
                  <label key={control.key} className="branding-color-field">
                    <span className="branding-color-label">{control.label}</span>
                    <small>{control.description}</small>
                    <div className="branding-color-input">
                      <input
                        type="color"
                        value={previewBranding[control.key]}
                        onChange={(e) => updateBrandingField(control.key, e.target.value)}
                      />
                      <code>{previewBranding[control.key]}</code>
                    </div>
                  </label>
                ))}
              </div>

              <div className="branding-actions">
                <button type="button" className="secondary-btn" onClick={resetBrandingColors}>
                  Reset Colors to {activeBrandingTemplate.name}
                </button>
              </div>
            </div>
          </div>

          <InvoiceDocumentPreview
            invoiceNumber={invoiceNo}
            customerName={name}
            companyName={companyName}
            address={address}
            gstNumber={gstNo}
            mobileNumber={mobile}
            lineItems={lineItems}
            gstSlab={gstRate}
            totalPrice={grandTotal}
            branding={previewBranding}
          />

          <div className="table-shell table-shell-editor">
            <table className="invoice-table invoice-editor-table responsive-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Rate</th>
                  <th>Quantity</th>
                  <th>Total</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={index}>
                    <td data-label="Product">
                      <input
                        value={item.product}
                        onChange={(e) => handleLineItemChange(index, "product", e.target.value)}
                        placeholder="Product name"
                      />
                    </td>
                    <td data-label="Rate">
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => handleLineItemChange(index, "rate", e.target.value)}
                        placeholder="Rate"
                      />
                    </td>
                    <td data-label="Quantity">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(index, "quantity", e.target.value)}
                        placeholder="Qty"
                      />
                    </td>
                    <td data-label="Total">
                      <input value={item.total} disabled />
                    </td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeRow(index)}
                        title="Remove row"
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-editor-footer">
            <button type="button" className="add-row-btn" onClick={addRow}>
              + Add Row
            </button>

            <div className="invoice-summary-grid">
              <div className="summary-field">
                <label htmlFor="gst-rate">GST Dropdown</label>
                <select
                  id="gst-rate"
                  value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                >
                  <option value="5">GST 5%</option>
                  <option value="12">GST 12%</option>
                  <option value="18">GST 18%</option>
                  <option value="28">GST 28%</option>
                </select>
              </div>

              <div className="summary-field">
                <label>Total</label>
                <input value={grandTotal} disabled />
              </div>
            </div>
          </div>

          <div className="amount-words">
            <label>Amount in words</label>
            <input value={numberToWords(grandTotal)} disabled />
          </div>

          <div className="btn-row">
            <button className="save-btn" onClick={handleSave} disabled={saveLoading}>
              {saveLoading ? (isEditingInvoice ? "Updating..." : "Saving...") : isEditingInvoice ? "Update Invoice" : "Save Invoice"}
            </button>
            <button className="download-btn" onClick={handleDownloadPDF} disabled={saveLoading}>
              Download as PDF
            </button>
          </div>
        </>
      ) : (
        <div className="history-panel">
          <div className="history-panel-header">
            <div>
              <h4>Previous Invoices</h4>
              <small>Your saved invoices are shown newest first.</small>
            </div>
            <button
              type="button"
              className="secondary-btn toolbar-btn"
              onClick={() => fetchInvoiceHistory()}
              disabled={!loggedInUser?._id || historyLoading}
            >
              {historyLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {historyError ? <div className="history-message">{historyError}</div> : null}

          {historyLoading ? (
            <div className="history-empty-state">Loading invoice history...</div>
          ) : historyInvoices.length === 0 ? (
            <div className="history-empty-state">No invoices saved yet for this account.</div>
          ) : (
            <>
              <div className="table-shell table-shell-history">
                <table className="invoice-table history-table responsive-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {historyInvoices.map((invoice) => (
                      <tr key={invoice._id}>
                        <td data-label="Invoice">
                          <div className="history-invoice-copy">
                            <strong>{invoice.invoiceNumber}</strong>
                            <small>{getBrandingTemplate(invoice.branding?.templateKey).name}</small>
                          </div>
                        </td>
                        <td data-label="Date">{formatDateTime(invoice.createdAt)}</td>
                        <td data-label="Items">{invoice.lineItems.length}</td>
                        <td data-label="Total">{formatCurrency(invoice.totalPrice)}</td>
                        <td data-label="Actions">
                          <div className="history-actions">
                            <button
                              type="button"
                              className={`secondary-btn history-view-btn ${
                                selectedHistoryInvoice?._id === invoice._id ? "history-active" : ""
                              }`}
                              onClick={() => setSelectedHistoryInvoice(invoice)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="edit-btn"
                              onClick={() => openInvoiceForEditing(invoice)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="download-btn history-download-btn"
                              onClick={() => downloadInvoicePdf(invoice)}
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedHistoryInvoice ? (
                <div className="history-detail">
                  <div className="history-detail-header">
                    <div>
                      <h4>Invoice Preview</h4>
                      <small>
                        Theme:{" "}
                        {getBrandingTemplate(selectedHistoryInvoice.branding?.templateKey).name}
                      </small>
                    </div>

                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() => openInvoiceForEditing(selectedHistoryInvoice)}
                    >
                      Edit This Invoice
                    </button>
                  </div>

                  <InvoiceDocumentPreview
                    invoiceNumber={selectedHistoryInvoice.invoiceNumber}
                    customerName={selectedHistoryInvoice.customerId?.name || name}
                    companyName={selectedHistoryInvoice.companyName}
                    address={selectedHistoryInvoice.customerId?.address || address}
                    gstNumber={selectedHistoryInvoice.customerId?.gstNumber || gstNo}
                    mobileNumber={selectedHistoryInvoice.customerId?.mobileNumber || mobile}
                    lineItems={selectedHistoryInvoice.lineItems}
                    gstSlab={selectedHistoryInvoice.gstSlab}
                    totalPrice={selectedHistoryInvoice.totalPrice}
                    branding={selectedHistoryInvoice.branding}
                    createdAt={selectedHistoryInvoice.createdAt}
                  />

                  <div className="btn-row history-detail-actions">
                    <button
                      type="button"
                      className="download-btn"
                      onClick={() => downloadInvoicePdf(selectedHistoryInvoice)}
                    >
                      Download This Invoice
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function numberToWords(num) {
  if (num === 0 || num === "") return "";

  const wholeNumber = Math.round(Number(num));

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  function convert(n) {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "");
    }
    return (
      ones[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 ? ` ${convert(n % 100)}` : "")
    );
  }

  const parts = [];
  let remaining = wholeNumber;
  let scaleIndex = 0;

  while (remaining > 0) {
    const part = remaining % 1000;
    if (part !== 0) {
      const words = convert(part);
      parts.unshift(scales[scaleIndex] ? `${words} ${scales[scaleIndex]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex++;
  }

  return `${parts.join(" ").trim()} Only`;
}
