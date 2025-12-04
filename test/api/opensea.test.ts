import fetchMock from "jest-fetch-mock";
import { urls } from "../../src/api/opensea";
import type { CollectionConfig, Log } from "../../src/lib/types";

// GlyphBots fixtures from real OpenSea API responses
const nftFixture = require("../fixtures/opensea/get-nft.json");
const accountFixture = require("../fixtures/opensea/get-account.json");
const contractFixture = require("../fixtures/opensea/get-contract.json");
const eventsFixture = require("../fixtures/opensea/get-events-sale.json");
const bestOfferFixture = require("../fixtures/opensea/get-best-offer-by-nft.json");
const bestListingFixture = require("../fixtures/opensea/get-best-listing-by-nft.json");
const accountNFTsFixture = require("../fixtures/opensea/get-nfts-by-account.json");

// GlyphBots collection config (matching real contract)
const glyphbotsCollection: CollectionConfig = {
  prefix: "",
  address: "0xb6c2c2d2999c1b532e089a7ad4cb7f8c91cf5075",
  name: "GlyphBots",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 10_735,
};

// Generic test collection for URL tests
const testCollection: CollectionConfig = {
  prefix: "",
  address: "0x1234567890abcdef1234567890abcdef12345678",
  name: "Test Collection",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 10_000,
};

