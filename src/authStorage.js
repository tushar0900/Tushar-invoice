const AUTH_KEY = "invoice_auth_user";

export function setAuthUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to parse auth user", err);
    return null;
  }
}

export function clearAuthUser() {
  localStorage.removeItem(AUTH_KEY);
}
