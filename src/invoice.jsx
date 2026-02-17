import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import html2pdf from "html2pdf.js";
import API_BASE_URL from "./api";
import "./App.css";

export default function Invoice() {
  const navigate = useNavigate();
  const invoiceRef = useRef(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstNo, setGstNo] = useState("");

  const [lineItems, setLineItems] = useState([
    { product: "", rate: 0, quantity: 0, total: 0 },
  ]);
  const [gstRate, setGstRate] = useState(5);

  // Generate invoice number on component mount
  useEffect(() => {
    generateInvoiceNumber();
  }, []);

  // Generate next invoice number
  const generateInvoiceNumber = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/invoices/generate/number`);
      setInvoiceNo(res.data.invoiceNumber);
    } catch (error) {
      console.error("Error generating invoice number (backend failed):", error);
      // Fallback: generate a timestamp-based invoice number so UI still shows a value
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const fallback = `INV-${y}${m}${d}${hh}${mm}${ss}`;
      setInvoiceNo(fallback);
    }
  };

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const gstAmount = (subtotal * gstRate) / 100;
  const grandTotal = subtotal + gstAmount;

  // Fetch customer by mobile number
  const fetchCustomer = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/customers/mobile/${mobile}`);
      setName(res.data.name);
      setAddress(res.data.address);
      setGstNo(res.data.gstNumber);
    } catch {
      setName("");
      setAddress("");
      setGstNo("");
      alert("Customer not found");
    }
  };

  // Clear customer details
  const clearCustomer = () => {
    setMobile("");
    setName("");
    setAddress("");
    setGstNo("");
  };

  // Handle line item change
  const handleLineItemChange = (index, field, value) => {
    const updatedItems = [...lineItems];
    updatedItems[index][field] = field === "product" ? value : Number(value);
    
    // Calculate total for this row
    if (field === "rate" || field === "quantity") {
      updatedItems[index].total = updatedItems[index].rate * updatedItems[index].quantity;
    }
    
    setLineItems(updatedItems);
  };

  // Add new row
  const addRow = () => {
    setLineItems([...lineItems, { product: "", rate: 0, quantity: 0, total: 0 }]);
  };

  // Remove row
  const removeRow = (index) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    } else {
      alert("Invoice must have at least one line item");
    }
  };

  // Save invoice
  const handleSave = async (e) => {
    e.preventDefault();

    if (!invoiceNo || !mobile || lineItems.length === 0) {
      alert("Please fill all required fields");
      return;
    }

    // Validate line items
    const validItems = lineItems.every(
      item => item.product && item.rate > 0 && item.quantity > 0
    );

    if (!validItems) {
      alert("Please fill all line item details (Product, Rate, Quantity)");
      return;
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/invoices`,
        {
          invoiceNumber: invoiceNo,
          lineItems: lineItems,
          gstSlab: gstRate,
          totalPrice: grandTotal,
          customerMobileNumber: mobile,
        }
      );

      alert("Invoice saved successfully");

      // Reset form
      setInvoiceNo("");
      setMobile("");
      setName("");
      setAddress("");
      setGstNo("");
      setLineItems([{ product: "", rate: 0, quantity: 0, total: 0 }]);
      setGstRate(5);
    } catch (error) {
      alert("Error saving invoice: " + error.message);
    }
  };

  // Download invoice as PDF
  const handleDownloadPDF = () => {
    if (!invoiceNo || !mobile || lineItems.length === 0) {
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

  return (
    <div className="annexure">
      <h2 className="center">Generate Invoice</h2>

      {/* Content for PDF Export */}
      <div ref={invoiceRef} style={{ padding: "20px", backgroundColor: "#fff" }}>
        {/* Invoice Header */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h1 style={{ margin: "0 0 10px 0", fontSize: "28px", fontWeight: "bold" }}>
            INVOICE
          </h1>
          <p style={{ margin: "0", fontSize: "14px", color: "#666" }}>
            Invoice #: <strong>{invoiceNo}</strong>
          </p>
        </div>

        {/* Invoice Number */}
        <div className="row single">
          <label>Invoice Number:</label>
          <input
            value={invoiceNo}
            disabled
            style={{ backgroundColor: "#f5f5f5", cursor: "not-allowed" }}
          />
        </div>

        {/* Customer Details Display */}
        {(name || address || gstNo) && (
          <div className="customer-details-box">
            <h4>Customer Information</h4>
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
          </div>
        )}

        {/* Product Table */}
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
              <tr key={index}>
                <td>{item.product}</td>
                <td>₹{item.rate.toFixed(2)}</td>
                <td>{item.quantity}</td>
                <td>₹{item.total.toFixed(2)}</td>
              </tr>
            ))}

            {/* GST Row */}
            <tr style={{ fontWeight: "bold" }}>
              <td colSpan="2"></td>
              <td>Subtotal:</td>
              <td>₹{subtotal.toFixed(2)}</td>
            </tr>
            <tr style={{ fontWeight: "bold" }}>
              <td colSpan="2"></td>
              <td>GST ({gstRate}%):</td>
              <td>₹{gstAmount.toFixed(2)}</td>
            </tr>
            <tr style={{ fontWeight: "bold", backgroundColor: "#f0f0f0" }}>
              <td colSpan="2"></td>
              <td>Grand Total:</td>
              <td>₹{grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount in Words */}
        <div className="amount-words">
          <label>Amount in words:</label>
          <p style={{ margin: "5px 0 0 0", fontSize: "14px" }}>
            {numberToWords(grandTotal)}
          </p>
        </div>
      </div>

      {/* Customer Selection Section */}
      <div className="customer-selection">
        <h4>Enter Customer Details</h4>
        
        <div className="row">
          <label>Customer Mobile Number</label>
          <input
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            placeholder="Enter customer mobile number"
          />
          <button
            type="button"
            className="fetch-btn"
            onClick={fetchCustomer}
            title="Fetch customer details"
          >
            Fetch
          </button>
          <button
            type="button"
            className="clear-btn"
            onClick={clearCustomer}
            title="Clear customer details"
          >
            Clear
          </button>
        </div>

        <div className="add-customer-link">
          <small>
            Don't have a customer yet?{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => navigate("/", { state: { from: "invoice" } })}
            >
              Add New Customer
            </button>
          </small>
        </div>
      </div>

      {/* Customer Details Display */}
      {(name || address || gstNo) && (
        <div className="customer-details-box">
          <h4>Customer Information</h4>
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
        </div>
      )}

      {/* Product Table */}
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
                  onChange={e => handleLineItemChange(index, "product", e.target.value)}
                  placeholder="Product name"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={item.rate}
                  onChange={e => handleLineItemChange(index, "rate", e.target.value)}
                  placeholder="Rate"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={e => handleLineItemChange(index, "quantity", e.target.value)}
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
                  ✕
                </button>
              </td>
            </tr>
          ))}

          {/* Add Row Button */}
          <tr>
            <td colSpan="5">
              <button
                type="button"
                className="add-row-btn"
                onClick={addRow}
              >
                + Add Row
              </button>
            </td>
          </tr>

          {/* GST Row */}
          <tr>
            <td colSpan="2">
              <strong>GST Dropdown</strong>
            </td>
            <td>
              <select
                value={gstRate}
                onChange={e => setGstRate(Number(e.target.value))}
              >
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

      {/* Amount in Words */}
      <div className="amount-words">
        <label>Amount in words</label>
        <input value={numberToWords(grandTotal)} disabled />
      </div>

      {/* Save and Download Buttons */}
      <div className="btn-row">
        <button className="save-btn" onClick={handleSave}>SAVE</button>
        <button className="download-btn" onClick={handleDownloadPDF}>
          📥 Download as PDF
        </button>
      </div>
    </div>
  );
}

/* Number to words conversion */
function numberToWords(num) {
  if (num === 0 || num === "") return "";
  
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
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
  }

  const parts = [];
  let scaleIndex = 0;

  while (num > 0) {
    const part = num % 1000;
    if (part !== 0) {
      const words = convert(part);
      if (scales[scaleIndex]) {
        parts.unshift(words + " " + scales[scaleIndex]);
      } else {
        parts.unshift(words);
      }
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return parts.join(" ").trim() + " Only";
}
