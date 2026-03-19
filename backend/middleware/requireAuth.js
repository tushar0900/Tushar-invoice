import Customer from "../models/customer.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../utils/auth.js";

function getBearerToken(req) {
  const authorizationHeader = req.get("authorization") || "";

  if (!authorizationHeader.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || getBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = verifyAuthToken(token);
    const customer = await Customer.findById(payload.customerId);

    if (!customer) {
      return res.status(401).json({ error: "Authentication required." });
    }

    req.auth = {
      customerId: customer.id,
      mobileNumber: customer.mobileNumber,
    };
    req.customer = customer;
    next();
  } catch {
    return res.status(401).json({ error: "Authentication required." });
  }
}
