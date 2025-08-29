import {
  type Channel,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { logger } from './logger';
import {
  chain,
  formatAmount,
  imageForNFT,
  type Log,
  maxTokenId,
  minTokenId,
  openseaGet,
  random,
  separator,
  username,
} from './utils';

// Constants
const ONE_SECOND_IN_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MAX_EMBEDS_PER_MESSAGE = 5;
const NUMBER_REGEX = /^[0-9]+/;
const HASHTAG_REGEX = /#(random|rand|\?|\d*)(\s|\n|\W|$)/g;

const {
  DISCORD_TOKEN,
  OPENSEA_API_TOKEN,
  TOKEN_NAME,
  TOKEN_ADDRESS,
  RANDOM_INTERVALS,
  CUSTOM_DESCRIPTION,
} = process.env;

/**
 * OpenSea
 */
export const opensea = {
  GET_OPTS: {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-API-KEY': OPENSEA_API_TOKEN ?? '',
    },
  } as const,
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
};

/**
 * Fetch functions
 */
let collectionSlug: string | undefined;
const fetchCollectionSlug = async (address: string) => {
  if (collectionSlug) {
    return collectionSlug;
  }
  logger.info(`Getting collection slug for ${address} on chain ${chain}…`);
  const url = opensea.getContract();
  const log: Log = [];
  const result = await openseaGet<{ collection: string }>(url, log);
  for (const l of log) {
    logger.info(l);
  }
  collectionSlug = result?.collection;
  logger.info(`Got collection slug: ${collectionSlug}`);
  return collectionSlug;
};

type OpenSeaOwner = { address: string };
type NFT = { owners?: OpenSeaOwner[]; opensea_url: string; image_url?: string };
type LastSale = {
  payment: { quantity: number; decimals: number; symbol: string };
  closing_date: number;
};
type BestOffer = {
  criteria?: { collection?: unknown };
  price: { value: number; decimals: number; currency: string };
};
type BestListing = {
  price: { current: { value: number; decimals: number; currency: string } };
};

const fetchNFT = async (tokenId: number, log: Log): Promise<NFT> => {
  log.push(`Fetching #${tokenId}…`);
  const url = opensea.getNFT(tokenId);
  const result = (await openseaGet<{ nft: NFT }>(url, log)) ?? undefined;
  if (!result?.nft) {
    throw new Error('Failed to fetch NFT');
  }
  return result.nft;
};

const fetchLastSale = async (
  tokenId: number,
  log: Log
): Promise<LastSale | undefined> => {
  const url = `${opensea.getEvents(tokenId)}?event_type=sale&limit=1`;
  const result = await openseaGet<{ asset_events?: LastSale[] }>(url, log);
  return result?.asset_events?.[0];
};

const fetchBestOffer = async (
  tokenId: number,
  log: Log
): Promise<BestOffer> => {
  const url = opensea.getBestOffer(tokenId);
  const result = await openseaGet<BestOffer>(url, log);
  return (result ?? ({} as BestOffer)) as BestOffer;
};

const fetchBestListing = async (
  tokenId: number,
  log: Log
): Promise<BestListing> => {
  const url = opensea.getBestListing(tokenId);
  const result = await openseaGet<BestListing>(url, log);
  return (result ?? ({} as BestListing)) as BestListing;
};

/**
 * Discord MessageEmbed
 */
const messageEmbed = async (tokenId: number, log: Log) => {
  if (tokenId < minTokenId || tokenId > maxTokenId || Number.isNaN(tokenId)) {
    log.push(`Skipping, cannot process #${tokenId}`);
    return;
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];
  const nft = await fetchNFT(tokenId, log);

  const getOwner = async () => {
    const owners = nft.owners ?? [];
    if (owners.length > 0) {
      const owner = owners[0];
      const name = await username(owner.address, log);
      fields.push({
        name: 'Owner',
        value: name,
        inline: true,
      });
    }
  };

  const getLastSale = async () => {
    const lastSale = await fetchLastSale(tokenId, log);
    if (lastSale) {
      const { quantity, decimals, symbol } = lastSale.payment;
      const price = formatAmount(quantity, decimals, symbol);
      const date = new Date(lastSale.closing_date * ONE_SECOND_IN_MS);
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: '2-digit',
      }).format(date);
      fields.push({
        name: 'Last Sale',
        value: `${price} (${formattedDate.replace(' ', " '")})`,
        inline: true,
      });
    }
  };

  const getBestListing = async () => {
    const listing = await fetchBestListing(tokenId, log);
    if (Object.keys(listing).length > 0) {
      const { value, decimals, currency } = listing.price.current;
      const price = formatAmount(value, decimals, currency);
      fields.push({
        name: 'Listed For',
        value: price,
        inline: true,
      });
    }
  };

  const getBestOffer = async () => {
    // Get best offer
    const offer = await fetchBestOffer(tokenId, log);
    if (Object.keys(offer).length > 0 && !offer.criteria?.collection) {
      const { value, decimals, currency } = offer.price;
      const price = formatAmount(value, decimals, currency);
      fields.push({
        name: 'Best Offer',
        value: price,
        inline: true,
      });
    }
  };

  const _results = await Promise.all([
    getOwner(),
    getLastSale(),
    getBestListing(),
    getBestOffer(),
  ]);

  // Format custom description
  const description = (CUSTOM_DESCRIPTION ?? '').replace(
    '{id}',
    tokenId.toString()
  );

  const embed = new EmbedBuilder()
    .setColor('#121212')
    .setTitle(`${TOKEN_NAME} #${tokenId}`)
    .setURL(nft.opensea_url)
    .setFields(fields)
    .setDescription(description);

  const image = imageForNFT(nft);
  if (image) {
    embed.setImage(image);
  }

  return embed;
};

