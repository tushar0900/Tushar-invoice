const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const API_BASE_URL = (
  envApiBaseUrl ||
  (import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://tushar-invoice.onrender.com")
).replace(/\/+$/, "");

export default API_BASE_URL;
