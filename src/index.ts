import {
  type Channel,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  type HexColorString,
  Partials,
} from "discord.js";
import {
  getCollections,
  getSlugForCollection,
  initCollectionSlugs,
  initCollections,
  isValidTokenId,
  parseMessageMatches,
  randomTokenId,
} from "./collection";
import {
  MAX_EMBEDS_PER_MESSAGE,
  ONE_SECOND_MS,
  SECONDS_PER_MINUTE,
  SEPARATOR,
} from "./constants";
import { createLogger, logger } from "./logger";
import {
  fetchBestListing,
  fetchBestOffer,
  fetchLastSale,
  fetchNFT,
  GET_OPTS,
  getUsername,
  urls,
} from "./opensea";
import { getStateManager } from "./state";
import type {
  CollectionConfig,
  EmbedResult,
  IncomingMessage,
  Log,
  TokenMatch,
} from "./types";
import {
  formatAmount,
  formatShortDate,
  getHighResImage,
  pluralize,
} from "./utils";

const log = createLogger("Embed");

const { DISCORD_TOKEN, RANDOM_INTERVALS } = process.env;

/** Max attempts to find a non-duplicate random token */
const MAX_RANDOM_ATTEMPTS = 10;

/**
 * Build a Discord embed for a single NFT
 */
const buildEmbed = async (
  collection: CollectionConfig,
  tokenId: number,
  userLog: Log
): Promise<EmbedBuilder | undefined> => {
  if (!isValidTokenId(collection, tokenId)) {
    userLog.push(`Skipping invalid token: ${collection.name} #${tokenId}`);
    log.debug(`Invalid token ID: ${collection.name} #${tokenId}`);
    return;
  }

  log.debug(`Building embed for ${collection.name} #${tokenId}`);
  const startTime = Date.now();

  const slug = await getSlugForCollection(collection, userLog);
  if (!slug) {
    userLog.push(`No slug found for collection: ${collection.name}`);
    log.warn(`No slug found for collection: ${collection.name}`);
    return;
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];
  const nft = await fetchNFT(collection, tokenId, userLog);

  // Fetch all metadata in parallel
  log.debug(`Fetching metadata for ${collection.name} #${tokenId}`);
  const [lastSale, bestOffer, bestListing] = await Promise.all([
    fetchLastSale(collection, tokenId, userLog),
    fetchBestOffer(slug, tokenId, userLog),
    fetchBestListing(slug, tokenId, userLog),
  ]);

  // Owner field
  const owners = nft.owners ?? [];
  if (owners.length > 0) {
    const owner = owners.at(0);
    if (owner) {
      const name = await getUsername(owner.address, userLog);
      fields.push({ name: "Owner", value: name, inline: true });
      log.debug(`Owner: ${name}`);
    }
  }

  // Last sale field
  if (lastSale) {
    const { quantity, decimals, symbol } = lastSale.payment;
    const price = formatAmount(quantity, decimals, symbol);
    const date = new Date(lastSale.closing_date * ONE_SECOND_MS);
    const formattedDate = formatShortDate(date);
    fields.push({
      name: "Last Sale",
      value: `${price} (${formattedDate})`,
      inline: true,
    });
    log.debug(`Last sale: ${price}`);
  }

  // Best listing field
  if (bestListing?.price?.current) {
    const { value, decimals, currency } = bestListing.price.current;
    const price = formatAmount(value, decimals, currency);
    fields.push({ name: "Listed For", value: price, inline: true });
    log.debug(`Listed for: ${price}`);
  }

  // Best offer field (skip collection-wide offers)
  if (bestOffer?.price && !bestOffer.criteria?.collection) {
    const { value, decimals, currency } = bestOffer.price;
    const price = formatAmount(value, decimals, currency);
    fields.push({ name: "Best Offer", value: price, inline: true });
    log.debug(`Best offer: ${price}`);
  }

  // Build the embed
  const description = (collection.customDescription ?? "").replace(
    "{id}",
    tokenId.toString()
  );

  const embed = new EmbedBuilder()
    .setColor((collection.color ?? "#121212") as HexColorString)
    .setTitle(`${collection.name} #${tokenId}`)
    .setURL(nft.opensea_url)
    .setFields(fields);

  if (description) {
    embed.setDescription(description);
  }

  const image = getHighResImage(nft.image_url);
  if (image) {
    embed.setImage(image);
  }

  const duration = Date.now() - startTime;
  log.debug(
    `Built embed for ${collection.name} #${tokenId} with ${fields.length} fields (${duration}ms)`
  );

  return embed;
};

