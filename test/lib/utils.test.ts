import fetchMock from "jest-fetch-mock";
import { openseaGet } from "../../src/api/opensea";
import type { Log } from "../../src/lib/types";
import {
  formatAmount,
  formatShortDate,
  getHighResImage,
  pluralize,
} from "../../src/lib/utils";

// GlyphBots fixtures
const nftFixture = require("../fixtures/opensea/get-nft.json");

const USDC_DECIMALS = 6;
const BIG_USDC = 123_456_789;
const ONE_USDC = 1_000_000;
const FETCH_ERROR_REGEX = /Fetch Error/;
const HTTP_404_REGEX = /404/;
const NETWORK_ERROR_REGEX = /Network error/;

describe("utils", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  describe("formatAmount", () => {
    it("trims decimals and adds symbol", () => {
      expect(formatAmount(BIG_USDC, USDC_DECIMALS, "USDC")).toBe(
        "123.45678 USDC"
      );
      expect(formatAmount(ONE_USDC, USDC_DECIMALS, "USDC")).toBe("1 USDC");
    });

    it("handles small amounts", () => {
      // Trim to 5 decimal places as per DECIMAL_TRIM_LENGTH
      expect(formatAmount(123, USDC_DECIMALS, "USDC")).toBe("0.00012 USDC");
    });

    it("handles zero", () => {
      expect(formatAmount(0, USDC_DECIMALS, "USDC")).toBe("0 USDC");
    });

    it("trims trailing zeros after decimal", () => {
      expect(formatAmount(1_500_000, USDC_DECIMALS, "USDC")).toBe("1.5 USDC");
    });
  });

  describe("formatShortDate", () => {
    it("formats date with month and year", () => {
      // Use a date in summer to avoid timezone issues with month boundaries
      const date = new Date(2024, 5, 15); // June 15, 2024 (month is 0-indexed)
      const result = formatShortDate(date);

      expect(result).toContain("Jun");
      expect(result).toContain("'24");
    });

    it("handles different months", () => {
      expect(formatShortDate(new Date(2024, 0, 15))).toContain("Jan");
      expect(formatShortDate(new Date(2024, 11, 15))).toContain("Dec");
    });

    it("formats with proper year abbreviation", () => {
      expect(formatShortDate(new Date(2020, 5, 15))).toContain("'20");
      expect(formatShortDate(new Date(2025, 2, 20))).toContain("'25");
    });
  });

  describe("getHighResImage", () => {
    it("returns high-res image url", () => {
      const url = getHighResImage("https://a.com/img?w=200");
      expect(url).toBe("https://a.com/img?w=1000");
    });

    it("handles URL without width parameter", () => {
      const url = getHighResImage("https://a.com/image.png");
      expect(url).toBe("https://a.com/image.png");
    });

    it("replaces only w= parameter", () => {
      const url = getHighResImage("https://a.com/img?w=300&h=200");
      expect(url).toBe("https://a.com/img?w=1000&h=200");
    });

    it("handles IPFS and other URLs", () => {
      const url = getHighResImage("ipfs://QmXyz/image.png");
      expect(url).toBe("ipfs://QmXyz/image.png");
    });

    it("handles undefined input", () => {
      const url = getHighResImage(undefined);
      expect(url).toBeUndefined();
    });
  });

  describe("pluralize", () => {
    it("returns singular for count of 1", () => {
      expect(pluralize(1, "item", "items")).toBe("item");
      expect(pluralize(1, "token", "tokens")).toBe("token");
    });

    it("returns plural for count of 0", () => {
      expect(pluralize(0, "item", "items")).toBe("items");
    });

    it("returns plural for count greater than 1", () => {
      expect(pluralize(2, "item", "items")).toBe("items");
      expect(pluralize(100, "token", "tokens")).toBe("tokens");
    });

    it("returns plural for negative counts", () => {
      expect(pluralize(-1, "item", "items")).toBe("items");
    });

    it("auto-generates plural by adding s", () => {
      expect(pluralize(2, "token")).toBe("tokens");
      expect(pluralize(0, "item")).toBe("items");
    });
  });

  describe("openseaGet", () => {
    it("returns parsed json", async () => {
      fetchMock.mockResponseOnce(JSON.stringify(nftFixture));
      const log: Log = [];
      const res = await openseaGet("https://api.opensea.io/api/v2/some", log);
      expect(res).toEqual(nftFixture);
      expect(log.length).toBe(0);
    });

    it("logs non-2xx responses", async () => {
      fetchMock.mockResponseOnce("Bad", { status: 500 });
      const log: Log = [];
      const res = await openseaGet("https://api.opensea.io/api/v2/some", log);
      expect(res).toBeUndefined();
      expect(log.at(0)).toMatch(FETCH_ERROR_REGEX);
    });

    it("handles 404 responses", async () => {
      fetchMock.mockResponseOnce("Not Found", { status: 404 });
      const log: Log = [];
      const res = await openseaGet("https://api.opensea.io/api/v2/some", log);
      expect(res).toBeUndefined();
      expect(log.at(0)).toMatch(HTTP_404_REGEX);
    });

    it("handles network errors", async () => {
      fetchMock.mockRejectOnce(new Error("Network error"));
      const log: Log = [];
      const res = await openseaGet("https://api.opensea.io/api/v2/some", log);
      expect(res).toBeUndefined();
      expect(log.at(0)).toMatch(NETWORK_ERROR_REGEX);
    });
  });
});
