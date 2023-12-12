import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Channel,
  Partials,
} from 'discord.js'
import { FixedNumber, formatUnits } from 'ethers'

type Log = string[]
const separator = '-'.repeat(60)

const {
  DISCORD_TOKEN,
  OPENSEA_API_TOKEN,
  TOKEN_NAME,
  TOKEN_ADDRESS,
  MIN_TOKEN_ID,
  MAX_TOKEN_ID,
  RANDOM_INTERVALS,
  DEBUG,
  CUSTOM_DESCRIPTION,
} = process.env

let { CHAIN } = process.env
CHAIN ??= 'ethereum'

/**
 * Processes an OpenSea user object and returns, in order:
 * 1. An OpenSea username
 * 2. A short formatted address
 * */
const cachedUsernames: { [key: string]: string } = {}
export const username = async (address: string, log: Log) => {
  if (address in cachedUsernames) {
    return cachedUsernames[address]
  }
  const account = await fetchAccount(address, log)
  const username = account?.username
  if (username && username !== '') {
    cachedUsernames[address] = username
    return username
  }
  return shortAddr(address)
}

export const permalink = (tokenId: number) =>
  `https://opensea.io/assets/${CHAIN}/${TOKEN_ADDRESS}/${tokenId}`

/**
 * Formats amount, decimals, and symbols to final string output.
 */
