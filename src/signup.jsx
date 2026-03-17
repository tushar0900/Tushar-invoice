import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./api";
import { loadUsers, saveUsers } from "./authStorage";
import "./App.css";

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    mobileNumber: "",
    name: "",
    password: "",
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

    const cleaned = {
      mobileNumber: formData.mobileNumber.trim(),
      name: formData.name.trim(),
      password: formData.password,
      address: formData.address.trim(),
      gstNumber: formData.gstNumber.trim(),
    };

    if (!cleaned.mobileNumber || !cleaned.name || !cleaned.password) {
      alert("Mobile number, name, and password are required");
      return;
    }

    const users = loadUsers();
    const normalizedName = cleaned.name.toLowerCase();

    if (users.some((user) => user.name.toLowerCase() === normalizedName)) {
      alert("Name already registered. Please login.");
      return;
    }

    if (users.some((user) => user.mobileNumber === cleaned.mobileNumber)) {
      alert("Mobile number already registered. Please login.");
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/customers`, {
        mobileNumber: cleaned.mobileNumber,
        name: cleaned.name,
        address: cleaned.address,
        gstNumber: cleaned.gstNumber,
      });

      const newUser = {
        name: cleaned.name,
        password: cleaned.password,
        mobileNumber: cleaned.mobileNumber,
        address: cleaned.address,
        gstNumber: cleaned.gstNumber,
      };

      saveUsers([...users, newUser]);
      alert("Registration successful. Please login.");
      navigate("/login", { state: { registeredName: cleaned.name } });
    } catch (error) {
      if (error.response?.status === 400) {
        alert(error.response?.data?.error || "Error: Mobile number already exists");
      } else if (!error.response) {
        alert("Unable to reach server. Please try again.");
      } else {
        alert("Error: " + (error.response?.data?.error || error.message));
      }
    }
  };

  return (
    <form className="customer-form" onSubmit={handleSubmit}>
      <h3>Customer Sign Up</h3>

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
        <label>Password:</label>
        <input
          type="password"
          name="password"
          value={formData.password}
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
          required
        />
      </div>

      <div className="row">
        <label>GST Number:</label>
        <input
          name="gstNumber"
          value={formData.gstNumber}
          onChange={handleChange}
          maxLength={15}
          required
        />
      </div>

      <div className="button-group">
        <button type="submit">SIGN UP</button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => navigate("/login")}
        >
          Go to Login
        </button>
      </div>
    </form>
  );
}
