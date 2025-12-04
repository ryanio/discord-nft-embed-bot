import {
  COLLECTION_SLUG_CACHE_CAPACITY,
  OPENSEA_API_BASE,
  USERNAME_CACHE_CAPACITY,
} from "../config/constants";
import { createLogger, isDebugEnabled } from "../lib/logger";
import { LRUCache } from "../lib/lru-cache";
import type {
  AccountNFT,
  AccountNFTsResponse,
  BestListing,
  BestOffer,
  CollectionConfig,
  LastSale,
  Log,
  NFT,
  OpenSeaAccount,
} from "../lib/types";

const log = createLogger("OpenSea");

/** Custom error for NFT not found - allows callers to handle specifically */
export class NFTNotFoundError extends Error {
  readonly collection: CollectionConfig;
  readonly tokenId: number;

  constructor(collection: CollectionConfig, tokenId: number) {
    super(
      `NFT not found: ${collection.name} #${tokenId} (contract: ${collection.address}, chain: ${collection.chain})`
    );
    this.name = "NFTNotFoundError";
    this.collection = collection;
    this.tokenId = tokenId;
  }
}

const { OPENSEA_API_TOKEN } = process.env;

/** OpenSea API request options */
const GET_OPTS = {
  method: "GET",
  headers: {
    Accept: "application/json",
    "X-API-KEY": OPENSEA_API_TOKEN ?? "",
  },
} as const;

/** Cache for collection slugs by address */
const slugCache = new LRUCache<string, string>(COLLECTION_SLUG_CACHE_CAPACITY);

/** Cache for usernames by address */
const usernameCache = new LRUCache<string, string>(USERNAME_CACHE_CAPACITY);

/**
 * Generic OpenSea GET request with error handling
 *
 * @param url - The OpenSea API URL to fetch
 * @param userLog - Log array for user-facing messages
 * @param expect404 - If true, 404 responses are treated as "no data" (not an error).
 *                    OpenSea returns 404 for best listing/offer endpoints when no
 *                    listing or offer exists for a token.
 */
export const openseaGet = async <T>(
  url: string,
  userLog: Log,
  expect404 = false
): Promise<T | undefined> => {
  const startTime = Date.now();

  try {
    log.debug(`Fetching: ${url}`);
    const response = await fetch(url, GET_OPTS);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      // OpenSea returns 404 for best listing/offer when none exists - this is expected
      if (response.status === 404 && expect404) {
        log.debug(`No data found: ${url} (${duration}ms)`);
        return;
      }

      userLog.push(
        `Fetch Error for ${url} - ${response.status}: ${response.statusText}`
      );
      log.warn(
        `API error ${response.status} for ${url} (${duration}ms): ${response.statusText}`
      );

      if (isDebugEnabled()) {
        try {
          const bodyText = await response.text();
          log.debug(`Response body: ${bodyText}`);
        } catch {
          // ignore stream errors in debug path
        }
      }
      return;
    }

    log.debug(`Success: ${url} (${duration}ms)`);
    return (await response.json()) as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    userLog.push(`Fetch Error for ${url}: ${message}`);
    log.error(`Request failed for ${url} (${duration}ms): ${message}`);
  }
};

/** URL builders for OpenSea API */
export const urls = {
  account: (address: string) => `${OPENSEA_API_BASE}/accounts/${address}`,

  nft: (collection: CollectionConfig, tokenId: number) =>
    `${OPENSEA_API_BASE}/chain/${collection.chain}/contract/${collection.address}/nfts/${tokenId}`,

  contract: (collection: CollectionConfig) =>
    `${OPENSEA_API_BASE}/chain/${collection.chain}/contract/${collection.address}`,

  bestOffer: (slug: string, tokenId: number) =>
    `${OPENSEA_API_BASE}/offers/collection/${slug}/nfts/${tokenId}/best`,

  bestListing: (slug: string, tokenId: number) =>
    `${OPENSEA_API_BASE}/listings/collection/${slug}/nfts/${tokenId}/best`,

  events: (collection: CollectionConfig, tokenId: number) =>
    `${OPENSEA_API_BASE}/events/chain/${collection.chain}/contract/${collection.address}/nfts/${tokenId}`,

  accountNFTs: (chain: string, address: string, collectionSlug?: string) => {
    const base = `${OPENSEA_API_BASE}/chain/${chain}/account/${address}/nfts`;
    const params = new URLSearchParams({ limit: "50" });
    if (collectionSlug) {
      params.set("collection", collectionSlug);
    }
    return `${base}?${params.toString()}`;
  },
};

