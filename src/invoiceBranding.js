const DEFAULT_BRANDING = Object.freeze({
  templateKey: "professional",
  brandLabel: "GST Tax Invoice",
  headerNote: "Clear billing with a branded customer-ready layout.",
  footerNote: "Thank you for your business. This invoice is computer generated.",
});

export const BRANDING_TEMPLATES = [
  {
    key: "professional",
    name: "Professional Slate",
    description: "Balanced and formal for GST billing and B2B invoices.",
    accent: "#2c7a7b",
    accentStrong: "#225e60",
    background: "#f5fbfb",
    border: "#d8e9e9",
    banner: "linear-gradient(135deg, #edf9f8 0%, #d9eceb 100%)",
    chipBackground: "rgba(34, 94, 96, 0.1)",
    chipText: "#225e60",
  },
  {
    key: "retail",
    name: "Retail Glow",
    description: "Warmer styling for stores, counters, and walk-in sales.",
    accent: "#d97706",
    accentStrong: "#b45309",
    background: "#fff8ef",
    border: "#f4dfc1",
    banner: "linear-gradient(135deg, #fff1db 0%, #ffe0b2 100%)",
    chipBackground: "rgba(180, 83, 9, 0.1)",
    chipText: "#9a3412",
  },
  {
    key: "studio",
    name: "Studio Coral",
    description: "Sharper visual identity for agencies and creative work.",
    accent: "#c2415c",
    accentStrong: "#9f1239",
    background: "#fff5f7",
    border: "#f7d8e0",
    banner: "linear-gradient(135deg, #ffe6ed 0%, #f8d7e1 100%)",
    chipBackground: "rgba(159, 18, 57, 0.1)",
    chipText: "#9f1239",
  },
];

const BRANDING_TEMPLATE_MAP = Object.fromEntries(
  BRANDING_TEMPLATES.map((template) => [template.key, template])
);
const BRANDING_STORAGE_KEY = "invoice-branding-preferences";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function createDefaultBranding() {
  return { ...DEFAULT_BRANDING };
}

export function getBrandingTemplate(templateKey) {
  return BRANDING_TEMPLATE_MAP[templateKey] || BRANDING_TEMPLATE_MAP[DEFAULT_BRANDING.templateKey];
}

export function normalizeBranding(branding) {
  const template = getBrandingTemplate(branding?.templateKey);

  return {
    templateKey: template.key,
    brandLabel: normalizeText(branding?.brandLabel).slice(0, 60) || DEFAULT_BRANDING.brandLabel,
    headerNote: normalizeText(branding?.headerNote).slice(0, 120) || DEFAULT_BRANDING.headerNote,
    footerNote: normalizeText(branding?.footerNote).slice(0, 180) || DEFAULT_BRANDING.footerNote,
  };
}

export function getBrandingCssVars(branding) {
  const template = getBrandingTemplate(branding?.templateKey);

  return {
    "--accent": template.accent,
    "--accent-strong": template.accentStrong,
    "--bg": template.background,
    "--border": template.border,
    "--brand-banner": template.banner,
    "--brand-chip-bg": template.chipBackground,
    "--brand-chip-text": template.chipText,
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