const formatAmount = (amount: number, decimals: number, symbol: string) => {
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
const random = (min = Number(MIN_TOKEN_ID), max = Number(MAX_TOKEN_ID)) =>
  Math.floor(Math.random() * (max - min + 1) + min)

/**
 * OpenSea
 */
const opensea = {
  getOpts: {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-KEY': OPENSEA_API_TOKEN },
  } as any,
  api: 'https://api.opensea.io/api/v2/',
  getAccount: (address: string) => `${opensea.api}accounts/${address}`,
  getNFT: (tokenId: number) =>
    `${opensea.api}chain/${CHAIN}/contract/${TOKEN_ADDRESS}/nfts/${tokenId}`,
  getContract: () => `${opensea.api}chain/${CHAIN}/contract/${TOKEN_ADDRESS}`,
  getBestOffer: (tokenId: number) =>
    `${opensea.api}offers/collection/${cachedCollectionSlug}/nfts/${tokenId}/best`,
  getBestListing: (tokenId: number) =>
    `${opensea.api}listings/collection/${cachedCollectionSlug}/nfts/${tokenId}/best`,
  getEvents: (tokenId: number) =>
    `${opensea.api}events/chain/${CHAIN}/contract/${TOKEN_ADDRESS}/nfts/${tokenId}}`,
}

const imageForNFT = (nft: any) => {
  return nft.image_url.replace(/w=(\d)*/, 'w=1000')
}

/**
 * Fetch functions
 */
let cachedCollectionSlug
const fetchCollectionSlug = async (address: string, chain = CHAIN) => {
  if (cachedCollectionSlug) {
    return cachedCollectionSlug
  }
  console.log(`Getting collection slug for ${address} on chain ${chain}…`)
  try {
    const response = await fetch(opensea.getContract(), opensea.getOpts)
    if (!response.ok) {
      console.error(
        `Fetch Error - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const result = await response.json()
    console.log(`Got collection slug: ${result.collection}`)
    cachedCollectionSlug = result.collection
    return cachedCollectionSlug
  } catch (error) {
    console.error(`Fetch Error: ${error?.message ?? error}`)
  }
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

const fetchLastSale = async (tokenId: number, log: Log): Promise<any> => {
  log.push(`Fetching last sale for #${tokenId}…`)
  try {
    const url = `${opensea.getEvents(tokenId)}?event_type=sale`
    const response = await fetch(url, opensea.getOpts)
    if (!response.ok) {
      log.push(
        `Fetch Error - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const result = await response.json()
    const events = result.asset_events
    if (!events) {
      log.push('Skipping, no events found')
      return
    }
    return events[0]
  } catch (error) {
    log.push(`Fetch Error: ${error?.message ?? error}`)
  }
}

const fetchNFT = async (tokenId: number, log: Log): Promise<any> => {
  log.push(`Fetching #${tokenId}…`)
  try {
    const response = await fetch(opensea.getNFT(tokenId), opensea.getOpts)
    if (!response.ok) {
      log.push(
        `Fetch Error - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const result = await response.json()
    if (!result) {
      log.push('Skipping, no NFT found')
      return
    }
    return result.nft
  } catch (error) {
    log.push(`Fetch Error: ${error?.message ?? error}`)
  }
}

const fetchBestOffer = async (tokenId: number, log: Log): Promise<any> => {
  try {
    const url = opensea.getBestOffer(tokenId)
    const response = await fetch(url, opensea.getOpts)
    if (!response.ok) {
      log.push(
        `Fetch Error (Offers) - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const result = await response.json()
    return result
  } catch (error) {
    log.push(`Fetch Error (Offers): ${error?.message ?? error}`)
  }
}

const fetchBestListing = async (tokenId: number, log: Log): Promise<any> => {
  try {
    const url = opensea.getBestListing(tokenId)
    const response = await fetch(url, opensea.getOpts)
    if (!response.ok) {
      log.push(
        `Fetch Error (Listings) - ${response.status}: ${response.statusText}`,
        DEBUG === 'true'
          ? `DEBUG: ${JSON.stringify(await response.text())}`
          : '',
      )
      return
    }
    const result = await response.json()
    return result
  } catch (error) {
    log.push(`Fetch Error (Listings): ${error?.message ?? error}`)
  }
}

/**
 * Discord MessageEmbed
 */
const messageEmbed = async (tokenId: number, log: Log) => {
  if (
    tokenId < Number(MIN_TOKEN_ID) ||
    tokenId > Number(MAX_TOKEN_ID) ||
    Number.isNaN(tokenId)
  ) {
    log.push(`Skipping, cannot process #${tokenId}`)
    return
  }

  const fields: any[] = []
  const nft = await fetchNFT(tokenId, log)
  if (!nft) return

  // Format owner
  if (nft.owners?.length > 0) {
    const owner = nft.owners[0]
    const name = await username(owner.address, log)
    fields.push({
      name: 'Owner',
      value: name,
      inline: true,
    })
  }

  // Format last sale
  const lastSale = await fetchLastSale(tokenId, log)
  if (lastSale) {
    const { quantity, decimals, symbol } = lastSale.payment
    const price = formatAmount(quantity, decimals, symbol)
    fields.push({
      name: 'Last Sale',
      value: price,
      inline: true,
    })
  }

  // Format best listing
  const listing = await fetchBestListing(tokenId, log)
  if (Object.keys(listing).length > 0) {
    const { value, decimals, currency } = listing.price.current
    const price = formatAmount(value, decimals, currency)
    fields.push({
      name: listing.type === 'basic' ? 'Listed For' : 'Auction',
      value: price,
      inline: true,
    })
  }

  // Format best offer
  const offer = await fetchBestOffer(tokenId, log)
  if (Object.keys(offer).length > 0) {
    // Skip collection offers since they are repetitive
    if (!offer.criteria?.collection) {
      const { value, decimals, currency } = offer.price
      const price = formatAmount(value, decimals, currency)
      fields.push({
        name: 'Best Offer',
        value: price,
        inline: true,
      })
    }
  }

  // Format custom description
  const description = (CUSTOM_DESCRIPTION ?? '').replace(
    '{id}',
    tokenId.toString(),
  )

  return new EmbedBuilder()
    .setColor('#5296d5')
    .setTitle(`${TOKEN_NAME} #${tokenId}`)
    .setURL(permalink(nft.identifier))
    .setFields(fields)
    .setImage(imageForNFT(nft))
    .setDescription(description)
}

const matches = async (message: any, log: Log) => {
  const matches = []
  const regex = /#(random|rand|\?|\d*)(\s|\n|\W|$)/g
  let match = regex.exec(message.content)
  if (match !== null) {
    log.push(
      `${TOKEN_NAME} - Message from ${message.author.username} in #${
        message.channel?.name ?? message.channelId
      }:\n> ${message.content}`,
    )
  }
  while (match !== null) {
    const id = match[1]
    if (id === 'random' || id === 'rand' || id === '?') {
      // matches: 'random' or 'rand' or '?'
      matches.push(random())
    } else if (/^[0-9]+/.test(id)) {
      // matches: number digits (token id)
      matches.push(Number(id))
    } else {
      log.push(`Skipping, could not understand input: ${id}`)
    }
    match = regex.exec(message.content)
  }
  return matches
}

const channelName = (channel: Channel | any) => {
  return channel.name ?? channel.channelId
}

const sendMessage = async (channel: Channel | any, embed: EmbedBuilder) => {
  await channel.send({ embeds: [embed] })
}

const setupRandomIntervals = async (client: Client) => {
  if (!RANDOM_INTERVALS) return
  const intervals = RANDOM_INTERVALS.split(',')
  for (const interval of intervals) {
    const [channelId, minutesStr] = interval.split('=')
    const minutes = Number(minutesStr)
    const channel = await client.channels.fetch(channelId)
    const chanName = channelName(channel)
    console.log(
      `Sending random token every ${
        minutes === 1 ? 'minute' : `${minutes} minutes`
      } to #${chanName}`,
    )
    console.log(separator)
    setInterval(
      async () => {
        const tokenId = random()
        const log: Log = []
        const embed = await messageEmbed(tokenId, log)
        log.push(`Sending random token to #${chanName}`)
        await sendMessage(channel, embed)
        if (log.length > 0) {
          log.push(separator)
          for (const l of log) {
            console.log(l)
          }
        }
      },
      minutes * 60 * 1000,
    )
  }
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message],
  })

  const slug = await fetchCollectionSlug(TOKEN_ADDRESS, CHAIN)
  if (!slug) {
    throw new Error('Could not find collection slug')
  }

  client.on('ready', async () => {
    console.log(separator)
    console.log(`Logged in as ${client?.user?.tag}!`)
    console.log('Listening for messages…')
    console.log(separator)
    await setupRandomIntervals(client)
  })

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return

    const log: Log = []
    // try {
    const tokenIds = await matches(message, log)

    const embeds = []
    let embedLog = 'Replied with'

    for (const tokenId of tokenIds.slice(0, 5)) {
      const embed = await messageEmbed(tokenId, log)
      if (embed) {
        embeds.push(embed)
        embedLog += ` #${tokenId}`
      }
    }
    if (embeds.length > 0) {
      await message.reply({ embeds })
      log.push(embedLog)
    }
    // } catch (error) {
    //   log.push(`Error: ${error}`)
    // }
    if (log.length > 0) {
      log.push(separator)
      for (const l of log) {
        console.log(l)
      }
    }
  })

  /**
   * Start
   */
  client.login(DISCORD_TOKEN)
}

main()