/**
 * Fetch and cache the collection slug for a contract address
 */
export const fetchCollectionSlug = async (
  collection: CollectionConfig,
  userLog: Log
): Promise<string | undefined> => {
  const cacheKey = `${collection.chain}:${collection.address}`;
  const cached = slugCache.get(cacheKey);

  if (cached) {
    log.debug(`Slug cache hit for ${collection.name}: ${cached}`);
    return cached;
  }

  log.info(`Fetching slug for ${collection.name} (${collection.address})`);
  const url = urls.contract(collection);
  const result = await openseaGet<{ collection: string }>(url, userLog);

  if (result?.collection) {
    slugCache.put(cacheKey, result.collection);
    log.info(`Got slug for ${collection.name}: ${result.collection}`);
    return result.collection;
  }

  log.warn(`Failed to get slug for ${collection.name}`);
};

/**
 * Fetch NFT data from OpenSea
 *
 * @throws {NFTNotFoundError} When the NFT doesn't exist or can't be fetched
 */
export const fetchNFT = async (
  collection: CollectionConfig,
  tokenId: number,
  userLog: Log
): Promise<NFT> => {
  log.debug(`Fetching NFT: ${collection.name} #${tokenId}`);
  userLog.push(`Fetching ${collection.name} #${tokenId}…`);

  const url = urls.nft(collection, tokenId);
  const result = await openseaGet<{ nft: NFT }>(url, userLog);

  if (!result?.nft) {
    log.error(
      `NFT not found: ${collection.name} #${tokenId} (contract: ${collection.address})`
    );
    throw new NFTNotFoundError(collection, tokenId);
  }

  log.debug(`Fetched NFT: ${collection.name} #${tokenId}`);
  return result.nft;
};

/**
 * Fetch the last sale event for an NFT
 */
export const fetchLastSale = async (
  collection: CollectionConfig,
  tokenId: number,
  userLog: Log
): Promise<LastSale | undefined> => {
  log.debug(`Fetching last sale: ${collection.name} #${tokenId}`);

  const url = `${urls.events(collection, tokenId)}?event_type=sale&limit=1`;
  const result = await openseaGet<{ asset_events?: LastSale[] }>(url, userLog);
  const sale = result?.asset_events?.at(0);

  if (sale) {
    log.debug(`Found last sale for ${collection.name} #${tokenId}`);
  }

  return sale;
};

/**
 * Fetch the best offer for an NFT
 *
 * OpenSea returns 404 when no offer exists for the token - this is expected.
 */
export const fetchBestOffer = (
  slug: string,
  tokenId: number,
  userLog: Log
): Promise<BestOffer | undefined> => {
  log.debug(`Fetching best offer: ${slug} #${tokenId}`);
  const url = urls.bestOffer(slug, tokenId);
  return openseaGet<BestOffer>(url, userLog, true);
};

/**
 * Fetch the best listing for an NFT
 *
 * OpenSea returns 404 when no listing exists for the token - this is expected.
 */
export const fetchBestListing = (
  slug: string,
  tokenId: number,
  userLog: Log
): Promise<BestListing | undefined> => {
  log.debug(`Fetching best listing: ${slug} #${tokenId}`);
  const url = urls.bestListing(slug, tokenId);
  return openseaGet<BestListing>(url, userLog, true);
};

/**
 * Fetch account info from OpenSea
 */
const fetchAccount = (
  address: string,
  userLog: Log
): Promise<OpenSeaAccount | undefined> => {
  log.debug(`Fetching account: ${address}`);
  const url = urls.account(address);
  return openseaGet<OpenSeaAccount>(url, userLog);
};