/**
 * Build embeds for multiple token matches
 */
const buildEmbedsForMatches = async (
  matches: TokenMatch[],
  userLog: Log
): Promise<EmbedResult> => {
  const embeds: EmbedBuilder[] = [];
  const parts: string[] = [];

  log.debug(`Building embeds for ${matches.length} match(es)`);

  for (const match of matches.slice(0, MAX_EMBEDS_PER_MESSAGE)) {
    const embed = await buildEmbed(match.collection, match.tokenId, userLog);
    if (embed) {
      embeds.push(embed);
      const prefix = match.collection.prefix
        ? `${match.collection.prefix}#`
        : "#";
      parts.push(`${prefix}${match.tokenId}`);
    }
  }

  const embedLog = parts.length > 0 ? `Replied with ${parts.join(", ")}` : "";
  return { embeds, embedLog };
};

/**
 * Get channel name for logging
 */
const getChannelName = (channel: Channel | null): string => {
  if (!channel) {
    return "unknown-channel";
  }
  const obj = channel as unknown as Record<string, unknown>;
  if (typeof obj.name === "string") {
    return obj.name;
  }
  if (typeof obj.id === "string") {
    return obj.id;
  }
  return "unknown-channel";
};

/**
 * Get channel display name from a message
 */
const getChannelDisplay = (msg: IncomingMessage): string => {
  const chObj = (msg.channel ?? {}) as Record<string, unknown>;
  if (typeof chObj.name === "string") {
    return chObj.name;
  }
  if (typeof msg.channelId === "string") {
    return msg.channelId;
  }
  return "unknown-channel";
};

/**
 * Send an embed to a channel
 */
const sendEmbed = async (
  channel: Channel | null,
  embed: EmbedBuilder
): Promise<void> => {
  if (!channel) {
    return;
  }
  const obj = channel as unknown as Record<string, unknown>;
  if (typeof obj.send === "function") {
    const sendFn = obj.send as (arg: {
      embeds: EmbedBuilder[];
    }) => Promise<unknown>;
    await sendFn({ embeds: [embed] });
  }
};

/**
 * Process an incoming Discord message
 */
const processMessage = async (msg: IncomingMessage): Promise<void> => {
  const userLog: Log = [];
  const startTime = Date.now();

  try {
    const matches = parseMessageMatches(msg.content);

    if (matches.length === 0) {
      return;
    }

    const channelDisplay = getChannelDisplay(msg);

    // Log the message
    log.info(`Message from ${msg.author.username} in #${channelDisplay}`);
    log.debug(`Content: ${msg.content}`);
    userLog.push(
      `Message from ${msg.author.username} in #${channelDisplay}:\n> ${msg.content}`
    );

    const { embeds, embedLog } = await buildEmbedsForMatches(matches, userLog);

    if (embeds.length > 0) {
      await msg.reply({ embeds });
      userLog.push(embedLog);

      const duration = Date.now() - startTime;
      log.info(`${embedLog} (${duration}ms)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    userLog.push(`Error: ${message}`);
    log.error(`Error processing message: ${message}`);
  }

  if (userLog.length > 0) {
    userLog.push(SEPARATOR);
    for (const line of userLog) {
      logger.info(line);
    }
  }
};

/**
 * Get a random token that hasn't been recently sent to a channel
 */
const getUniqueRandomToken = (
  collection: CollectionConfig,
  channelId: string
): number => {
  const stateManager = getStateManager();

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const tokenId = randomTokenId(collection);
    if (!stateManager.wasRecentlySent(channelId, tokenId)) {
      log.debug(
        `Found unique token #${tokenId} for channel ${channelId} (attempt ${attempt + 1})`
      );
      return tokenId;
    }
    log.debug(
      `Token #${tokenId} recently sent to channel ${channelId}, trying again`
    );
  }

  // Fall back to any random token if we can't find a unique one
  const tokenId = randomTokenId(collection);
  log.debug(
    `Could not find unique token after ${MAX_RANDOM_ATTEMPTS} attempts, using #${tokenId}`
  );
  return tokenId;
};

/**
 * Parse random interval config to get target collections
 *
 * Format: CHANNEL_ID=minutes[:collection_option]
 * - No option: default collection only
 * - `*`: rotate through all collections
 * - `prefix`: specific collection by prefix
 * - `prefix1+prefix2`: rotate through listed collections (use + since , is separator)
 */
