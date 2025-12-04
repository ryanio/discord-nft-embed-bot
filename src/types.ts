import type { EmbedBuilder } from "discord.js";

/** Log accumulator for tracking operations */
export type Log = string[];

/** Configuration for a single NFT collection */
export type CollectionConfig = {
  /** Unique identifier/prefix for this collection (empty string for default) */
  prefix: string;
  /** Contract address of the NFT collection */
  address: string;
  /** Display name for the collection */
  name: string;
  /** Blockchain network */
  chain: string;
  /** Minimum token ID in the collection */
  minTokenId: number;
  /** Maximum token ID in the collection */
  maxTokenId: number;
  /** Custom description template ({id} replaced with token ID) */
  customDescription?: string;
  /** Embed color (hex string) */
  color?: string;
};

/** OpenSea NFT owner */
export type OpenSeaOwner = {
  address: string;
};

/** OpenSea NFT data */
export type NFT = {
  owners?: OpenSeaOwner[];
  opensea_url: string;
  image_url?: string;
};

/** OpenSea last sale event */
export type LastSale = {
  payment: {
    quantity: number;
    decimals: number;
    symbol: string;
  };
  closing_date: number;
};

/** OpenSea best offer */
export type BestOffer = {
  criteria?: {
    collection?: unknown;
  };
  price: {
    value: number;
    decimals: number;
    currency: string;
  };
};

/** OpenSea best listing */
export type BestListing = {
  price: {
    current: {
      value: number;
      decimals: number;
      currency: string;
    };
  };
};

/** OpenSea account data */
export type OpenSeaAccount = {
  username?: string;
};

/** Matched token request from a message */
export type TokenMatch = {
  /** The collection this match belongs to */
  collection: CollectionConfig;
  /** The token ID to fetch (already resolved if random) */
  tokenId: number;
};

/** Discord message context */
export type MessageContext = {
  content: string;
  authorUsername: string;
  channelDisplay: string;
};

/** Result of building embeds */
export type EmbedResult = {
  embeds: EmbedBuilder[];
  embedLog: string;
};

/** Incoming Discord message shape for processing */
export type IncomingMessage = {
  content: string;
  author: { username: string; bot: boolean };
  channel?: { name?: string } | null;
  channelId?: string | null;
  reply: (arg: { embeds: EmbedBuilder[] }) => Promise<unknown>;
};
