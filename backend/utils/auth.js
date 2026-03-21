import jwt from "jsonwebtoken";

export const AUTH_COOKIE_NAME = "invoice_auth";

const isProduction = process.env.NODE_ENV === "production";
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || "12h";
const AUTH_COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 12 * 60 * 60 * 1000);
const DEVELOPMENT_JWT_SECRET = "development-only-jwt-secret-change-me";

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (isProduction) {
    throw new Error(
      "JWT_SECRET is required in production. Set it in your deployment environment and redeploy."
    );
  }

  return DEVELOPMENT_JWT_SECRET;
}

export function assertAuthConfiguration() {
  getJwtSecret();
}

export function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: AUTH_TOKEN_TTL });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getAuthCookieOptions(),
    maxAge: undefined,
  });
}