const parseRandomCollections = (
  collectionOption: string | undefined
): CollectionConfig[] => {
  const allCollections = getCollections();
  const defaultCollection = allCollections.find((c) => c.prefix === "");

  if (!collectionOption) {
    // No option = default collection only
    return defaultCollection ? [defaultCollection] : [];
  }

  if (collectionOption === "*") {
    // All collections
    return allCollections;
  }

  // Specific collection(s) by prefix - use + as separator since , separates intervals
  const prefixes = collectionOption.split("+").map((p) => p.trim());
  const result: CollectionConfig[] = [];

  for (const prefix of prefixes) {
    // Empty string means default collection
    const collection = allCollections.find(
      (c) => c.prefix === (prefix === "default" ? "" : prefix)
    );
    if (collection) {
      result.push(collection);
    } else {
      log.warn(`Unknown collection prefix in random config: "${prefix}"`);
    }
  }

  return result;
};

/** Track rotation index per channel for multi-collection random */
const rotationIndex = new Map<string, number>();

/**
 * Get the next collection in rotation for a channel
 */
const getNextCollection = (
  channelId: string,
  collections: CollectionConfig[]
): CollectionConfig => {
  if (collections.length === 1) {
    return collections.at(0) as CollectionConfig;
  }

  const currentIndex = rotationIndex.get(channelId) ?? 0;
  const collection = collections.at(
    currentIndex % collections.length
  ) as CollectionConfig;
  rotationIndex.set(channelId, currentIndex + 1);

  return collection;
};

/**
 * Set up random interval posting for collections
 *
 * Format: CHANNEL_ID=minutes[:collection_option]
 * Examples:
 *   - 123456=30           (default collection every 30 min)
 *   - 123456=30:*         (rotate all collections every 30 min)
 *   - 123456=30:artifacts (artifacts collection every 30 min)
 *   - 123456=30:default+artifacts (rotate between default and artifacts)
 */
const setupRandomIntervals = async (client: Client): Promise<void> => {
  if (!RANDOM_INTERVALS) {
    log.debug("No random intervals configured");
    return;
  }

  const stateManager = getStateManager();

  // Print header for random intervals config
  logger.info("");
  logger.info("┌─ ⏱️  RANDOM INTERVALS");
  logger.info("│");

  for (const interval of RANDOM_INTERVALS.split(",")) {
    const [channelId, configStr] = interval.split("=");
    const [minutesStr, collectionOption] = (configStr ?? "").split(":");
    const minutes = Number(minutesStr);

    if (!channelId || Number.isNaN(minutes) || minutes <= 0) {
      log.warn(`Invalid random interval config: ${interval}`);
      continue;
    }

    const targetCollections = parseRandomCollections(collectionOption);
    if (targetCollections.length === 0) {
      log.warn(`No valid collections for random interval: ${interval}`);
      continue;
    }

    const channel = await client.channels.fetch(channelId);
    const chanName = getChannelName(channel);
    const collectionLabel = getCollectionLabel(collectionOption);

    // Print config for this interval
    logger.info(`│  📢  Channel #${chanName}`);
    logger.info(`│     ├─ Interval: ${minutes} minute(s)`);
    logger.info(`│     └─ Collections: ${collectionLabel}`);
    logger.info("│");

    // Log what we're setting up
    const collectionNames = targetCollections.map((c) => c.name).join(", ");
    const rotateLabel = targetCollections.length > 1 ? " (rotating)" : "";
    log.info(
      `Random posting: ${collectionNames}${rotateLabel} to #${chanName} every ${pluralize(minutes, "minute")}`
    );

    setInterval(
      async () => {
        const userLog: Log = [];
        const startTime = Date.now();

        // Get next collection in rotation
        const collection = getNextCollection(channelId, targetCollections);
        const tokenId = getUniqueRandomToken(collection, channelId);

        const prefix = collection.prefix ? `${collection.prefix}#` : "#";
        log.debug(
          `Random interval triggered for #${chanName}, ${collection.name} ${prefix}${tokenId}`
        );

        const embed = await buildEmbed(collection, tokenId, userLog);

        if (embed) {
          // Track this token as recently sent
          stateManager.addRecentToken(channelId, tokenId);
          await stateManager.save();

          userLog.push(
            `Sending random ${collection.name} ${prefix}${tokenId} to #${chanName}`
          );
          await sendEmbed(channel, embed);

          const duration = Date.now() - startTime;
          log.info(
            `Sent random ${collection.name} ${prefix}${tokenId} to #${chanName} (${duration}ms)`
          );
        }

        if (userLog.length > 0) {
          userLog.push(SEPARATOR);
          for (const line of userLog) {
            logger.info(line);
          }
        }
      },
      minutes * SECONDS_PER_MINUTE * ONE_SECOND_MS
    );
  }

  logger.info("└─");
  logger.info("");
};