describe("opensea", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    // Clear module cache to reset internal caches (slugCache, usernameCache)
    jest.resetModules();
  });

  describe("urls", () => {
    it("builds account URL", () => {
      const url = urls.account("0xabc123");
      expect(url).toContain("accounts/0xabc123");
    });

    it("builds NFT URL", () => {
      const url = urls.nft(testCollection, 42);
      expect(url).toContain(testCollection.chain);
      expect(url).toContain(testCollection.address);
      expect(url).toContain("42");
    });

    it("builds contract URL", () => {
      const url = urls.contract(testCollection);
      expect(url).toContain(testCollection.chain);
      expect(url).toContain(testCollection.address);
    });

    it("builds best offer URL", () => {
      const url = urls.bestOffer("glyphbots", 42);
      expect(url).toContain("offers");
      expect(url).toContain("glyphbots");
      expect(url).toContain("42");
    });

    it("builds best listing URL", () => {
      const url = urls.bestListing("glyphbots", 42);
      expect(url).toContain("listings");
      expect(url).toContain("best");
    });

    it("builds events URL", () => {
      const url = urls.events(testCollection, 42);
      expect(url).toContain("events");
      expect(url).toContain(testCollection.chain);
    });
  });

  describe("fetchCollectionSlug", () => {
    it("returns slug from contract response", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(contractFixture));

      const {
        fetchCollectionSlug: fetchSlug,
      } = require("../../src/api/opensea");
      const slug = await fetchSlug(glyphbotsCollection, log);

      expect(slug).toBe("glyphbots");
    });

    it("returns undefined on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const {
        fetchCollectionSlug: fetchSlug,
      } = require("../../src/api/opensea");
      const slug = await fetchSlug(testCollection, log);

      expect(slug).toBeUndefined();
    });

    it("caches slug results", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(contractFixture));

      const {
        fetchCollectionSlug: fetchSlug,
      } = require("../../src/api/opensea");

      // First call - fetches from API
      const first = await fetchSlug(glyphbotsCollection, log);
      expect(first).toBe("glyphbots");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const second = await fetchSlug(glyphbotsCollection, log);
      expect(second).toBe("glyphbots");
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1, no new fetch
    });
  });

  describe("fetchNFT", () => {
    it("returns NFT data for GlyphBots", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(nftFixture));

      const { fetchNFT: fetchNFTLocal } = require("../../src/api/opensea");
      const nft = await fetchNFTLocal(glyphbotsCollection, 1, log);

      expect(nft).toBeDefined();
      expect(nft.name).toBe("GlyphBot #1 - Vector the Kind");
      expect(nft.collection).toBe("glyphbots");
      expect(nft.traits).toHaveLength(15);
    });

    it("throws NFTNotFoundError on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 404 });

      const { fetchNFT: fetchNFTLocal } = require("../../src/api/opensea");
      await expect(fetchNFTLocal(testCollection, 99_999, log)).rejects.toThrow(
        "NFT not found"
      );
    });

    it("includes contract address in error message", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 404 });

      const { fetchNFT: fetchNFTLocal } = require("../../src/api/opensea");

      try {
        await fetchNFTLocal(testCollection, 99_999, log);
        throw new Error("Expected NFTNotFoundError to be thrown");
      } catch (error) {
        const nftError = error as Error & {
          collection?: CollectionConfig;
          tokenId?: number;
        };
        expect(nftError.name).toBe("NFTNotFoundError");
        expect(nftError.message).toContain(testCollection.address);
        expect(nftError.message).toContain("99999");
        expect(nftError.collection).toEqual(testCollection);
        expect(nftError.tokenId).toBe(99_999);
      }
    });
  });

  describe("fetchLastSale", () => {
    it("returns last sale from events", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(eventsFixture));

      const {
        fetchLastSale: fetchSaleLocal,
      } = require("../../src/api/opensea");
      const sale = await fetchSaleLocal(glyphbotsCollection, 1533, log);

      expect(sale).toBeDefined();
      expect(sale.event_type).toBe("sale");
      expect(sale.payment.symbol).toBe("ETH");
      expect(sale.nft.name).toBe("GlyphBot #1533 - Fizzyprime");
    });

    it("returns undefined when no sales", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify({ asset_events: [] }));

      const {
        fetchLastSale: fetchSaleLocal,
      } = require("../../src/api/opensea");
      const sale = await fetchSaleLocal(testCollection, 1, log);

      expect(sale).toBeUndefined();
    });
  });

  describe("fetchBestOffer", () => {
    it("returns best offer data", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(bestOfferFixture));

      const {
        fetchBestOffer: fetchOfferLocal,
      } = require("../../src/api/opensea");
      const offer = await fetchOfferLocal("glyphbots", 1, log);

      expect(offer).toBeDefined();
      expect(offer.price.currency).toBe("WETH");
      expect(offer.price.value).toBe("800000000000000");
    });

    it("returns undefined on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const {
        fetchBestOffer: fetchOfferLocal,
      } = require("../../src/api/opensea");
      const offer = await fetchOfferLocal("test-slug", 1, log);

      expect(offer).toBeUndefined();
    });
  });

  describe("fetchBestListing", () => {
    it("returns best listing data", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(bestListingFixture));

      const {
        fetchBestListing: fetchListingLocal,
      } = require("../../src/api/opensea");
      const listing = await fetchListingLocal("glyphbots", 9940, log);

      expect(listing).toBeDefined();
      expect(listing.price.current.currency).toBe("ETH");
      expect(listing.price.current.value).toBe("520000000000000");
    });

    it("returns undefined on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const {
        fetchBestListing: fetchListingLocal,
      } = require("../../src/api/opensea");
      const listing = await fetchListingLocal("test-slug", 1, log);

      expect(listing).toBeUndefined();
    });
  });

  describe("getUsername", () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it("returns username when available", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(accountFixture));

      const {
        getUsername: getUsernameLocal,
      } = require("../../src/api/opensea");
      const username = await getUsernameLocal(accountFixture.address, log);

      expect(username).toBe("ralx_z");
    });

    it("returns short address when no username", async () => {
      const log: Log = [];
      const accountData = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
      };
      fetchMock.mockResponseOnce(JSON.stringify(accountData));

      const {
        getUsername: getUsernameLocal,
      } = require("../../src/api/opensea");
      const username = await getUsernameLocal(
        "0x1234567890abcdef1234567890abcdef12345678",
        log
      );

      expect(username).toContain("0x12345");
      expect(username).toContain("…");
    });

    it("caches username results", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(accountFixture));

      const {
        getUsername: getUsernameLocal,
      } = require("../../src/api/opensea");

      // First call - fetches from API
      const first = await getUsernameLocal(accountFixture.address, log);
      expect(first).toBe("ralx_z");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const second = await getUsernameLocal(accountFixture.address, log);
      expect(second).toBe("ralx_z");
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1, no new fetch
    });

    it("returns short address on fetch error", async () => {
      const log: Log = [];
      fetchMock.mockRejectOnce(new Error("Network error"));

      const {
        getUsername: getUsernameLocal,
      } = require("../../src/api/opensea");
      const username = await getUsernameLocal(
        "0x1234567890abcdef1234567890abcdef12345678",
        log
      );

      expect(username).toContain("0x12345");
    });
  });

  describe("urls.accountNFTs", () => {
    it("builds account NFTs URL without collection filter", () => {
      const url = urls.accountNFTs(
        "ethereum",
        "0x00a839de7922491683f547a67795204763ff8237"
      );
      expect(url).toContain("/chain/ethereum/account/");
      expect(url).toContain("0x00a839de7922491683f547a67795204763ff8237");
      expect(url).toContain("nfts");
      expect(url).toContain("limit=50");
      expect(url).not.toContain("collection=");
    });

    it("builds account NFTs URL with collection filter", () => {
      const url = urls.accountNFTs(
        "ethereum",
        "0x00a839de7922491683f547a67795204763ff8237",
        "glyphbots"
      );
      expect(url).toContain("collection=glyphbots");
    });
  });

  describe("fetchAccountAddress", () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it("returns address for valid username", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(accountFixture));

      const { fetchAccountAddress } = require("../../src/api/opensea");
      const address = await fetchAccountAddress("ralx_z", log);

      expect(address).toBe("0x00a839de7922491683f547a67795204763ff8237");
    });

    it("returns undefined for invalid username", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Not found", { status: 404 });

      const { fetchAccountAddress } = require("../../src/api/opensea");
      const address = await fetchAccountAddress("nonexistent_user_12345", log);

      expect(address).toBeUndefined();
    });
  });

  describe("fetchAccountNFTs", () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it("returns NFTs for valid address", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(accountNFTsFixture));

      const { fetchAccountNFTs } = require("../../src/api/opensea");
      const nfts = await fetchAccountNFTs(
        "0x00a839de7922491683f547a67795204763ff8237",
        "ethereum",
        log,
        "glyphbots"
      );

      expect(nfts.length).toBe(10);
      expect(nfts.at(0).collection).toBe("glyphbots");
      expect(nfts.at(0).identifier).toBe("1751");
    });

    it("returns empty array on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const { fetchAccountNFTs } = require("../../src/api/opensea");
      const nfts = await fetchAccountNFTs(
        "0x1234567890abcdef1234567890abcdef12345678",
        "ethereum",
        log
      );

      expect(nfts).toEqual([]);
    });
  });

  describe("fetchRandomUserNFT", () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it("returns a random NFT for valid username", async () => {
      const log: Log = [];
      // First call resolves username to address
      fetchMock.mockResponseOnce(JSON.stringify(accountFixture));
      // Second call fetches NFTs
      fetchMock.mockResponseOnce(JSON.stringify(accountNFTsFixture));

      const { fetchRandomUserNFT } = require("../../src/api/opensea");
      const result = await fetchRandomUserNFT(
        "ralx_z",
        "ethereum",
        log,
        "glyphbots"
      );

      expect(result).toBeDefined();
      expect(result.nft).toBeDefined();
      expect(result.tokenId).toBeGreaterThan(0);
      expect(result.nft.collection).toBe("glyphbots");
    });

    it("returns undefined when user not found", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Not found", { status: 404 });

      const { fetchRandomUserNFT } = require("../../src/api/opensea");
      const result = await fetchRandomUserNFT(
        "nonexistent_user_12345",
        "ethereum",
        log
      );

      expect(result).toBeUndefined();
    });

    it("returns undefined when user has no NFTs", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(accountFixture));
      fetchMock.mockResponseOnce(JSON.stringify({ nfts: [], next: null }));

      const { fetchRandomUserNFT } = require("../../src/api/opensea");
      const result = await fetchRandomUserNFT(
        "ralx_z",
        "ethereum",
        log,
        "glyphbots"
      );

      expect(result).toBeUndefined();
    });
  });
});
