import { isValidTokenId, randomTokenId } from "../src/collection";
import type { CollectionConfig } from "../src/types";

const NO_COLLECTIONS_ERROR_REGEX = /No collections configured/;

const testCollection: CollectionConfig = {
  prefix: "",
  address: "0x1234567890abcdef1234567890abcdef12345678",
  name: "Test Collection",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 100,
};

describe("collection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isValidTokenId", () => {
    it("returns true for valid token IDs", () => {
      expect(isValidTokenId(testCollection, 1)).toBe(true);
      expect(isValidTokenId(testCollection, 50)).toBe(true);
      expect(isValidTokenId(testCollection, 100)).toBe(true);
    });

    it("returns false for invalid token IDs", () => {
      expect(isValidTokenId(testCollection, 0)).toBe(false);
      expect(isValidTokenId(testCollection, 101)).toBe(false);
      expect(isValidTokenId(testCollection, -1)).toBe(false);
      expect(isValidTokenId(testCollection, Number.NaN)).toBe(false);
    });

    it("handles zero-based collections", () => {
      const zeroBasedCollection = { ...testCollection, minTokenId: 0 };
      expect(isValidTokenId(zeroBasedCollection, 0)).toBe(true);
    });
  });

  describe("randomTokenId", () => {
    it("generates IDs within collection range", () => {
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        const id = randomTokenId(testCollection);
        expect(id).toBeGreaterThanOrEqual(testCollection.minTokenId);
        expect(id).toBeLessThanOrEqual(testCollection.maxTokenId);
      }
    });

    it("works with single token range", () => {
      const singleCollection = {
        ...testCollection,
        minTokenId: 42,
        maxTokenId: 42,
      };
      expect(randomTokenId(singleCollection)).toBe(42);
    });
  });

  describe("initCollections with COLLECTIONS env", () => {
    it("parses single collection (default)", () => {
      process.env.COLLECTIONS = "0xabc:TestNFT:1:1000";
      const { initCollections: init, getDefaultCollection: getDefault } =
        jest.requireActual("../src/collection");

      init();
      const defaultCol = getDefault();

      expect(defaultCol).toBeDefined();
      expect(defaultCol.name).toBe("TestNFT");
      expect(defaultCol.prefix).toBe("");
      expect(defaultCol.minTokenId).toBe(1);
      expect(defaultCol.maxTokenId).toBe(1000);
    });

    it("parses single collection with chain and color", () => {
      process.env.COLLECTIONS = "0xabc:TestNFT:1:1000:polygon:#ff5500";
      const { initCollections: init, getDefaultCollection: getDefault } =
        jest.requireActual("../src/collection");

      init();
      const defaultCol = getDefault();

      expect(defaultCol.chain).toBe("polygon");
      expect(defaultCol.color).toBe("#ff5500");
    });

    it("parses multiple collections", () => {
      process.env.COLLECTIONS =
        "0xabc:MainNFT:1:1000,secondary:0xdef:SecondNFT:0:500";
      const {
        initCollections: init,
        getCollections: getAll,
        getCollectionByPrefix: getByPrefix,
      } = jest.requireActual("../src/collection");

      init();
      const all = getAll();

      expect(all.length).toBe(2);

      const main = getByPrefix("");
      expect(main.name).toBe("MainNFT");

      const secondary = getByPrefix("secondary");
      expect(secondary.name).toBe("SecondNFT");
      expect(secondary.minTokenId).toBe(0);
    });

    it("skips invalid entries with too few parts", () => {
      process.env.COLLECTIONS = "0xabc:TestNFT:1:1000,invalid:only:three";
      const { initCollections: init, getCollections: getAll } =
        jest.requireActual("../src/collection");

      init();
      const all = getAll();

      expect(all.length).toBe(1);
    });

    it("skips entries with missing address or name", () => {
      process.env.COLLECTIONS = "0xabc:TestNFT:1:1000,prefix::NoAddress:0:100";
      const { initCollections: init, getCollections: getAll } =
        jest.requireActual("../src/collection");

      init();
      const all = getAll();

      expect(all.length).toBe(1);
    });

    it("throws error when no collections configured", () => {
      process.env.COLLECTIONS = undefined;
      process.env.TOKEN_ADDRESS = undefined;
      process.env.TOKEN_NAME = undefined;

      const { initCollections: init } = jest.requireActual("../src/collection");

      expect(() => init()).toThrow(NO_COLLECTIONS_ERROR_REGEX);
    });

    it("parses first collection with explicit prefix (no default)", () => {
      process.env.COLLECTIONS = "main:0xabc:MainNFT:1:1000";
      const {
        initCollections: init,
        getDefaultCollection: getDefault,
        getCollectionByPrefix: getByPrefix,
      } = jest.requireActual("../src/collection");

      init();

      // No default collection since first entry has a prefix
      expect(getDefault()).toBeUndefined();

      // But the prefixed collection exists
      const main = getByPrefix("main");
      expect(main).toBeDefined();
      expect(main.name).toBe("MainNFT");
      expect(main.prefix).toBe("main");
    });

    it("parses multiple collections all with prefixes (no default)", () => {
      process.env.COLLECTIONS =
        "primary:0xabc:MainNFT:1:1000,secondary:0xdef:SecondNFT:0:500";
      const {
        initCollections: init,
        getDefaultCollection: getDefault,
        getCollections: getAll,
        getCollectionByPrefix: getByPrefix,
      } = jest.requireActual("../src/collection");

      init();
      const all = getAll();

      expect(all.length).toBe(2);
      expect(getDefault()).toBeUndefined();

      const primary = getByPrefix("primary");
      expect(primary.name).toBe("MainNFT");

      const secondary = getByPrefix("secondary");
      expect(secondary.name).toBe("SecondNFT");
    });
  });

  describe("initCollections with legacy env vars", () => {
    it("falls back to TOKEN_ADDRESS/TOKEN_NAME", () => {
      process.env.COLLECTIONS = undefined;
      process.env.TOKEN_ADDRESS = "0xlegacy";
      process.env.TOKEN_NAME = "LegacyNFT";
      process.env.MIN_TOKEN_ID = "1";
      process.env.MAX_TOKEN_ID = "5000";
      process.env.CHAIN = "polygon";
      process.env.EMBED_COLOR = "#abc123";
      process.env.CUSTOM_DESCRIPTION = "Custom desc for {id}";

      const { initCollections: init, getDefaultCollection: getDefault } =
        jest.requireActual("../src/collection");

      init();
      const defaultCol = getDefault();

      expect(defaultCol).toBeDefined();
      expect(defaultCol.name).toBe("LegacyNFT");
      expect(defaultCol.address).toBe("0xlegacy");
      expect(defaultCol.minTokenId).toBe(1);
      expect(defaultCol.maxTokenId).toBe(5000);
      expect(defaultCol.chain).toBe("polygon");
      expect(defaultCol.color).toBe("#abc123");
      expect(defaultCol.customDescription).toBe("Custom desc for {id}");
    });
  });

  describe("parseMessageMatches", () => {
    beforeEach(() => {
      // Set up a simple collection for matching tests
      process.env.COLLECTIONS = "0xabc:TestNFT:1:100";
      const { initCollections: init } = jest.requireActual("../src/collection");
      init();
    });

    it("returns empty array for non-matching content", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      expect(parse("hello world")).toEqual([]);
    });

    it("returns empty array for hashtags without numbers", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      expect(parse("#hello #world")).toEqual([]);
    });

    it("matches simple token IDs", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("Check out #42!");

      expect(matches.length).toBe(1);
      expect(matches.at(0).tokenId).toBe(42);
    });

    it("matches multiple token IDs", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("Compare #10 and #20");

      expect(matches.length).toBe(2);
      expect(matches.at(0).tokenId).toBe(10);
      expect(matches.at(1).tokenId).toBe(20);
    });

    it("ignores token IDs outside range", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("#999");

      expect(matches.length).toBe(0);
    });

    it("matches #random keyword", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("Show me #random");

      expect(matches.length).toBe(1);
      expect(matches.at(0).tokenId).toBeGreaterThanOrEqual(1);
      expect(matches.at(0).tokenId).toBeLessThanOrEqual(100);
    });

    it("matches #rand keyword", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("#rand please");

      expect(matches.length).toBe(1);
    });

    it("matches #? shorthand", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("Give me #?");

      expect(matches.length).toBe(1);
    });
  });

  describe("parseMessageMatches with prefixes", () => {
    beforeEach(() => {
      process.env.COLLECTIONS = "0xabc:MainNFT:1:100,art:0xdef:ArtNFT:1:50";
      const { initCollections: init } = jest.requireActual("../src/collection");
      init();
    });

    it("matches default collection without prefix", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("#42");

      expect(matches.length).toBe(1);
      expect(matches.at(0).collection.name).toBe("MainNFT");
    });

    it("matches prefixed collection", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("art#25");

      expect(matches.length).toBe(1);
      expect(matches.at(0).collection.name).toBe("ArtNFT");
      expect(matches.at(0).tokenId).toBe(25);
    });

    it("matches prefix case-insensitively", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("ART#25");

      expect(matches.length).toBe(1);
      expect(matches.at(0).collection.name).toBe("ArtNFT");
    });

    it("matches mixed default and prefixed in same message", () => {
      const { parseMessageMatches: parse } =
        jest.requireActual("../src/collection");
      const matches = parse("#10 and art#20");

      expect(matches.length).toBe(2);
      expect(matches.at(0).collection.name).toBe("MainNFT");
      expect(matches.at(1).collection.name).toBe("ArtNFT");
    });
  });

  describe("getHelpText", () => {
    it("returns formatted help text", () => {
      process.env.COLLECTIONS = "0xabc:MainNFT:1:100,art:0xdef:ArtNFT:1:50";
      const { initCollections: init, getHelpText: help } =
        jest.requireActual("../src/collection");

      init();
      const text = help();

      expect(text).toContain("**Available collections:**");
      expect(text).toContain("`#1234`");
      expect(text).toContain("MainNFT");
      expect(text).toContain("`art#1234`");
      expect(text).toContain("ArtNFT");
    });
  });

  describe("getCollectionByPrefix", () => {
    beforeEach(() => {
      process.env.COLLECTIONS = "0xabc:MainNFT:1:100,test:0xdef:TestNFT:1:50";
      const { initCollections: init } = jest.requireActual("../src/collection");
      init();
    });

    it("returns undefined for non-existent prefix", () => {
      const { getCollectionByPrefix: getByPrefix } =
        jest.requireActual("../src/collection");

      expect(getByPrefix("nonexistent")).toBeUndefined();
    });

    it("normalizes prefix to lowercase", () => {
      const { getCollectionByPrefix: getByPrefix } =
        jest.requireActual("../src/collection");

      expect(getByPrefix("TEST")).toBeDefined();
      expect(getByPrefix("Test")).toBeDefined();
    });
  });
});
