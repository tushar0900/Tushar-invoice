const VALID_GST_RATES = [5, 12, 18, 28];

const COMPANY_LINE_SKIP_PATTERNS = [
  /\b(invoice|bill|receipt|gst|tax|phone|mobile|tel|date|time|cash|upi|card|payment)\b/i,
  /\b(address|qty|quantity|rate|amount|total|subtotal|discount|balance|table)\b/i,
];

const ITEM_LINE_SKIP_PATTERNS = [
  /\b(invoice|bill|receipt|cashier|cash|change|amount tendered)\b/i,
  /\b(sub\s*total|subtotal|grand total|net total|total amount|amount due)\b/i,
  /\b(cgst|sgst|igst|vat|tax|discount|round off|service charge)\b/i,
  /\b(phone|mobile|tel|address|gstin|gst no|thank|visit again|served by)\b/i,
  /\b(date|time|table|token|bill no|invoice no|payment|upi|card|cash)\b/i,
];

export function extractReceiptDraftFromText(rawText) {
  const lines = sanitizeReceiptText(rawText);

  return {
    companyName: detectCompanyName(lines),
    gstRate: detectGstRate(lines, rawText),
    lineItems: detectLineItems(lines),
  };
}

function sanitizeReceiptText(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/[|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function detectCompanyName(lines) {
  const candidateLines = lines.slice(0, 8);

  for (const line of candidateLines) {
    if (line.length < 3 || line.length > 60) {
      continue;
    }

    if (!/[A-Za-z]/.test(line)) {
      continue;
    }

    if (COMPANY_LINE_SKIP_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }

    return cleanCompanyName(line);
  }

  return "";
}

function cleanCompanyName(line) {
  return line.replace(/[^A-Za-z0-9&.,()' -]/g, "").replace(/\s+/g, " ").trim();
}

function detectGstRate(lines, rawText) {
  const explicitRates = [];
  const sharedTaxRates = {
    cgst: [],
    sgst: [],
  };

  for (const match of String(rawText || "").matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*%/g)) {
    const numericRate = Number(match[1]);
    if (VALID_GST_RATES.includes(numericRate)) {
      explicitRates.push(numericRate);
    }
  }

  for (const line of lines) {
    const cgstMatch = line.match(/\bcgst\b[^0-9]*(\d{1,2}(?:\.\d+)?)\s*%?/i);
    const sgstMatch = line.match(/\bsgst\b[^0-9]*(\d{1,2}(?:\.\d+)?)\s*%?/i);

    if (cgstMatch) {
      sharedTaxRates.cgst.push(Number(cgstMatch[1]));
    }

    if (sgstMatch) {
      sharedTaxRates.sgst.push(Number(sgstMatch[1]));
    }
  }

  if (sharedTaxRates.cgst.length && sharedTaxRates.sgst.length) {
    const combinedRate = sharedTaxRates.cgst[0] + sharedTaxRates.sgst[0];
    if (VALID_GST_RATES.includes(combinedRate)) {
      return combinedRate;
    }
  }

  if (explicitRates.length) {
    return mostFrequentValue(explicitRates);
  }

  return 5;
}

function detectLineItems(lines) {
  const items = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const parsedItem = parseLineItem(line);
    if (!parsedItem) {
      continue;
    }

    const itemKey = `${parsedItem.product.toLowerCase()}-${parsedItem.total.toFixed(2)}`;
    if (seenKeys.has(itemKey)) {
      continue;
    }

    seenKeys.add(itemKey);
    items.push(parsedItem);

    if (items.length === 15) {
      break;
    }
  }

  return items;
}

function parseLineItem(line) {
  if (ITEM_LINE_SKIP_PATTERNS.some((pattern) => pattern.test(line))) {
    return null;
  }

  if (!/[A-Za-z]/.test(line)) {
    return null;
  }

  const numericTokens = [...line.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) =>
    Number(match[0].replace(/,/g, ""))
  );

  if (!numericTokens.length) {
    return null;
  }

  const product = extractProductName(line);
  if (!product || product.length < 2) {
    return null;
  }

  const amounts = deriveItemAmounts(numericTokens);
  if (!amounts) {
    return null;
  }

  return {
    product,
    rate: roundCurrency(amounts.rate),
    quantity: roundQuantity(amounts.quantity),
    total: roundCurrency(amounts.total),
  };
}

function extractProductName(line) {
  const tokens = line
    .replace(/(?:rs\.?|inr|amt|amount|qty\.?)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");

  let endIndex = tokens.length - 1;

  while (endIndex >= 0 && isTrailingItemToken(tokens[endIndex])) {
    endIndex -= 1;
  }

  const nameTokens = tokens.slice(0, endIndex + 1);

  while (nameTokens.length && isNumericToken(nameTokens[0])) {
    nameTokens.shift();
  }

  return nameTokens.join(" ").replace(/[-:]+$/, "").trim();
}

function isTrailingItemToken(token) {
  return (
    isNumericToken(token) ||
    /^(x|qty|pcs|pc|nos|no)$/i.test(token)
  );
}

function isNumericToken(token) {
  return /^\d+(?:[.,]\d+)?$/.test(token);
}

function deriveItemAmounts(numbers) {
  const cleanNumbers = numbers.filter((value) => Number.isFinite(value) && value > 0);

  if (!cleanNumbers.length) {
    return null;
  }

  const total = cleanNumbers[cleanNumbers.length - 1];

  if (cleanNumbers.length === 1) {
    return { quantity: 1, rate: total, total };
  }

  for (let rightIndex = cleanNumbers.length - 2; rightIndex >= 0; rightIndex -= 1) {
    for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
      const firstValue = cleanNumbers[leftIndex];
      const secondValue = cleanNumbers[rightIndex];

      if (isReasonableQuantity(firstValue) && approximatelyEqual(firstValue * secondValue, total)) {
        return { quantity: firstValue, rate: secondValue, total };
      }

      if (isReasonableQuantity(secondValue) && approximatelyEqual(firstValue * secondValue, total)) {
        return { quantity: secondValue, rate: firstValue, total };
      }
    }
  }

  const previousValue = cleanNumbers[cleanNumbers.length - 2];
  const derivedQuantity = total / previousValue;

  if (
    previousValue > 0 &&
    isReasonableQuantity(derivedQuantity) &&
    approximatelyEqual(previousValue * derivedQuantity, total)
  ) {
    return { quantity: derivedQuantity, rate: previousValue, total };
  }

  if (isReasonableQuantity(previousValue) && previousValue < total) {
    return { quantity: previousValue, rate: total / previousValue, total };
  }

  return { quantity: 1, rate: total, total };
}

function isReasonableQuantity(value) {
  return Number.isFinite(value) && value > 0 && value <= 100 && value <= Math.floor(value) + 0.0001;
}

function approximatelyEqual(firstValue, secondValue) {
  const difference = Math.abs(firstValue - secondValue);
  return difference <= Math.max(2, secondValue * 0.2);
}

function mostFrequentValue(values) {
  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function roundCurrency(value) {
  return Number(Number(value).toFixed(2));
}

function roundQuantity(value) {
  return Number(Number(value).toFixed(2));
}