const matches = (
  args: {
    content: string;
    authorUsername: string;
    channelDisplay: string;
  },
  log: Log
) => {
  const matchedIds: number[] = [];
  HASHTAG_REGEX.lastIndex = 0;
  let match = HASHTAG_REGEX.exec(args.content);
  if (match !== null) {
    log.push(
      `${TOKEN_NAME} - Message from ${args.authorUsername} in #${args.channelDisplay}:\n> ${args.content}`
    );
  }
  while (match !== null) {
    const id = match[1];
    if (id === 'random' || id === 'rand' || id === '?') {
      // matches: 'random' or 'rand' or '?'
      matchedIds.push(random());
    } else if (NUMBER_REGEX.test(id)) {
      // matches: number digits (token id)
      matchedIds.push(Number(id));
    } else {
      log.push(`Skipping, could not understand input: ${id}`);
    }
    match = HASHTAG_REGEX.exec(args.content);
  }
  return matchedIds;
};

const channelName = (channel: Channel | null): string => {
  const obj = (channel ?? {}) as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? (obj.name as string) : undefined;
  const id = typeof obj.id === 'string' ? (obj.id as string) : undefined;
  const channelId =
    typeof obj.channelId === 'string' ? (obj.channelId as string) : undefined;
  return name ?? channelId ?? id ?? 'unknown-channel';
};

const sendMessage = async (channel: Channel | null, embed: EmbedBuilder) => {
  const obj = (channel ?? {}) as Record<string, unknown>;
  const sendFn = obj.send as
    | ((arg: { embeds: EmbedBuilder[] }) => Promise<unknown>)
    | undefined;
  if (typeof sendFn === 'function') {
    await sendFn({ embeds: [embed] });
  }
};

const setupRandomIntervals = async (client: Client) => {
  if (!RANDOM_INTERVALS) {
    return;
  }
  const intervals = RANDOM_INTERVALS.split(',');
  for (const interval of intervals) {
    const [channelId, minutesStr] = interval.split('=');
    const minutes = Number(minutesStr);
    const channel = await client.channels.fetch(channelId);
    const chanName = channelName(channel);
    logger.info(
      `Sending random token every ${
        minutes === 1 ? 'minute' : `${minutes} minutes`
      } to #${chanName}`
    );
    logger.info(separator);
    setInterval(
      async () => {
        const tokenId = random();
        const log: Log = [];
        const embed = await messageEmbed(tokenId, log);
        log.push(`Sending random token to #${chanName}`);
        await sendMessage(channel, embed as EmbedBuilder);
        if (log.length > 0) {
          log.push(separator);
          for (const l of log) {
            logger.info(l);
          }
        }
      },
      minutes * SECONDS_PER_MINUTE * ONE_SECOND_IN_MS
    );
  }
};

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message],
  });

  if (!TOKEN_ADDRESS) {
    throw new Error('TOKEN_ADDRESS is not set');
  }
  const slug = await fetchCollectionSlug(TOKEN_ADDRESS);
  if (!slug) {
    throw new Error('Could not find collection slug');
  }

  client.on('ready', async () => {
    logger.info(separator);
    logger.info(`Logged in as ${client?.user?.tag}!`);
    logger.info('Listening for messages…');
    logger.info(separator);
    await setupRandomIntervals(client);
  });

  const buildEmbedsForTokenIds = async (
    tokenIds: number[],
    log: Log
  ): Promise<{ embeds: EmbedBuilder[]; embedLog: string }> => {
    const embeds: EmbedBuilder[] = [];
    let embedLog = 'Replied with';
    for (const tokenId of tokenIds.slice(0, MAX_EMBEDS_PER_MESSAGE)) {
      const embed = await messageEmbed(tokenId, log);
      if (embed) {
        embeds.push(embed);
        embedLog += ` #${tokenId}`;
      }
    }
    return { embeds, embedLog };
  };

  type IncomingMessage = {
    content: string;
    author: { username: string; bot: boolean };
    channel?: { name?: string } | null;
    channelId?: string | null;
    reply: (arg: { embeds: EmbedBuilder[] }) => Promise<unknown>;
  };

  const getChannelDisplay = (msg: IncomingMessage): string => {
    const chObj = (msg.channel ?? {}) as Record<string, unknown>;
    const msgObj = msg as unknown as Record<string, unknown>;
    const name =
      typeof chObj.name === 'string' ? (chObj.name as string) : undefined;
    const channelId =
      typeof msgObj.channelId === 'string'
        ? (msgObj.channelId as string)
        : undefined;
    return name ?? channelId ?? 'unknown-channel';
  };

  const processMessage = async (msg: IncomingMessage) => {
    const log: Log = [];
    try {
      const tokenIds = matches(
        {
          content: msg.content,
          authorUsername: msg.author.username,
          channelDisplay: getChannelDisplay(msg),
        },
        log
      );
      const { embeds, embedLog } = await buildEmbedsForTokenIds(tokenIds, log);
      if (embeds.length > 0) {
        await msg.reply({ embeds });
        log.push(embedLog);
      }
    } catch (error) {
      log.push(`Error: ${error}`);
    }
    if (log.length > 0) {
      log.push(separator);
      for (const l of log) {
        logger.info(l);
      }
    }
  };

  client.on('messageCreate', async (message) => {
    if (message.author.bot) {
      return;
    }
    await processMessage(message as unknown as IncomingMessage);
  });

  /**
   * Start
   */
  client.login(DISCORD_TOKEN);
}

// Only auto-start when not under test
if (process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main();
}

export { main };
