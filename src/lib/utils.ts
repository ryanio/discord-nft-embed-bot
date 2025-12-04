import { formatUnits } from "ethers";
import {
  DECIMAL_TRIM_LENGTH,
  DECIMAL_TRIM_THRESHOLD,
  HIGH_RES_IMAGE_WIDTH,
  IMAGE_WIDTH_REGEX,
  SEPARATOR,
} from "../config/constants";

/** Re-export separator for convenience */
export const separator = SEPARATOR;

/**
 * Format a token amount with decimals and symbol
 * e.g., formatAmount(1000000, 6, "USDC") => "1 USDC"
 */
export const formatAmount = (
  amount: number,
  decimals: number,
  symbol: string
): string => {
  let value = formatUnits(amount, decimals);
  const [whole, decimal] = value.split(".");

  if (!decimal || decimal === "0") {
    value = whole;
  } else if (decimal.length > DECIMAL_TRIM_THRESHOLD) {
    value = `${whole}.${decimal.slice(0, DECIMAL_TRIM_LENGTH)}`;
  }

  return `${value} ${symbol}`;
};

/**
 * Get high-resolution image URL from an NFT
 */
export const getHighResImage = (imageUrl?: string): string | undefined =>
  imageUrl?.replace(IMAGE_WIDTH_REGEX, HIGH_RES_IMAGE_WIDTH);

/**
 * Format a date as "MMM 'YY" (e.g., "Dec '24")
 */
export const formatShortDate = (date: Date): string => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
  return formatted.replace(" ", " '");
};

/**
 * Pluralize a word based on count
 */
export const pluralize = (
  count: number,
  singular: string,
  plural?: string
): string => (count === 1 ? singular : (plural ?? `${singular}s`));
