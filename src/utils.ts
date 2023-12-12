import { formatUnits } from 'ethers'
import { LRUCache } from './lruCache'
import { opensea } from './index'

const { CHAIN, TOKEN_ADDRESS, MIN_TOKEN_ID, MAX_TOKEN_ID, DEBUG } = process.env

export type Log = string[]
export const separator = '-'.repeat(60)

/**
 * Env
 */
export const chain = CHAIN ?? 'ethereum'
export const minTokenId = Number(MIN_TOKEN_ID)
export const maxTokenId = Number(MAX_TOKEN_ID)

/**
 * Processes an OpenSea user object and returns, in order:
 * 1. An OpenSea username
 * 2. A short formatted address
 * */
const usernameCache = new LRUCache<string, string>(200)
export const username = async (address: string, log: Log) => {
  const cached = usernameCache.get(address)
  if (cached) return cached
  const account = await fetchAccount(address, log)
  const username = account?.username
  if (username && username !== '') {
    usernameCache.put(address, username)
    return username
  }
  return shortAddr(address)
}

const fetchAccount = async (address: string, log: Log) => {
  log.push(`Fetching account for ${address}…`)
  try {
    const response = await fetch(opensea.getAccount(address), opensea.getOpts)
    if (!response.ok) {
      log.push(
        `Fetch Error - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const account = await response.json()
    if (!account) {
      log.push('Skipping, no account found')
      return
    }
    return account
  } catch (error) {
    log.push(`Fetch Error: ${error?.message ?? error}`)
  }
}

export const permalink = (tokenId: number) =>
  `https://opensea.io/assets/${CHAIN}/${TOKEN_ADDRESS}/${tokenId}`

export const imageForNFT = (nft: any) => {
  return nft.image_url.replace(/w=(\d)*/, 'w=1000')
}

/**
 * Formats amount, decimals, and symbols to final string output.
 */
export const formatAmount = (
  amount: number,
  decimals: number,
  symbol: string,
) => {
  let value = formatUnits(amount.toString(), decimals)
  const split = value.split('.')
  if (split[1].length > 4) {
    // Trim to 4 decimals max
    value = `${split[0]}.${split[1].slice(0, 5)}`
  } else if (split[1] === '0') {
    // If whole number remove '.0'
    value = split[0]
  }
  return `${value} ${symbol}`
}

/**
 * Returns a shortened version of a full ethereum address
 * (e.g. 0x38a16…c7eb3)
 */
const shortAddr = (addr: string) => addr.slice(0, 7) + '…' + addr.slice(37, 42)

/**
 * Returns a random number specified by params, min and mix included.
 */
export const random = (min = minTokenId, max = maxTokenId) =>
  Math.floor(Math.random() * (max - min + 1) + min)
