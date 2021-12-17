import { URLSearchParams } from 'url'
import fetch from 'node-fetch'
import { Client, Intents, MessageEmbed } from 'discord.js'
import { ethers } from 'ethers'

const {
  DISCORD_TOKEN,
  OPENSEA_API_TOKEN,
  INFURA_PROJECT_ID,
  TOKEN_NAME,
  TOKEN_ADDRESS,
  MIN_TOKEN_ID,
  MAX_TOKEN_ID,
} = process.env

const openseaFetchOpts = {
  method: 'GET',
  headers: { Accept: 'application/json', 'X-API-KEY': OPENSEA_API_TOKEN },
} as any

const separator = '-'.repeat(60)
const openseaAPI = 'https://api.opensea.io/api/v1/'
const openseaAssets = `${openseaAPI}assets/`
const openseaAsset = (tokenId: number) =>
  `${openseaAPI}asset/${TOKEN_ADDRESS}/${tokenId}/`
const openseaUser = (username: string) => `${openseaAPI}user/${username}/`
const permalink = (tokenId: number) =>
  `https://opensea.io/assets/${TOKEN_ADDRESS}/${tokenId}`

const shortAddr = (addr: string) =>
  addr.slice(0, 7) + '...' + addr.slice(15, 20)

const randomTokenId = (
  min = Number(MIN_TOKEN_ID),
  max = Number(MAX_TOKEN_ID)
) => {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min)
}

const provider = new ethers.providers.InfuraProvider(
  'mainnet',
  INFURA_PROJECT_ID
)

type Log = string[]

const ensName = async (name: string, log: Log) => {
  log.push(`Fetching ens name: ${name}`)
  const result = await provider.resolveName(name)
  if (!result) {
    log.push(`Skipping, no address found for ${name}`)
    return
  }
  return result
}
const openseaName = async (username: string, log: Log) => {
  log.push(`Fetching OpenSea username: ${username}...`)
  const response = await fetch(openseaUser(username), openseaFetchOpts)
  const user = await response.json()
  if (!user || !user.account?.address) {
    log.push('Skipping, no user found')
    return
  }
  return user.account.address
}

const fetchAsset = async (tokenId: number, log: Log): Promise<any> => {
  log.push(`Fetching #${tokenId}...`)
  const response = await fetch(openseaAsset(tokenId), openseaFetchOpts)
  const asset = await response.json()
  return asset
}

const fetchRandomAssetByAddr = async (addr: string, log: Log): Promise<any> => {
  const params = new URLSearchParams({
    asset_contract_address: TOKEN_ADDRESS,
    owner: addr,
    limit: 1,
  } as any)
  const response = await fetch(`${openseaAssets}?${params}`, openseaFetchOpts)
  const { assets } = await response.json()
  if (assets.length === 0) {
    log.push(`Skipping, no tokens found for address ${addr}`)
    return
  }
  return Number(assets[0].token_id)
}

const generateEmbed = async (tokenId: number, log: Log) => {
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
    .setURL(permalink(tokenId))
    .setFields(fields)
    .setImage(asset.image_original_url)
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

    const log = []

    const regex = /#(\d*|\w*.eth|\w*|random)(\s|\n|$)/g
    const matches = []
    let match = regex.exec(message.content)
    if (match !== null) {
      log.push(
        `Message from ${message.author.username} in #${
          (message.channel as any)?.name ?? message.channelId
        }:\n> ${message.content}`
      )
    }
    while (match !== null) {
      const id = match[1]
      if (id === 'random') {
        // matches: 'random'
        matches.push(randomTokenId())
      } else if (/^[0-9]+/.test(id)) {
        // matches: number digits
        matches.push(id)
      } else if (/\w*\.eth/.test(id)) {
        // matches: .eth name
        if (!INFURA_PROJECT_ID) return
        const addr = await ensName(id, log)
        if (!addr) return
        const random = await fetchRandomAssetByAddr(addr, log)
        if (random) matches.push(random)
      } else if (/\w*/.test(id)) {
        // matches: word or number opensea username
        const addr = await openseaName(id, log)
        if (!addr) return
        const random = await fetchRandomAssetByAddr(addr, log)
        if (random) matches.push(random)
      } else {
        log.push(`Skipping, could not understand input: ${id}`)
      }
      match = regex.exec(message.content)
    }

    if (matches.length === 0) return

    for (const tokenId of matches.slice(0, 3)) {
      const embed = await generateEmbed(tokenId, log)
      if (!embed) continue
      await message.reply({ embeds: [embed] })
      log.push(`Replied with #${tokenId}`)
    }
    log.push(separator)
    for (const l of log) {
      console.log(l)
    }
  })

  client.login(DISCORD_TOKEN)
}

main()
