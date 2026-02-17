import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./api";
import "./App.css";

export default function Customer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    mobileNumber: "",
    name: "",
    address: "",
    gstNumber: "",
  });
  

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.mobileNumber || !formData.name) {
      alert("Mobile number and name are required");
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/customers`, formData);
      alert("Customer added successfully");

      setFormData({
        mobileNumber: "",
        name: "",
        address: "",
        gstNumber: "",
      });

      // Auto-redirect to invoice page if coming from there
      if (location.state?.from === "invoice") {
        setTimeout(() => navigate("/invoice"), 500);
      }
    } catch (error) {
      if (error.response?.status === 400) {
        alert("Error: Mobile number already exists");
      } else {
        alert("Error: " + error.message);
      }
    }
  };

  return (
    <form className="customer-form" onSubmit={handleSubmit}>
      <h3>Customer Details</h3>

      <div className="row">
        <label>Customer Mobile Number:</label>
        <input
          type="text"
          name="mobileNumber"
          value={formData.mobileNumber}
          onChange={handleChange}
          required
        />
      </div>

      <div className="row">
        <label>Name:</label>
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="row">
        <label>Address:</label>
        <input
          name="address"
          value={formData.address}
          onChange={handleChange}
        />
      </div>

      <div className="row">
        <label>GST Number:</label>
        <input
          name="gstNumber"
          value={formData.gstNumber}
          onChange={handleChange}
          maxLength={15}
        />
      </div>

      <div className="button-group">
        <button type="submit">SAVE</button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => navigate("/invoice")}
        >
          Go to Invoice
        </button>
      </div>

      {/* Removed customer list view - customers are added via the form only */}
    </form>
  );
}
