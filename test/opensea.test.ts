import fetchMock from "jest-fetch-mock";
import { urls } from "../src/api/opensea";
import type { CollectionConfig, Log } from "../src/lib/types";

// GlyphBots fixtures from real OpenSea API responses
const nftFixture = require("./fixtures/opensea/get-nft.json");
const accountFixture = require("./fixtures/opensea/get-account.json");
const contractFixture = require("./fixtures/opensea/get-contract.json");
const eventsFixture = require("./fixtures/opensea/get-events-sale.json");
const bestOfferFixture = require("./fixtures/opensea/get-best-offer-by-nft.json");
const bestListingFixture = require("./fixtures/opensea/get-best-listing-by-nft.json");

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

      const { fetchCollectionSlug: fetchSlug } = require("../src/api/opensea");
      const slug = await fetchSlug(glyphbotsCollection, log);

      expect(slug).toBe("glyphbots");
    });

    it("returns undefined on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const { fetchCollectionSlug: fetchSlug } = require("../src/api/opensea");
      const slug = await fetchSlug(testCollection, log);

      expect(slug).toBeUndefined();
    });

    it("caches slug results", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(contractFixture));

      const { fetchCollectionSlug: fetchSlug } = require("../src/api/opensea");

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

      const { fetchNFT: fetchNFTLocal } = require("../src/api/opensea");
      const nft = await fetchNFTLocal(glyphbotsCollection, 1, log);

      expect(nft).toBeDefined();
      expect(nft.name).toBe("GlyphBot #1 - Vector the Kind");
      expect(nft.collection).toBe("glyphbots");
      expect(nft.traits).toHaveLength(15);
    });

    it("throws on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 404 });

      const { fetchNFT: fetchNFTLocal } = require("../src/api/opensea");
      await expect(fetchNFTLocal(testCollection, 99_999, log)).rejects.toThrow(
        "Failed to fetch NFT"
      );
    });
  });

  describe("fetchLastSale", () => {
    it("returns last sale from events", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(eventsFixture));

      const { fetchLastSale: fetchSaleLocal } = require("../src/api/opensea");
      const sale = await fetchSaleLocal(glyphbotsCollection, 1533, log);

      expect(sale).toBeDefined();
      expect(sale.event_type).toBe("sale");
      expect(sale.payment.symbol).toBe("ETH");
      expect(sale.nft.name).toBe("GlyphBot #1533 - Fizzyprime");
    });

    it("returns undefined when no sales", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify({ asset_events: [] }));

      const { fetchLastSale: fetchSaleLocal } = require("../src/api/opensea");
      const sale = await fetchSaleLocal(testCollection, 1, log);

      expect(sale).toBeUndefined();
    });
  });

  describe("fetchBestOffer", () => {
    it("returns best offer data", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce(JSON.stringify(bestOfferFixture));

      const { fetchBestOffer: fetchOfferLocal } = require("../src/api/opensea");
      const offer = await fetchOfferLocal("glyphbots", 1, log);

      expect(offer).toBeDefined();
      expect(offer.price.currency).toBe("WETH");
      expect(offer.price.value).toBe("800000000000000");
    });

    it("returns undefined on error", async () => {
      const log: Log = [];
      fetchMock.mockResponseOnce("Error", { status: 500 });

      const { fetchBestOffer: fetchOfferLocal } = require("../src/api/opensea");
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
      } = require("../src/api/opensea");
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
      } = require("../src/api/opensea");
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

      const { getUsername: getUsernameLocal } = require("../src/api/opensea");
      const username = await getUsernameLocal(accountFixture.address, log);

      expect(username).toBe("ralx_z");
    });

    it("returns short address when no username", async () => {
      const log: Log = [];
      const accountData = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
      };
      fetchMock.mockResponseOnce(JSON.stringify(accountData));

      const { getUsername: getUsernameLocal } = require("../src/api/opensea");
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

      const { getUsername: getUsernameLocal } = require("../src/api/opensea");

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

      const { getUsername: getUsernameLocal } = require("../src/api/opensea");
      const username = await getUsernameLocal(
        "0x1234567890abcdef1234567890abcdef12345678",
        log
      );

      expect(username).toContain("0x12345");
    });
  });
});
