import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./api";
import "./App.css";

const passwordPolicy =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,72}$/;
const passwordPolicyMessage =
  "Password must be 12 to 72 characters and include uppercase, lowercase, number, and special character.";

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

export default function Signup() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
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

    if (!passwordPolicy.test(cleaned.password)) {
      alert(passwordPolicyMessage);
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/customers`, {
        mobileNumber: cleaned.mobileNumber,
        name: cleaned.name,
        password: cleaned.password,
        address: cleaned.address,
        gstNumber: cleaned.gstNumber,
      });
      alert("Registration successful. Please login.");
      navigate("/login", { state: { registeredName: cleaned.name } });
    } catch (error) {
      if (
        error.response?.status === 400 ||
        error.response?.status === 409 ||
        error.response?.status === 429
      ) {
        alert(error.response?.data?.error || "Unable to complete registration.");
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
        <div className="field-stack">
          <div className="input-with-action">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              maxLength={72}
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
          <small className="field-hint">
            Use 12 to 72 characters with uppercase, lowercase, number, and special character.
          </small>
        </div>
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
