import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Channel,
  Partials,
} from 'discord.js'
import {
  Log,
  chain,
  formatAmount,
  imageForNFT,
  maxTokenId,
  minTokenId,
  random,
  separator,
  username,
  openseaGet,
} from './utils'

const {
  DISCORD_TOKEN,
  OPENSEA_API_TOKEN,
  TOKEN_NAME,
  TOKEN_ADDRESS,
  RANDOM_INTERVALS,
  CUSTOM_DESCRIPTION,
} = process.env

/**
 * OpenSea
 */
export const opensea = {
  GET_OPTS: {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-KEY': OPENSEA_API_TOKEN },
  } as any,
  api: 'https://api.opensea.io/api/v2/',
  getAccount: (address: string) => `${opensea.api}accounts/${address}`,
  getNFT: (tokenId: number) =>
    `${opensea.api}chain/${chain}/contract/${TOKEN_ADDRESS}/nfts/${tokenId}`,
  getContract: () => `${opensea.api}chain/${chain}/contract/${TOKEN_ADDRESS}`,
  getBestOffer: (tokenId: number) =>
    `${opensea.api}offers/collection/${collectionSlug}/nfts/${tokenId}/best`,
  getBestListing: (tokenId: number) =>
    `${opensea.api}listings/collection/${collectionSlug}/nfts/${tokenId}/best`,
  getEvents: (tokenId: number) =>
    `${opensea.api}events/chain/${chain}/contract/${TOKEN_ADDRESS}/nfts/${tokenId}`,
}

/**
 * Fetch functions
 */
let collectionSlug
const fetchCollectionSlug = async (address: string) => {
  if (collectionSlug) return collectionSlug
  console.log(`Getting collection slug for ${address} on chain ${chain}…`)
  const url = opensea.getContract()
  const log: Log = []
  const result = await openseaGet(url, log)
  for (const l of log) {
    console.log(l)
  }
  collectionSlug = result.collection
  console.log(`Got collection slug: ${collectionSlug}`)
  return collectionSlug
}

const fetchNFT = async (tokenId: number, log: Log): Promise<any> => {
  log.push(`Fetching #${tokenId}…`)
  const url = opensea.getNFT(tokenId)
  const result = await openseaGet(url, log)
  return result.nft
}

const fetchLastSale = async (tokenId: number, log: Log): Promise<any> => {
  const url = `${opensea.getEvents(tokenId)}?event_type=sale&limit=1`
  const result = await openseaGet(url, log)
  return result?.asset_events[0]
}

const fetchBestOffer = async (tokenId: number, log: Log): Promise<any> => {
  const url = opensea.getBestOffer(tokenId)
  const result = await openseaGet(url, log)
  return result
}

const fetchBestListing = async (tokenId: number, log: Log): Promise<any> => {
  const url = opensea.getBestListing(tokenId)
  const result = await openseaGet(url, log)
  return result
}

/**
 * Discord MessageEmbed
 */
const messageEmbed = async (tokenId: number, log: Log) => {
  if (tokenId < minTokenId || tokenId > maxTokenId || Number.isNaN(tokenId)) {
    log.push(`Skipping, cannot process #${tokenId}`)
    return
  }

  const fields: any[] = []
  let nft: any

  const getOwner = async () => {
    nft = await fetchNFT(tokenId, log)
    if (nft.owners?.length > 0) {
      const owner = nft.owners[0]
      const name = await username(owner.address, log)
      fields.push({
        name: 'Owner',
        value: name,
        inline: true,
      })
    }
  }

  const getLastSale = async () => {
    const lastSale = await fetchLastSale(tokenId, log)
    if (lastSale) {
      const { quantity, decimals, symbol } = lastSale.payment
      const price = formatAmount(quantity, decimals, symbol)
      const date = new Date(lastSale.closing_date * 1000)
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: '2-digit',
      }).format(date)
      fields.push({
        name: 'Last Sale',
        value: `${price} (${formattedDate.replace(' ', " '")})`,
        inline: true,
      })
    }
  }

  const getBestListing = async () => {
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
  }

  const getBestOffer = async () => {
    // Get best offer
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
  }

  const results = await Promise.all([
    getOwner(),
    getLastSale(),
    getBestListing(),
    getBestOffer(),
  ])

  // Format custom description
  const description = (CUSTOM_DESCRIPTION ?? '').replace(
    '{id}',
    tokenId.toString(),
  )

  const embed = new EmbedBuilder()
    .setColor('#121212')
    .setTitle(`${TOKEN_NAME} #${tokenId}`)
    .setURL(nft.opensea_url)
    .setFields(fields)
    .setDescription(description)

  const image = imageForNFT(nft)
  if (image) {
    embed.setImage(image)
  }

  return embed
}

const matches = async (message: any, log: Log) => {
  const matches: number[] = []
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

  if (!TOKEN_ADDRESS) {
    throw new Error('TOKEN_ADDRESS is not set')
  }
  const slug = await fetchCollectionSlug(TOKEN_ADDRESS)
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
    try {
      const tokenIds = await matches(message, log)

      const embeds: EmbedBuilder[] = []
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
    } catch (error) {
      log.push(`Error: ${error}`)
    }
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