/**
 * Get username for an address, with caching
 * Returns OpenSea username or shortened address
 */
export const getUsername = async (
  address: string,
  userLog: Log
): Promise<string> => {
  const cached = usernameCache.get(address);

  if (cached !== undefined) {
    const display = cached || shortAddress(address);
    log.debug(`Username cache hit for ${address}: ${display}`);
    return display;
  }

  const account = await fetchAccount(address, userLog);
  const username = account?.username ?? "";
  usernameCache.put(address, username);

  const display = username || shortAddress(address);
  log.debug(`Resolved username for ${address}: ${display}`);
  return display;
};

/**
 * Shorten an Ethereum address for display
 * e.g., 0x38a16...c7eb3
 */
const shortAddress = (addr: string): string => {
  const PREFIX_LEN = 7;
  const SUFFIX_START = 37;
  const SUFFIX_END = 42;
  return `${addr.slice(0, PREFIX_LEN)}…${addr.slice(SUFFIX_START, SUFFIX_END)}`;
};

/**
 * Fetch account info by username and return the address
 * Returns undefined if the username is not found
 */
export const fetchAccountAddress = async (
  username: string,
  userLog: Log
): Promise<string | undefined> => {
  log.debug(`Resolving username to address: ${username}`);

  const account = await openseaGet<OpenSeaAccount & { address?: string }>(
    urls.account(username),
    userLog
  );

  if (account?.address) {
    log.debug(`Resolved ${username} to address: ${account.address}`);
    return account.address;
  }

  log.warn(`Username not found: ${username}`);
};

/**
 * Fetch NFTs owned by an address, optionally filtered by collection slug
 *
 * @param address - The wallet address (not username)
 * @param chain - The blockchain network (e.g., "ethereum")
 * @param userLog - Log array for user-facing messages
 * @param collectionSlug - Optional collection slug to filter results
 */
export const fetchAccountNFTs = async (
  address: string,
  chain: string,
  userLog: Log,
  collectionSlug?: string
): Promise<AccountNFT[]> => {
  log.debug(
    `Fetching NFTs for ${address}${collectionSlug ? ` in ${collectionSlug}` : ""}`
  );

  const url = urls.accountNFTs(chain, address, collectionSlug);
  const result = await openseaGet<AccountNFTsResponse>(url, userLog);

  const nfts = result?.nfts ?? [];
  log.debug(`Found ${nfts.length} NFTs for ${address}`);

  return nfts;
};

/**
 * Get a random NFT from a user's collection
 *
 * @param username - OpenSea username
 * @param chain - Blockchain network
 * @param userLog - Log array for user-facing messages
 * @param collectionSlug - Optional collection slug to filter results
 * @returns A random NFT and its token ID, or undefined if none found
 */
export const fetchRandomUserNFT = async (
  username: string,
  chain: string,
  userLog: Log,
  collectionSlug?: string
): Promise<{ nft: AccountNFT; tokenId: number } | undefined> => {
  log.info(
    `Fetching random NFT for ${username}${collectionSlug ? ` from ${collectionSlug}` : ""}`
  );
  userLog.push(`Looking up NFTs owned by @${username}…`);

  // First resolve username to address
  const address = await fetchAccountAddress(username, userLog);
  if (!address) {
    userLog.push(`User @${username} not found`);
    return;
  }

  // Fetch their NFTs
  const nfts = await fetchAccountNFTs(address, chain, userLog, collectionSlug);
  if (nfts.length === 0) {
    userLog.push(
      `No NFTs found for @${username}${collectionSlug ? ` in collection ${collectionSlug}` : ""}`
    );
    return;
  }

  // Pick a random one
  const randomIndex = Math.floor(Math.random() * nfts.length);
  const nft = nfts.at(randomIndex);
  if (!nft) {
    return;
  }

  const tokenId = Number(nft.identifier);
  log.info(
    `Selected random NFT: ${nft.name ?? `#${tokenId}`} for @${username}`
  );

  return { nft, tokenId };
};

/** Export GET_OPTS for testing */
export { GET_OPTS };
