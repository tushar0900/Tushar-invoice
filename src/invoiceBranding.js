const BRANDING_STORAGE_KEY = "invoice-branding-preferences";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const BRANDING_TEMPLATES = [
  {
    key: "professional",
    name: "Professional Slate",
    description: "Balanced and formal for GST billing and B2B invoices.",
    accent: "#2C7A7B",
    accentStrong: "#225E60",
    background: "#F5FBFB",
    border: "#D8E9E9",
    bannerStart: "#EDF9F8",
    bannerEnd: "#D9ECEB",
  },
  {
    key: "retail",
    name: "Retail Glow",
    description: "Warmer styling for stores, counters, and walk-in sales.",
    accent: "#D97706",
    accentStrong: "#B45309",
    background: "#FFF8EF",
    border: "#F4DFC1",
    bannerStart: "#FFF1DB",
    bannerEnd: "#FFE0B2",
  },
  {
    key: "studio",
    name: "Studio Coral",
    description: "Sharper visual identity for agencies and creative work.",
    accent: "#C2415C",
    accentStrong: "#9F1239",
    background: "#FFF5F7",
    border: "#F7D8E0",
    bannerStart: "#FFE6ED",
    bannerEnd: "#F8D7E1",
  },
];

export const BRANDING_COLOR_CONTROLS = [
  { key: "accent", label: "Accent", description: "Buttons and highlights" },
  { key: "accentStrong", label: "Heading", description: "Titles and emphasis" },
  { key: "background", label: "Surface", description: "Panel fill color" },
  { key: "border", label: "Border", description: "Cards and table edges" },
  { key: "bannerStart", label: "Banner Start", description: "Header gradient start" },
  { key: "bannerEnd", label: "Banner End", description: "Header gradient end" },
];

const BRANDING_TEMPLATE_MAP = Object.fromEntries(
  BRANDING_TEMPLATES.map((template) => [template.key, template])
);

const DEFAULT_BRANDING = Object.freeze({
  templateKey: "professional",
  brandLabel: "GST Tax Invoice",
  headerNote: "Clear billing with a branded customer-ready layout.",
  footerNote: "Thank you for your business. This invoice is computer generated.",
  ...getTemplateColorDefaults("professional"),
});

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHexColor(value, fallback) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(normalizedValue) ? normalizedValue : fallback;
}

function hexToRgb(hex) {
  const normalizedHex = normalizeHexColor(hex, "#000000").slice(1);

  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16),
    g: Number.parseInt(normalizedHex.slice(2, 4), 16),
    b: Number.parseInt(normalizedHex.slice(4, 6), 16),
  };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getBrandingTemplate(templateKey) {
  return BRANDING_TEMPLATE_MAP[templateKey] || BRANDING_TEMPLATE_MAP[DEFAULT_BRANDING.templateKey];
}

export function getTemplateColorDefaults(templateKey) {
  const template = BRANDING_TEMPLATE_MAP[templateKey] || BRANDING_TEMPLATES[0];

  return {
    accent: template.accent,
    accentStrong: template.accentStrong,
    background: template.background,
    border: template.border,
    bannerStart: template.bannerStart,
    bannerEnd: template.bannerEnd,
  };
}

export function createDefaultBranding() {
  return normalizeBranding(DEFAULT_BRANDING);
}

export function normalizeBranding(branding) {
  const template = getBrandingTemplate(branding?.templateKey);
  const templateColors = getTemplateColorDefaults(template.key);

  return {
    templateKey: template.key,
    brandLabel: normalizeText(branding?.brandLabel).slice(0, 60) || DEFAULT_BRANDING.brandLabel,
    headerNote: normalizeText(branding?.headerNote).slice(0, 120) || DEFAULT_BRANDING.headerNote,
    footerNote: normalizeText(branding?.footerNote).slice(0, 180) || DEFAULT_BRANDING.footerNote,
    accent: normalizeHexColor(branding?.accent, templateColors.accent),
    accentStrong: normalizeHexColor(branding?.accentStrong, templateColors.accentStrong),
    background: normalizeHexColor(branding?.background, templateColors.background),
    border: normalizeHexColor(branding?.border, templateColors.border),
    bannerStart: normalizeHexColor(branding?.bannerStart, templateColors.bannerStart),
    bannerEnd: normalizeHexColor(branding?.bannerEnd, templateColors.bannerEnd),
  };
}

export function getBrandingCssVars(branding) {
  const normalizedBranding = normalizeBranding(branding);

  return {
    "--accent": normalizedBranding.accent,
    "--accent-strong": normalizedBranding.accentStrong,
    "--bg": normalizedBranding.background,
    "--border": normalizedBranding.border,
    "--brand-banner": `linear-gradient(135deg, ${normalizedBranding.bannerStart} 0%, ${normalizedBranding.bannerEnd} 100%)`,
    "--brand-chip-bg": withAlpha(normalizedBranding.accentStrong, 0.12),
    "--brand-chip-text": normalizedBranding.accentStrong,
  };
}

export function getStoredBranding() {
  if (typeof window === "undefined") {
    return createDefaultBranding();
  }

  try {
    const rawBranding = window.localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!rawBranding) {
      return createDefaultBranding();
    }

    return normalizeBranding(JSON.parse(rawBranding));
  } catch {
    return createDefaultBranding();
  }
}

export function persistBranding(branding) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(normalizeBranding(branding)));
  } catch {
    // Ignore storage failures and keep the in-memory selection.
  }
}
