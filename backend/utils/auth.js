import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import AppConfig from "../models/appConfig.js";

export const AUTH_COOKIE_NAME = "invoice_auth";

const isProduction = process.env.NODE_ENV === "production";
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || "12h";
const AUTH_COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 12 * 60 * 60 * 1000);
const DEVELOPMENT_JWT_SECRET = "development-only-jwt-secret-change-me";
const AUTH_CONFIG_KEY = "auth";
let cachedJwtSecret = process.env.JWT_SECRET || "";

function generateJwtSecret() {
  return crypto.randomBytes(32).toString("base64");
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  if (isProduction) {
    throw new Error("JWT secret has not been initialized yet.");
  }

  return DEVELOPMENT_JWT_SECRET;
}

export async function initializeAuthConfiguration() {
  if (process.env.JWT_SECRET) {
    cachedJwtSecret = process.env.JWT_SECRET;
    return cachedJwtSecret;
  }

  if (!isProduction) {
    cachedJwtSecret = DEVELOPMENT_JWT_SECRET;
    return cachedJwtSecret;
  }

  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const config = await AppConfig.findOneAndUpdate(
    { key: AUTH_CONFIG_KEY },
    {
      $setOnInsert: {
        key: AUTH_CONFIG_KEY,
        jwtSecret: generateJwtSecret(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  ).lean();

  if (!config?.jwtSecret) {
    throw new Error("Unable to initialize JWT secret.");
  }

  cachedJwtSecret = config.jwtSecret;
  console.warn(
    "JWT_SECRET is not set in production. Using a MongoDB-backed secret. Set JWT_SECRET in your deployment environment to manage it explicitly."
  );
  return cachedJwtSecret;
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
