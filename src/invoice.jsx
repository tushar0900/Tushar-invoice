import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import html2pdf from "html2pdf.js";
import API_BASE_URL from "./api";
import { clearAuthUser, getAuthUser, setAuthUser } from "./authStorage";
import "./App.css";

function createLineItem() {
  return { product: "", rate: 0, quantity: 0, total: 0 };
}

function createInitialLineItems() {
  return [createLineItem()];
}

export default function Invoice() {
  const navigate = useNavigate();
  const invoiceRef = useRef(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [lineItems, setLineItems] = useState(createInitialLineItems);
  const [gstRate, setGstRate] = useState(5);
  const [activeView, setActiveView] = useState("create");
  const [historyInvoices, setHistoryInvoices] = useState([]);
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const gstAmount = (subtotal * gstRate) / 100;
  const grandTotal = subtotal + gstAmount;

  useEffect(() => {
    generateInvoiceNumber();
  }, []);

  useEffect(() => {
    let isActive = true;

    const hydrateLoggedInUser = async () => {
      const storedUser = getAuthUser();
      if (!storedUser) {
        navigate("/login");
        return;
      }

      if (storedUser._id) {
        if (isActive) {
          applyLoggedInCustomer(storedUser);
        }
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/customers/mobile/${storedUser.mobileNumber}`
        );
        const hydratedUser = {
          _id: response.data._id,
          name: response.data.name,
          mobileNumber: response.data.mobileNumber,
          address: response.data.address,
          gstNumber: response.data.gstNumber,
        };

        setAuthUser(hydratedUser);
        if (isActive) {
          applyLoggedInCustomer(hydratedUser);
        }
      } catch (error) {
        clearAuthUser();
        if (isActive) {
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

    fetchInvoiceHistory(loggedInUser._id);
  }, [loggedInUser?._id]);

  const applyLoggedInCustomer = (user) => {
    setLoggedInUser(user);
    setMobile(user.mobileNumber || "");
    setName(user.name || "");
    setAddress(user.address || "");
    setGstNo(user.gstNumber || "");
  };

  const generateInvoiceNumber = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/generate/number`);
      setInvoiceNo(response.data.invoiceNumber);
    } catch (error) {
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

  const fetchInvoiceHistory = async (customerId) => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/customer/${customerId}`);
      setHistoryInvoices(response.data);
      setSelectedHistoryInvoice((currentSelection) => {
        if (!response.data.length) {
          return null;
        }

        if (!currentSelection) {
          return response.data[0];
        }

        return (
          response.data.find((invoice) => invoice._id === currentSelection._id) ||
          response.data[0]
        );
      });
    } catch (error) {
      setHistoryError(
        error.response?.data?.error || "Unable to load invoice history. Please try again."
      );
    } finally {
      setHistoryLoading(false);
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
    await generateInvoiceNumber();
  };

  const buildHistoryMarkup = (invoice) => {
    const invoiceSubtotal = invoice.lineItems.reduce((sum, item) => sum + Number(item.total), 0);
    const invoiceGstAmount = (invoiceSubtotal * Number(invoice.gstSlab)) / 100;
    const invoiceCustomer = invoice.customerId || loggedInUser || {};

    return `
      <div style="padding:20px;background:#fff;color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="margin:0 0 10px;font-size:28px;font-weight:700;">INVOICE</h1>
          <p style="margin:0;font-size:14px;color:#666;">
            Invoice #: <strong>${invoice.invoiceNumber}</strong>
          </p>
        </div>
        <div style="margin-bottom:20px;display:flex;gap:10px;align-items:center;">
          <strong style="min-width:140px;">Invoice Number:</strong>
          <span>${invoice.invoiceNumber}</span>
        </div>
        <div style="border:1px solid #e6eaec;border-left:4px solid #2c7a7b;border-radius:10px;padding:18px;margin-bottom:20px;background:#f7f8f9;">
          <h4 style="margin:0 0 14px;color:#225e60;text-transform:uppercase;font-size:16px;">Customer Information</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div><strong>Name:</strong><br />${invoiceCustomer.name || name}</div>
            <div><strong>Company Name:</strong><br />${invoice.companyName || "-"}</div>
            <div><strong>Address:</strong><br />${invoiceCustomer.address || address}</div>
            <div><strong>GST Number:</strong><br />${invoiceCustomer.gstNumber || gstNo}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr>
              <th style="padding:12px 10px;border-bottom:2px solid #e6eaec;text-align:left;">Product</th>
              <th style="padding:12px 10px;border-bottom:2px solid #e6eaec;text-align:left;">Rate</th>
              <th style="padding:12px 10px;border-bottom:2px solid #e6eaec;text-align:left;">Quantity</th>
              <th style="padding:12px 10px;border-bottom:2px solid #e6eaec;text-align:left;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lineItems
              .map(
                (item) => `
                  <tr>
                    <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;">${item.product}</td>
                    <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;">Rs. ${Number(item.rate).toFixed(2)}</td>
                    <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;">${item.quantity}</td>
                    <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;">Rs. ${Number(item.total).toFixed(2)}</td>
                  </tr>
                `
              )
              .join("")}
            <tr>
              <td colspan="2"></td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;">Subtotal:</td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;">Rs. ${invoiceSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;">GST (${invoice.gstSlab}%):</td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;">Rs. ${invoiceGstAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;background:#f0f0f0;">Grand Total:</td>
              <td style="padding:12px 10px;border-bottom:1px solid #e6eaec;font-weight:700;background:#f0f0f0;">Rs. ${Number(invoice.totalPrice).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div style="border:1px solid #e6eaec;border-radius:10px;padding:18px;background:#f7f8f9;">
          <strong style="display:block;margin-bottom:10px;">Amount in words</strong>
          <div>${numberToWords(Number(invoice.totalPrice))}</div>
        </div>
      </div>
    `;
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

    try {
      const response = await axios.post(`${API_BASE_URL}/api/invoices`, {
        invoiceNumber: invoiceNo,
        companyName: companyName.trim(),
        lineItems,
        gstSlab: gstRate,
        totalPrice: grandTotal,
        customerMobileNumber: loggedInUser.mobileNumber,
      });

      const savedInvoice = {
        ...response.data,
        companyName: response.data.companyName || companyName.trim(),
        customerId: {
          _id: loggedInUser._id,
          name: loggedInUser.name,
          mobileNumber: loggedInUser.mobileNumber,
          address: loggedInUser.address,
          gstNumber: loggedInUser.gstNumber,
        },
      };

      setHistoryInvoices((currentInvoices) => [savedInvoice, ...currentInvoices]);
      setSelectedHistoryInvoice(savedInvoice);
      setActiveView("history");
      await resetInvoiceForm();
      fetchInvoiceHistory(loggedInUser._id);
      alert("Invoice saved successfully");
    } catch (error) {
      alert(error.response?.data?.error || `Error saving invoice: ${error.message}`);
    }
  };

  const handleDownloadPDF = () => {
    if (!invoiceNo || !loggedInUser?.mobileNumber || lineItems.length === 0) {
      alert("Please fill all required fields and save invoice first");
      return;
    }

    const element = invoiceRef.current;
    const options = {
      margin: 10,
      filename: `Invoice-${invoiceNo}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
    };

    html2pdf().set(options).from(element).save();
  };

  const handleLogout = () => {
    clearAuthUser();
    navigate("/login");
  };

  const selectedHistorySubtotal = selectedHistoryInvoice
    ? selectedHistoryInvoice.lineItems.reduce((sum, item) => sum + item.total, 0)
    : 0;
  const selectedHistoryGst = selectedHistoryInvoice
    ? (selectedHistorySubtotal * selectedHistoryInvoice.gstSlab) / 100
    : 0;

  return (
    <div className="annexure">
      <div className="page-toolbar">
        <div>
          <h2>{activeView === "history" ? "Invoice History" : "Generate Invoice"}</h2>
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
            onClick={() => setActiveView("history")}
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

          <div ref={invoiceRef} className="invoice-preview">
            <div className="invoice-preview-header">
              <h1>INVOICE</h1>
              <p>
                Invoice #: <strong>{invoiceNo}</strong>
              </p>
            </div>

            <div className="row single">
              <label>Invoice Number:</label>
              <input value={invoiceNo} disabled />
            </div>

            <div className="customer-details-box">
              <h4>Customer Information</h4>
              <div className="details-grid">
                <div className="detail-item">
                  <label>Name:</label>
                  <span>{name}</span>
                </div>
                <div className="detail-item">
                  <label>Company Name:</label>
                  <span>{companyName || "-"}</span>
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
            </div>

            <table className="invoice-table">
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
                    <td>{item.product}</td>
                    <td>Rs. {item.rate.toFixed(2)}</td>
                    <td>{item.quantity}</td>
                    <td>Rs. {item.total.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td colSpan="2"></td>
                  <td>Subtotal:</td>
                  <td>Rs. {subtotal.toFixed(2)}</td>
                </tr>
                <tr className="totals-row">
                  <td colSpan="2"></td>
                  <td>GST ({gstRate}%):</td>
                  <td>Rs. {gstAmount.toFixed(2)}</td>
                </tr>
                <tr className="totals-row total-highlight">
                  <td colSpan="2"></td>
                  <td>Grand Total:</td>
                  <td>Rs. {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div className="amount-words">
              <label>Amount in words:</label>
              <p className="amount-words-copy">{numberToWords(grandTotal)}</p>
            </div>
          </div>

          <table className="invoice-table">
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
                  <td>
                    <input
                      value={item.product}
                      onChange={(e) => handleLineItemChange(index, "product", e.target.value)}
                      placeholder="Product name"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => handleLineItemChange(index, "rate", e.target.value)}
                      placeholder="Rate"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleLineItemChange(index, "quantity", e.target.value)}
                      placeholder="Qty"
                    />
                  </td>
                  <td>
                    <input value={item.total} disabled />
                  </td>
                  <td>
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

              <tr>
                <td colSpan="5">
                  <button type="button" className="add-row-btn" onClick={addRow}>
                    + Add Row
                  </button>
                </td>
              </tr>

              <tr>
                <td colSpan="2">
                  <strong>GST Dropdown</strong>
                </td>
                <td>
                  <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))}>
                    <option value="5">GST 5%</option>
                    <option value="12">GST 12%</option>
                    <option value="18">GST 18%</option>
                    <option value="28">GST 28%</option>
                  </select>
                </td>
                <td colSpan="2">
                  <strong>Total</strong>
                  <input value={grandTotal} disabled style={{ marginTop: "5px" }} />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="amount-words">
            <label>Amount in words</label>
            <input value={numberToWords(grandTotal)} disabled />
          </div>

          <div className="btn-row">
            <button className="save-btn" onClick={handleSave}>
              SAVE
            </button>
            <button className="download-btn" onClick={handleDownloadPDF}>
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
              onClick={() => fetchInvoiceHistory(loggedInUser?._id)}
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
              <table className="invoice-table history-table">
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
                      <td>{invoice.invoiceNumber}</td>
                      <td>{formatDateTime(invoice.createdAt)}</td>
                      <td>{invoice.lineItems.length}</td>
                      <td>Rs. {Number(invoice.totalPrice).toFixed(2)}</td>
                      <td>
                        <div className="history-actions">
                          <button
                            type="button"
                            className={`edit-btn ${
                              selectedHistoryInvoice?._id === invoice._id ? "history-active" : ""
                            }`}
                            onClick={() => setSelectedHistoryInvoice(invoice)}
                          >
                            View
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

              {selectedHistoryInvoice ? (
                <div className="history-detail">
                  <div className="customer-details-box">
                    <h4>Invoice Details</h4>
                    <div className="details-grid">
                      <div className="detail-item">
                        <label>Invoice Number:</label>
                        <span>{selectedHistoryInvoice.invoiceNumber}</span>
                      </div>
                      <div className="detail-item">
                        <label>Created On:</label>
                        <span>{formatDateTime(selectedHistoryInvoice.createdAt)}</span>
                      </div>
                      <div className="detail-item">
                        <label>Customer Name:</label>
                        <span>{selectedHistoryInvoice.customerId?.name || name}</span>
                      </div>
                      <div className="detail-item">
                        <label>Company Name:</label>
                        <span>{selectedHistoryInvoice.companyName || "-"}</span>
                      </div>
                      <div className="detail-item">
                        <label>Mobile Number:</label>
                        <span>{selectedHistoryInvoice.customerId?.mobileNumber || mobile}</span>
                      </div>
                    </div>
                  </div>

                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Rate</th>
                        <th>Quantity</th>
                        <th>Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedHistoryInvoice.lineItems.map((item, index) => (
                        <tr key={`${item.product}-${index}`}>
                          <td>{item.product}</td>
                          <td>Rs. {Number(item.rate).toFixed(2)}</td>
                          <td>{item.quantity}</td>
                          <td>Rs. {Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="totals-row">
                        <td colSpan="2"></td>
                        <td>Subtotal:</td>
                        <td>Rs. {selectedHistorySubtotal.toFixed(2)}</td>
                      </tr>
                      <tr className="totals-row">
                        <td colSpan="2"></td>
                        <td>GST ({selectedHistoryInvoice.gstSlab}%):</td>
                        <td>Rs. {selectedHistoryGst.toFixed(2)}</td>
                      </tr>
                      <tr className="totals-row total-highlight">
                        <td colSpan="2"></td>
                        <td>Grand Total:</td>
                        <td>Rs. {Number(selectedHistoryInvoice.totalPrice).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="amount-words">
                    <label>Amount in words</label>
                    <input value={numberToWords(Number(selectedHistoryInvoice.totalPrice))} disabled />
                  </div>

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
