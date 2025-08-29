import { formatUnits } from 'ethers';
import { opensea } from './index';
import { LRUCache } from './lru-cache';

const { CHAIN, MIN_TOKEN_ID, MAX_TOKEN_ID, DEBUG } = process.env;

export type Log = string[];
export const separator = '-'.repeat(60);

// Constants to avoid magic numbers
const USERNAME_CACHE_CAPACITY = 100;
const ADDRESS_PREFIX_LENGTH = 7;
const ADDRESS_SUFFIX_START_INDEX = 37;
const ADDRESS_SUFFIX_END_INDEX = 42;
const DECIMAL_TRIM_THRESHOLD = 4;
const DECIMAL_TRIM_LENGTH = 5;
const IMAGE_WIDTH_REGEX = /w=(\d)*/;

/**
 * Env
 */
export const chain = CHAIN ?? 'ethereum';
export const minTokenId = Number(MIN_TOKEN_ID);
export const maxTokenId = Number(MAX_TOKEN_ID);

/**
 * Processes an OpenSea user object and returns, in order:
 * 1. An OpenSea username
 * 2. A short formatted address
 */
const usernameCache = new LRUCache<string, string>(USERNAME_CACHE_CAPACITY);
const usernameFormat = (userName: string, address: string) =>
  userName === '' ? shortAddr(address) : userName;
export const username = async (address: string, log: Log) => {
  const cached = usernameCache.get(address);
  if (cached) {
    return usernameFormat(cached, address);
  }

  const account = await fetchAccount(address, log);
  const resolvedUsername = account?.username ?? '';
  usernameCache.put(address, resolvedUsername);
  return usernameFormat(resolvedUsername, address);
};

export const openseaGet = async <T>(
  url: string,
  log: Log
): Promise<T | undefined> => {
  try {
    const response = await fetch(url, opensea.GET_OPTS);
    if (!response.ok) {
      log.push(
        `Fetch Error for ${url} - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : ''
      );
      return;
    }
    const result = (await response.json()) as T;
    return result;
  } catch (error) {
    log.push(`Fetch Error for ${url}: ${error?.message ?? error}`);
  }
};

type OpenSeaAccount = { username?: string };
const fetchAccount = (address: string, log: Log) => {
  log.push(`Fetching account for ${address}…`);
  const url = opensea.getAccount(address);
  return openseaGet<OpenSeaAccount>(url, log);
};

type HasImageUrl = { image_url?: string };
export const imageForNFT = (nft: HasImageUrl): string | undefined => {
  return nft.image_url?.replace(IMAGE_WIDTH_REGEX, 'w=1000');
};

/**
 * Formats amount, decimals, and symbols to final string output.
 */
export const formatAmount = (
  amount: number,
  decimals: number,
  symbol: string
) => {
  let value = formatUnits(amount, decimals);
  const split = value.split('.');
  if (split[1].length > DECIMAL_TRIM_THRESHOLD) {
    // Trim to max decimals
    value = `${split[0]}.${split[1].slice(0, DECIMAL_TRIM_LENGTH)}`;
  } else if (split[1] === '0') {
    // If whole number remove '.0'
    value = split[0];
  }
  return `${value} ${symbol}`;
};

/**
 * Returns a shortened version of a full ethereum address
 * (e.g. 0x38a16…c7eb3)
 */
const shortAddr = (addr: string) =>
  `${addr.slice(0, ADDRESS_PREFIX_LENGTH)}…${addr.slice(
    ADDRESS_SUFFIX_START_INDEX,
    ADDRESS_SUFFIX_END_INDEX
  )}`;

/**
 * Returns a random number specified by params, min and mix included.
 */
export const random = (min = minTokenId, max = maxTokenId) =>
  Math.floor(Math.random() * (max - min + 1) + min);
