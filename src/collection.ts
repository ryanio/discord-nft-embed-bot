import { DEFAULT_CHAIN, DEFAULT_EMBED_COLOR } from "./constants";
import { createLogger, isDebugEnabled } from "./logger";
import { fetchCollectionSlug } from "./opensea";
import type { CollectionConfig, Log, TokenMatch } from "./types";

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

/**
 * Parse a single collection entry
 */
const parseCollectionEntry = (
  entry: string,
  isFirst: boolean
): CollectionConfig | undefined => {
  const parts = entry.split(":");
  const minParts = isFirst ? 4 : 5;

  if (parts.length < minParts) {
    log.warn(
      `Invalid collection config (need at least ${minParts} parts): ${entry}`
    );
    return;
  }

  let prefix: string;
  let address: string;
  let name: string;
  let minId: string;
  let maxId: string;
  let chain: string | undefined;
  let color: string | undefined;

  if (isFirst) {
    [address, name, minId, maxId, chain, color] = parts;
    prefix = "";
  } else {
    [prefix, address, name, minId, maxId, chain, color] = parts;
  }

  if (!(address && name)) {
    log.warn(`Missing required fields in collection config: ${entry}`);
    return;
  }

  const config: CollectionConfig = {
    prefix: prefix.toLowerCase(),
    address,
    name,
    chain: chain || DEFAULT_CHAIN,
    minTokenId: Number(minId) || 0,
    maxTokenId: Number(maxId) || 10_000,
    color: color || DEFAULT_EMBED_COLOR,
  };

  const label = isFirst ? "(default)" : `"${config.prefix}"`;
  log.debug(
    `Parsed collection ${label}: ${config.name} (${config.minTokenId}-${config.maxTokenId})`
  );

  return config;
};

/**
 * Parse collections from COLLECTIONS env var
 *
 * Format: address:name:minId:maxId[:chain][:color],prefix:address:name:minId:maxId[:chain][:color],...
 *
 * - First collection: address:name:minId:maxId[:chain][:color] (no prefix, becomes default)
 * - Additional collections: prefix:address:name:minId:maxId[:chain][:color]
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
        "Format: address:name:minId:maxId[:chain][:color],prefix:address:name:minId:maxId[:chain][:color]\n" +
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
 */
export const getDefaultCollection = (): CollectionConfig | undefined =>
  collectionMap.get("");

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
      `Found ${matches.length} match(es): ${matches.map((m) => `${m.collection.name} #${m.tokenId}`).join(", ")}`
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
