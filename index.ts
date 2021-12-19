import { URLSearchParams } from 'url'
import fetch from 'node-fetch'
import { Client, Intents, MessageEmbed } from 'discord.js'
import { ethers } from 'ethers'

type Log = string[]
const separator = '-'.repeat(60)

const {
  DISCORD_TOKEN,
  OPENSEA_API_TOKEN,
  INFURA_PROJECT_ID,
  TOKEN_NAME,
  TOKEN_ADDRESS,
  MIN_TOKEN_ID,
  MAX_TOKEN_ID,
} = process.env

/**
 * Returns a shortened version of a full ethereum address
 * (e.g. 0x38a16...c7eb3)
 */
const shortAddr = (addr: string) =>
  addr.slice(0, 7) + '...' + addr.slice(15, 20)

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
  api: 'https://api.opensea.io/api/v1/',
  collection: `https://opensea.io/assets/${TOKEN_ADDRESS}`,
  assets: (tokenId: number) => `${opensea.api}assets/`,
  asset: (tokenId: number) =>
    `${opensea.api}asset/${TOKEN_ADDRESS}/${tokenId}/`,
  user: (username: string) => `${opensea.api}user/${username}/`,
  permalink: (tokenId: number) => `${opensea.collection}/${tokenId}`,
}

const addrForOpenseaUsername = async (username: string, log: Log) => {
  log.push(`Fetching OpenSea username: ${username}`)
  const response = await fetch(opensea.user(username), opensea.getOpts)
  const user = await response.json()
  if (!user.account?.address) {
    log.push('Skipping, no user found')
    return
  }
  return user.account.address
}

/**
 * Fetch functions
 */
const fetchAsset = async (tokenId: number, log: Log): Promise<any> => {
  log.push(`Fetching #${tokenId}`)
  const response = await fetch(opensea.asset(tokenId), opensea.getOpts)
  const asset = await response.json()
  if (!asset.token_id) {
    log.push('Skipping, no asset found')
    return
  }
  return asset
}

const fetchRandomAssetByAddr = async (addr: string, log: Log) => {
  const params = new URLSearchParams({
    asset_contract_address: TOKEN_ADDRESS,
    owner: addr,
    limit: 50,
  } as any)
  const response = await fetch(`${opensea.assets}?${params}`, opensea.getOpts)
  const { assets } = await response.json()
  if (!assets || assets.length === 0) {
    log.push(`Skipping, no tokens found for address ${addr}`)
    return
  }
  const rand = random(0, assets.length - 1)
  return Number(assets[rand].token_id)
}

/**
 * ENS
 */
const provider = new ethers.providers.InfuraProvider(
  'mainnet',
  INFURA_PROJECT_ID
)

const addrForENSName = async (name: string, log: Log) => {
  log.push(`Fetching ens name: ${name}`)
  const result = await provider.resolveName(name)
  if (!result) {
    log.push(`Skipping, no address found for ${name}`)
    return
  }
  return result
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
  const asset = await fetchAsset(tokenId, log)
  if (!asset) return

  if (asset.owner) {
    const name = asset.owner.user?.username ?? shortAddr(asset.owner.address)
    fields.push({
      name: 'Owner',
      value: name,
      inline: true,
    })
  }

  if (asset.last_sale) {
    const { total_price, payment_token, event_timestamp } = asset.last_sale
    const { decimals, symbol, usd_price } = payment_token
    const price = ethers.utils.formatUnits(total_price, decimals)
    const usdPrice = ethers.FixedNumber.from(price)
      .mulUnsafe(ethers.FixedNumber.from(usd_price))
      .toUnsafeFloat()
      .toFixed(2)
    const lastSale = `${price} ${symbol} ($${usdPrice} USD)`
    fields.push({
      name: 'Last Sale',
      value: lastSale,
      inline: true,
    })
  }

  if (asset.orders?.length > 0) {
    const order = asset.orders.find(
      (o: any) => asset.owner.user?.username === o.maker?.user?.username
    )
    if (order) {
      const { base_price, payment_token_contract, closing_extendable } = order
      const { decimals, symbol, usd_price } = payment_token_contract
      const price = ethers.utils.formatUnits(base_price, decimals)
      const usdPrice = ethers.FixedNumber.from(price)
        .mulUnsafe(ethers.FixedNumber.from(usd_price))
        .toUnsafeFloat()
        .toFixed(2)
      const listedFor = `${price} ${symbol} ($${usdPrice} USD)`
      fields.push({
        name: closing_extendable ? 'Auction' : 'Listed For',
        value: listedFor,
        inline: true,
      })
    }
  }

  if (asset.orders?.length > 0) {
    const order = asset.orders.find(
      (o: any) => asset.owner.user?.username !== o.maker?.user?.username
    )
    if (order) {
      const { base_price, payment_token_contract } = order
      const { decimals, symbol, usd_price } = payment_token_contract
      const price = ethers.utils.formatUnits(base_price, decimals)
      const usdPrice = ethers.FixedNumber.from(price)
        .mulUnsafe(ethers.FixedNumber.from(usd_price))
        .toUnsafeFloat()
        .toFixed(2) as unknown as number
      if (usdPrice > 100) {
        const highestOffer = `${price} ${symbol} ($${usdPrice} USD)`
        fields.push({
          name: 'Highest Offer',
          value: highestOffer,
          inline: true,
        })
      }
    }
  }

  return new MessageEmbed()
    .setColor('#5296d5')
    .setTitle(`${TOKEN_NAME} #${tokenId}`)
    .setURL(opensea.permalink(tokenId))
    .setFields(fields)
    .setImage(asset.image_original_url)
}

const matches = async (message: any, log: Log) => {
  const matches = []
  const regex = /#(\d*|\w*.eth|\w*|random)(\s|\n|\W|$)/g

  let match = regex.exec(message.content)
  if (match !== null) {
    log.push(
      `Message from ${message.author.username} in #${
        message.channel?.name ?? message.channelId
      }:\n> ${message.content}`
    )
  }
  while (match !== null) {
    const id = match[1]
    if (id === 'random') {
      // matches: 'random'
      matches.push(random())
    } else if (/^[0-9]+/.test(id)) {
      // matches: number digits (token id)
      matches.push(Number(id))
    } else if (/\w*\.eth/.test(id)) {
      // matches: .eth name
      const addr = await addrForENSName(id, log)
      if (addr) {
        const tokenId = await fetchRandomAssetByAddr(addr, log)
        if (tokenId) matches.push(tokenId)
      }
    } else if (/\w*/.test(id)) {
      // matches: opensea username
      const addr = await addrForOpenseaUsername(id, log)
      if (addr) {
        const tokenId = await fetchRandomAssetByAddr(addr, log)
        if (tokenId) matches.push(tokenId)
      }
    } else {
      log.push(`Skipping, could not understand input: ${id}`)
    }
    match = regex.exec(message.content)
  }
  return matches
}

async function main() {
  const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
    partials: ['MESSAGE'],
  })

  client.on('ready', () => {
    console.log(separator)
    console.log(`Logged in as ${client?.user?.tag}!`)
    console.log('Listening for messages...')
    console.log(separator)
  })

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return

    const log: Log = []
    try {
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
