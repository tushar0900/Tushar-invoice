import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loadUsers, setAuthUser } from "./authStorage";
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

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = formData.name.trim();
    const password = formData.password;

    if (!name || !password) {
      alert("Customer name and password are required");
      return;
    }

    const users = loadUsers();
    const match = users.find(
      (user) => user.name.toLowerCase() === name.toLowerCase() && user.password === password
    );

    if (!match) {
      alert("Invalid name or password");
      return;
    }

    setAuthUser({
      name: match.name,
      mobileNumber: match.mobileNumber,
      address: match.address,
      gstNumber: match.gstNumber,
    });

    navigate("/invoice");
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