/**
 * Print startup banner with ASCII art
 */
const printBanner = (): void => {
  const banner = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ███╗   ██╗███████╗████████╗    ███████╗███╗   ███╗██████╗ ███████╗██████╗  ║
║   ████╗  ██║██╔════╝╚══██╔══╝    ██╔════╝████╗ ████║██╔══██╗██╔════╝██╔══██  ║
║   ██╔██╗ ██║█████╗     ██║       █████╗  ██╔████╔██║██████╔╝█████╗  ██║  ██  ║
║   ██║╚██╗██║██╔══╝     ██║       ██╔══╝  ██║╚██╔╝██║██╔══██╗██╔══╝  ██║  ██  ║
║   ██║ ╚████║██║        ██║       ███████╗██║ ╚═╝ ██║██████╔╝███████╗██████╔  ║
║   ╚═╝  ╚═══╝╚═╝        ╚═╝       ╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝╚═════╝  ║
║                                                                              ║
║                  Discord NFT Embed Bot - Token Lookup                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝`;

  for (const line of banner.split("\n")) {
    logger.info(line);
  }
};

/**
 * Get human-readable label for collection option in random intervals
 */
const getCollectionLabel = (collectionOption: string | undefined): string => {
  if (!collectionOption) {
    return "default collection";
  }
  if (collectionOption === "*") {
    return "all collections";
  }
  return collectionOption.replace(/\+/g, ", ");
};

/**
 * Print collection configuration
 */
const printCollectionConfig = (c: CollectionConfig): void => {
  const chain = c.chain ?? "ethereum";
  const tokenRange =
    c.maxTokenId !== undefined ? `0-${c.maxTokenId}` : "unlimited";
  const syntax = c.prefix ? `#1234, ${c.prefix}#1234` : "#1234";

  logger.info(`│  🏷️   ${c.name}`);
  logger.info(`│     ├─ Address: ${c.address}`);
  logger.info(`│     ├─ Chain: ${chain}`);
  logger.info(`│     ├─ Syntax: ${syntax}`);
  logger.info(`│     └─ Token Range: ${tokenRange}`);
  logger.info("│");
};

/**
 * Print configuration summary
 */
const printConfig = (): void => {
  const collections = getCollections();
  const { OPENSEA_API_TOKEN, LOG_LEVEL } = process.env;

  logger.info("");
  logger.info("┌─ 📋 CONFIGURATION");
  logger.info("│");

  // API Status
  const apiStatus = OPENSEA_API_TOKEN ? "✅ Configured" : "❌ Missing";
  logger.info(`│  🔑  OpenSea API: ${apiStatus}`);
  logger.info(`│  📝  Log Level: ${LOG_LEVEL ?? "info"}`);

  logger.info("│");
  logger.info("├─ 📦 COLLECTIONS");
  logger.info("│");

  for (const c of collections) {
    printCollectionConfig(c);
  }

  logger.info("└─");
  logger.info("");
};

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printBanner();

  // Initialize collections from environment
  initCollections();

  // Print configuration
  printConfig();

  // Fetch slugs for all collections
  await initCollectionSlugs();

  // Load persisted state
  const stateManager = getStateManager();
  await stateManager.load();

  // Create Discord client
  log.debug("Creating Discord client");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message],
  });

  client.on("ready", async () => {
    logger.info(SEPARATOR);
    logger.info(`🤖 Logged in as ${client.user?.tag}`);
    logger.info("👂 Listening for messages...");
    logger.info(SEPARATOR);
    await setupRandomIntervals(client);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) {
      return;
    }
    await processMessage(message as unknown as IncomingMessage);
  });

  log.debug("Connecting to Discord");
  await client.login(DISCORD_TOKEN);
}

// Only auto-start when not under test
if (process.env.NODE_ENV !== "test") {
  main();
}

// Export for testing
export { main, buildEmbed, processMessage };

// Re-export opensea utilities for test compatibility
export const opensea = {
  GET_OPTS,
  api: "https://api.opensea.io/api/v2/",
  getAccount: urls.account,
  getNFT: (tokenId: number) => {
    const collections = getCollections();
    const defaultCollection = collections.find((c) => c.prefix === "");
    if (!defaultCollection) {
      return "";
    }
    return urls.nft(defaultCollection, tokenId);
  },
  getEvents: (tokenId: number) => {
    const collections = getCollections();
    const defaultCollection = collections.find((c) => c.prefix === "");
    if (!defaultCollection) {
      return "";
    }
    return urls.events(defaultCollection, tokenId);
  },
};
