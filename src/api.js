import axios from "axios";

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const API_BASE_URL = (
  envApiBaseUrl ||
  (import.meta.env.DEV
    ? "http://127.0.0.1:5000"
    : "https://tushar-invoice.onrender.com")
).replace(/\/+$/, "");

axios.defaults.withCredentials = true;

export default API_BASE_URL;
