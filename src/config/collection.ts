import { fetchCollectionSlug } from "../api/opensea";
import { createLogger, isDebugEnabled } from "../lib/logger";
import type {
  CollectionConfig,
  Log,
  TokenMatch,
  UsernameMatch,
} from "../lib/types";
import { DEFAULT_CHAIN, DEFAULT_EMBED_COLOR } from "./constants";

const log = createLogger("Collection");

const {
  // Legacy single-collection env vars (still supported for backward compatibility)
  TOKEN_ADDRESS,
  TOKEN_NAME,
  CHAIN,
  MIN_TOKEN_ID,
  MAX_TOKEN_ID,
  CUSTOM_DESCRIPTION,
  EMBED_COLOR,
  // Multi-collection env var (preferred)
  COLLECTIONS,
} = process.env;

/** Map of prefix -> CollectionConfig */
const collectionMap = new Map<string, CollectionConfig>();

/** Map of collection address -> slug */
const slugMap = new Map<string, string>();

/** Username validation regex - alphanumeric/underscore, 3-15 chars, starts with letter */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,14}$/;

/** Regex to match trailing colon */
const TRAILING_COLON_REGEX = /:$/;

/**
 * Check if a string looks like an Ethereum address
 */
const isEthAddress = (value: string): boolean => value.startsWith("0x");

/**
 * Fix URLs that were broken by colon separator
 * When split by ':', URLs like (http://example.com) become (http://example.com)
 * This fixes patterns like (http:// to become (http://
 */
