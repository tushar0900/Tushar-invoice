import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./api";
import { setAuthUser } from "./authStorage";
import "./App.css";

function PasswordVisibilityIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6 6.2A10.6 10.6 0 0 1 12 6c5.5 0 9 6 9 6a18 18 0 0 1-3.1 3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.7 6.7C4.4 8.2 3 12 3 12s3.5 6 9 6c1.5 0 2.9-.4 4.1-1.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
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
        <div className="field-stack">
          <div className="input-with-action">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              className="input-inline-action"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((currentValue) => !currentValue)}
            >
              <PasswordVisibilityIcon visible={showPassword} />
            </button>
          </div>
        </div>
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
