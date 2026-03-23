import axios from "axios";
import { clearAuthSession, getAuthToken } from "./authStorage";

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const localApiHostname =
  typeof window !== "undefined" && window.location.hostname === "127.0.0.1"
    ? "127.0.0.1"
    : "localhost";

const API_BASE_URL = (
  envApiBaseUrl ||
  (import.meta.env.DEV
    ? `http://${localApiHostname}:5000`
    : "https://tushar-invoice.onrender.com")
).replace(/\/+$/, "");

axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = config.headers.Authorization || `Bearer ${token}`;
  }

  return config;
});
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
    }

    return Promise.reject(error);
  }
);

export default API_BASE_URL;