const fixBrokenUrls = (text: string): string => {
  // Fix broken URLs in markdown links: (http:// becomes (http://
  return text
    .replace(/\(http:\/\//g, "(http://")
    .replace(/\(https:\/\//g, "(https://");
};

/**
 * Parse customDescription and customImageUrl from extra parts
 * If last part is a URL (http/https), treat it as imageUrl and rest as customDescription
 * Reconstructs URLs that were split by colon separator
 */
const parseExtraFields = (
  extraParts: string[]
): { customDescription?: string; customImageUrl?: string } => {
  if (extraParts.length === 0) {
    return {};
  }

  // Join all parts first
  const joined = extraParts.join(":");

  // Find the last standalone URL (not inside markdown link parentheses)
  // Look for http:// or https:// that's not preceded by (
  const urlMatch = joined.match(/(?<!\()https?:\/\/[^\s)]+/g);
  const lastUrl = urlMatch?.at(-1);

  if (lastUrl) {
    // Split on the last URL
    const lastUrlIndex = joined.lastIndexOf(lastUrl);
    let beforeUrl = joined.slice(0, lastUrlIndex).trim();
    const afterUrl = joined.slice(lastUrlIndex + lastUrl.length).trim();

    // Remove trailing colon if present (from the separator)
    beforeUrl = beforeUrl.replace(TRAILING_COLON_REGEX, "").trim();

    // If there's content after the URL, it might be part of the URL (like /generate)
    // Otherwise, treat the URL as imageUrl
    if (!afterUrl || afterUrl.startsWith(")") || afterUrl === "") {
      const customDesc = beforeUrl ? fixBrokenUrls(beforeUrl) : undefined;
      return {
        customDescription: customDesc,
        customImageUrl: lastUrl,
      };
    }
  }

  // No standalone URL found - treat all as customDescription and fix URLs
  return { customDescription: fixBrokenUrls(joined) };
};

/**
 * Extract collection fields from parts array
 * Format: [prefix:]address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl]
 */
const extractCollectionFields = (
  parts: string[],
  hasPrefix: boolean
): CollectionConfig => {
  const offset = hasPrefix ? 0 : -1;
  const colorIndex = 6 + offset;
  const customDescStart = 7 + offset;

  const extraParts =
    parts.length > customDescStart ? parts.slice(customDescStart) : [];
  const { customDescription, customImageUrl } = parseExtraFields(extraParts);

  return {
    prefix: (hasPrefix ? (parts.at(0) ?? "") : "").toLowerCase(),
    address: parts.at(1 + offset) ?? "",
    name: parts.at(2 + offset) ?? "",
    chain: parts.at(5 + offset) || DEFAULT_CHAIN,
    minTokenId: Number(parts.at(3 + offset)) || 0,
    maxTokenId: Number(parts.at(4 + offset)) || 10_000,
    color: parts.at(colorIndex) || DEFAULT_EMBED_COLOR,
    customDescription,
    customImageUrl,
  };
};

/**
 * Parse a single collection entry
 *
 * For the first entry, we auto-detect whether a prefix is specified:
 * - If first part starts with 0x, treat as address (no prefix, becomes default)
 * - Otherwise, treat first part as prefix
 */
const parseCollectionEntry = (
  entry: string,
  isFirst: boolean
): CollectionConfig | undefined => {
  const parts = entry.split(":");

  // For first entry, detect if prefix is specified by checking if first part is an address
  const firstHasPrefix = isFirst && !isEthAddress(parts.at(0) ?? "");
  const hasPrefix = !isFirst || firstHasPrefix;
  const minParts = hasPrefix ? 5 : 4;

  if (parts.length < minParts) {
    log.warn(
      `Invalid collection config (need at least ${minParts} parts): ${entry}`
    );
    return;
  }

  const config = extractCollectionFields(parts, hasPrefix);

  if (!(config.address && config.name)) {
    log.warn(`Missing required fields in collection config: ${entry}`);
    return;
  }

  const label = config.prefix === "" ? "(default)" : `"${config.prefix}"`;
  log.debug(
    `Parsed collection ${label}: ${config.name} (${config.minTokenId}-${config.maxTokenId})`
  );

  return config;
};

/**
 * Parse collections from COLLECTIONS env var
 *
 * Format: [prefix:]address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl],...
 *
 * - First collection without prefix: address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl] (becomes default)
 * - First collection with prefix: prefix:address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl] (no default)
 * - Additional collections: prefix:address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl]
 *
 * customDescription: Optional text template ({id} replaced with token ID). May contain colons.
 * imageUrl: Optional image URL template ({id} replaced with token ID). Must start with http:// or https://
 * If both are present, imageUrl must be the last part (detected by http/https prefix).
 *
 * Prefix detection for first entry: if first part starts with 0x, treated as address (no prefix)
 */
const parseCollections = (): CollectionConfig[] => {
  if (!COLLECTIONS) {
    return [];
  }

  const collections: CollectionConfig[] = [];
  const entries = COLLECTIONS.split(",").map((e) => e.trim());

  for (const [index, entry] of entries.entries()) {
    const config = parseCollectionEntry(entry, index === 0);
    if (config) {
      collections.push(config);
    }
  }

  return collections;
};

/**
 * Parse legacy single-collection from environment variables
 * (backward compatibility)
 */
const parseLegacyCollection = (): CollectionConfig | undefined => {
  if (!(TOKEN_ADDRESS && TOKEN_NAME)) {
    return;
  }

  log.debug("Using legacy env vars (TOKEN_ADDRESS, TOKEN_NAME, etc.)");

  return {
    prefix: "",
    address: TOKEN_ADDRESS,
    name: TOKEN_NAME,
    chain: CHAIN ?? DEFAULT_CHAIN,
    minTokenId: Number(MIN_TOKEN_ID) || 0,
    maxTokenId: Number(MAX_TOKEN_ID) || 10_000,
    customDescription: CUSTOM_DESCRIPTION,
    color: EMBED_COLOR ?? DEFAULT_EMBED_COLOR,
  };
};

/**
 * Initialize all collections from environment
 *
 * Priority:
 * 1. COLLECTIONS env var (multi-collection format)
 * 2. Legacy TOKEN_ADDRESS/TOKEN_NAME vars (single collection)
 */
export const initCollections = (): void => {
  log.info("Initializing collections from environment");
  collectionMap.clear();

  // Try multi-collection format first
  const collections = parseCollections();

  if (collections.length > 0) {
    // First collection is the default (no prefix)
    for (const collection of collections) {
      collectionMap.set(collection.prefix, collection);

      if (collection.prefix === "") {
        log.info(`Default collection: ${collection.name}`);
      } else {
        log.info(`Collection "${collection.prefix}": ${collection.name}`);
      }
    }
  } else {
    // Fall back to legacy single-collection format
    const legacy = parseLegacyCollection();
    if (legacy) {
      collectionMap.set("", legacy);
      log.info(`Collection (legacy): ${legacy.name}`);
    }
  }

  if (collectionMap.size === 0) {
    throw new Error(
      "No collections configured. Set COLLECTIONS env var.\n" +
        "Format: address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl],prefix:address:name:minId:maxId[:chain][:color][:customDescription][:imageUrl]\n" +
        "Example: 0x123...:MyNFT:1:10000,other:0x456...:OtherNFT:0:5000"
    );
  }

  log.info(`Loaded ${collectionMap.size} collection(s)`);
};

/**
 * Get all configured collections
 */
export const getCollections = (): CollectionConfig[] => [
  ...collectionMap.values(),
];

/**
 * Get the default (primary) collection
 * Falls back to first collection if no explicit default (empty prefix) exists
 */
export const getDefaultCollection = (): CollectionConfig | undefined => {
  const explicit = collectionMap.get("");
  if (explicit) {
    return explicit;
  }
  // Fall back to first collection if no explicit default
  return collectionMap.values().next().value;
};

/**
 * Get a collection by its prefix
 */
export const getCollectionByPrefix = (
  prefix: string
): CollectionConfig | undefined => collectionMap.get(prefix.toLowerCase());

/**
 * Get the slug for a collection, fetching if needed
 */
export const getSlugForCollection = async (
  collection: CollectionConfig,
  userLog: Log
): Promise<string | undefined> => {
  const cacheKey = `${collection.chain}:${collection.address}`;
  const cached = slugMap.get(cacheKey);

  if (cached) {
    log.debug(`Slug cache hit for ${collection.name}: ${cached}`);
    return cached;
  }

  const slug = await fetchCollectionSlug(collection, userLog);
  if (slug) {
    slugMap.set(cacheKey, slug);
    log.debug(`Cached slug for ${collection.name}: ${slug}`);
  }
  return slug;
};

/**
 * Initialize slugs for all collections
 */
export const initCollectionSlugs = async (): Promise<void> => {
  log.info("Fetching slugs for all collections");
  const userLog: Log = [];

  for (const collection of collectionMap.values()) {
    const slug = await getSlugForCollection(collection, userLog);
    if (!slug) {
      throw new Error(`Could not find slug for collection: ${collection.name}`);
    }
  }

  for (const message of userLog) {
    log.info(message);
  }

  log.info("All collection slugs initialized");
};

/**
 * Generate a random token ID for a collection
 */
export const randomTokenId = (collection: CollectionConfig): number => {
  const tokenId = Math.floor(
    Math.random() * (collection.maxTokenId - collection.minTokenId + 1) +
      collection.minTokenId
  );
  log.debug(`Generated random token ID for ${collection.name}: #${tokenId}`);
  return tokenId;
};

/**
 * Check if a token ID is valid for a collection
 */
export const isValidTokenId = (
  collection: CollectionConfig,
  tokenId: number
): boolean =>
  tokenId >= collection.minTokenId &&
  tokenId <= collection.maxTokenId &&
  !Number.isNaN(tokenId);

/**
 * Build regex pattern for matching collection triggers
 * Supports: #1234, #random, prefix#1234, prefix#random
 */
const buildMatchRegex = (): RegExp => {
  const prefixes = [...collectionMap.keys()].filter((p) => p !== "");
  const prefixPattern = prefixes.length > 0 ? `(?:${prefixes.join("|")})?` : "";

  // Match: optional prefix + # + (random|rand|?|digits)
  const pattern = `(${prefixPattern})#(random|rand|\\?|\\d+)(?:\\s|\\n|\\W|$)`;

  if (isDebugEnabled()) {
    log.debug(`Match regex pattern: ${pattern}`);
    log.debug(`Collection prefixes: ${prefixes.join(", ") || "(none)"}`);
  }

  return new RegExp(pattern, "gi");
};

/**
 * Parse message content and extract token matches
 */
export const parseMessageMatches = (content: string): TokenMatch[] => {
  const matches: TokenMatch[] = [];
  const regex = buildMatchRegex();

  let match: RegExpExecArray | null = regex.exec(content);
  while (match !== null) {
    const [_fullMatch, prefix = "", idPart] = match;
    const collection = getCollectionByPrefix(prefix) ?? getDefaultCollection();

    if (!collection) {
      log.debug(`No collection found for prefix "${prefix}", skipping`);
      match = regex.exec(content);
      continue;
    }

    let tokenId: number;
    if (idPart === "random" || idPart === "rand" || idPart === "?") {
      tokenId = randomTokenId(collection);
      log.debug(
        `Matched random request for ${collection.name}, resolved to #${tokenId}`
      );
    } else {
      tokenId = Number(idPart);
      log.debug(`Matched specific token: ${collection.name} #${tokenId}`);
    }

    if (isValidTokenId(collection, tokenId)) {
      matches.push({ collection, tokenId });
      log.debug(`Added match: ${collection.name} #${tokenId}`);
    } else {
      log.debug(
        `Token #${tokenId} out of range for ${collection.name} (${collection.minTokenId}-${collection.maxTokenId})`
      );
    }

    match = regex.exec(content);
  }

  if (matches.length > 0) {
    log.info(
      `Found ${matches.length} ${matches.length === 1 ? "match" : "matches"}: ${matches.map((m) => `${m.collection.name} #${m.tokenId}`).join(", ")}`
    );
  }

  return matches;
};

/**
 * Get help text showing available collection prefixes
 */
export const getHelpText = (): string => {
  const lines = ["**Available collections:**"];

  for (const collection of collectionMap.values()) {
    const _label = collection.prefix || "(default)";
    const example = collection.prefix ? `${collection.prefix}#1234` : "#1234";
    lines.push(`• \`${example}\` - ${collection.name}`);
  }

  return lines.join("\n");
};

/**
 * Build regex pattern for matching username triggers
 * Supports: #username, prefix#username
 *
 * Username pattern: alphanumeric, underscores, 3-15 chars (OpenSea username rules)
 */
const buildUsernameMatchRegex = (): RegExp => {
  const prefixes = [...collectionMap.keys()].filter((p) => p !== "");
  const prefixPattern = prefixes.length > 0 ? `(?:${prefixes.join("|")})?` : "";

  // Match: optional prefix + # + username (alphanumeric/underscore, 3-15 chars, not starting with digit)
  // Username must start with a letter to distinguish from token IDs
  const pattern = `(${prefixPattern})#([a-zA-Z][a-zA-Z0-9_]{2,14})(?:\\s|\\n|\\W|$)`;

  if (isDebugEnabled()) {
    log.debug(`Username match regex pattern: ${pattern}`);
  }

  return new RegExp(pattern, "gi");
};

/**
 * Check if a string looks like a username (not a number or keyword)
 */
const isUsername = (value: string): boolean => {
  // Must start with a letter and be 3-15 chars
  if (!USERNAME_REGEX.test(value)) {
    return false;
  }
  // Must not be a reserved keyword
  const reserved = ["random", "rand"];
  return !reserved.includes(value.toLowerCase());
};

/**
 * Parse message content and extract username matches for random by user
 */
export const parseUsernameMatches = (content: string): UsernameMatch[] => {
  const matches: UsernameMatch[] = [];
  const regex = buildUsernameMatchRegex();

  let match: RegExpExecArray | null = regex.exec(content);
  while (match !== null) {
    const [_fullMatch, prefix = "", usernamePart] = match;

    // Validate it's a username
    if (!isUsername(usernamePart)) {
      match = regex.exec(content);
      continue;
    }

    const collection =
      prefix !== "" ? getCollectionByPrefix(prefix) : getDefaultCollection();

    log.debug(
      `Matched username request: ${collection?.name ?? "any"} #${usernamePart}`
    );

    matches.push({
      collection,
      username: usernamePart,
    });

    match = regex.exec(content);
  }

  if (matches.length > 0) {
    log.info(
      `Found ${matches.length} username ${matches.length === 1 ? "match" : "matches"}: ${matches.map((m) => `${m.collection?.name ?? "any"}#${m.username}`).join(", ")}`
    );
  }

  return matches;
};
