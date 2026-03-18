import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./api";
import { setAuthUser } from "./authStorage";
import "./App.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    name: location.state?.registeredName || "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const password = formData.password;

    if (!name || !password) {
      alert("Customer name and password are required");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/customers/login`, {
        name,
        password,
      });

      setAuthUser({
        _id: response.data._id,
        name: response.data.name,
        companyName: response.data.companyName,
        mobileNumber: response.data.mobileNumber,
        address: response.data.address,
        gstNumber: response.data.gstNumber,
      });

      navigate("/invoice");
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        alert(error.response?.data?.error || "Invalid name or password");
        return;
      }

      if (!error.response) {
        alert("Unable to reach server. Please try again.");
        return;
      }

      alert("Error: " + (error.response?.data?.error || error.message));
    }
  };

  return (
    <form className="customer-form" onSubmit={handleSubmit}>
      <h3>Customer Login</h3>

      <div className="row">
        <label>Customer Name:</label>
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

      <div className="button-group">
        <button type="submit">LOGIN</button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => navigate("/signup")}
        >
          Create Account
        </button>
      </div>
    </form>
  );
}
