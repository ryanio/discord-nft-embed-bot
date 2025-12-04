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
  /** Maximum token ID in the collection (mutable when dynamicSupply is true) */
  maxTokenId: number;
  /** Whether maxTokenId should be fetched from OpenSea (set when * is used) */
  dynamicSupply?: boolean;
  /** Custom description template ({id} replaced with token ID) */
  customDescription?: string;
  /** Embed color (hex string) */
  color?: string;
  /** Custom image URL template ({id} replaced with token ID) - useful when Discord can't display SVGs */
  customImageUrl?: string;
};

/** OpenSea NFT owner */
export type OpenSeaOwner = {
  address: string;
  /** Quantity owned (for ERC1155 tokens) */
  quantity?: number;
};

/** OpenSea NFT data */
export type NFT = {
  name?: string;
  owners?: OpenSeaOwner[];
  opensea_url: string;
  image_url?: string;
  /** Token standard (erc721, erc1155) */
  token_standard?: string;
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

/** Result of building embeds */
export type EmbedResult = {
  embeds: EmbedBuilder[];
  embedLog: string;
};

/** OpenSea NFT item from account NFTs endpoint */
export type AccountNFT = {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name?: string;
  description?: string;
  image_url?: string;
  opensea_url: string;
};

/** Response from OpenSea account NFTs endpoint */
export type AccountNFTsResponse = {
  nfts: AccountNFT[];
  next?: string;
};

/** Match for a username random request (e.g., #username or artifacts#username) */
export type UsernameMatch = {
  /** The collection to filter by (or undefined for all collections) */
  collection?: CollectionConfig;
  /** The OpenSea username to fetch NFTs from */
  username: string;
};

/** OpenSea collection data (from /collections/{slug} endpoint) */
export type OpenSeaCollection = {
  collection: string;
  name: string;
  total_supply: number;
  /** Number of unique token IDs (preferred over total_supply for ERC-1155) */
  unique_item_count?: number | null;
  rarity?: {
    total_supply: number;
  };
};
