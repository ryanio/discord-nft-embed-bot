import { EmbedBuilder } from "discord.js";
import fetchMock from "jest-fetch-mock";
import { GET_OPTS, urls } from "../../src/api/opensea";
import type { CollectionConfig, Log } from "../../src/lib/types";

// GlyphBots fixtures from real OpenSea API responses
const nftFixture = require("../fixtures/opensea/get-nft.json");
const eventsFixture = require("../fixtures/opensea/get-events-sale.json");

// GlyphBots collection config (matching real contract)
const glyphbotsCollection: CollectionConfig = {
  prefix: "",
  address: "0xb6c2c2d2999c1b532e089a7ad4cb7f8c91cf5075",
  name: "GlyphBots",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 10_735,
};

/** Regex to match "Name #123 - " pattern for extracting NFT subtitle */
const NFT_NAME_PATTERN = /^.+\s#\d+\s*-\s*/;

/**
 * Extract the subtitle portion from an NFT name
 * e.g., "GlyphBot #1 - Vector" → "Vector"
 */
const extractNftSubtitle = (name: string): string =>
  NFT_NAME_PATTERN.test(name) ? name.replace(NFT_NAME_PATTERN, "") : name;

describe("embed composition", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it("fetches GlyphBots NFT and builds an embed with expected fields", async () => {
    const tokenId = 1;
    const nftUrl = urls.nft(glyphbotsCollection, tokenId);
    const eventsUrl = `${urls.events(glyphbotsCollection, tokenId)}?event_type=sale&limit=1`;

    fetchMock.mockResponseOnce(JSON.stringify(nftFixture));
    fetchMock.mockResponseOnce(JSON.stringify(eventsFixture));

    const log: Log = [];

    const res1 = await fetch(nftUrl, GET_OPTS);
    const res2 = await fetch(eventsUrl, GET_OPTS);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);

    expect(fetchMock.mock.calls.at(0)?.at(0)).toBe(nftUrl);
    expect(fetchMock.mock.calls.at(1)?.at(0)).toBe(eventsUrl);

    // Parse and verify GlyphBots NFT data
    const nft = (await res1.json()) as typeof nftFixture;
    expect(nft.nft.name).toBe("GlyphBot #1 - Vector the Kind");
    expect(nft.nft.collection).toBe("glyphbots");

    // Build embed with GlyphBots data
    const embed = new EmbedBuilder()
      .setTitle(`GlyphBot #${tokenId}`)
      .setURL(nft.nft.opensea_url)
      .setImage(nft.nft.display_image_url)
      .setColor(0x00_ff_88); // GlyphBots green

    expect(embed.data.title).toBe("GlyphBot #1");
    expect(embed.data.url).toBe(nft.nft.opensea_url);
    expect(embed.data.image?.url).toBe(nft.nft.display_image_url);
    expect(log).toEqual([]);
  });

  it("handles sale events from GlyphBots", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(eventsFixture));

    const res = await fetch(
      `${urls.events(glyphbotsCollection, 1533)}?event_type=sale&limit=1`,
      GET_OPTS
    );
    const events = (await res.json()) as typeof eventsFixture;

    expect(events.asset_events).toHaveLength(1);
    const sale = events.asset_events.at(0);
    expect(sale?.event_type).toBe("sale");
    expect(sale?.payment.symbol).toBe("ETH");
    expect(sale?.nft.name).toBe("GlyphBot #1533 - Fizzyprime");
  });

  it("replaces all {id} placeholders in customDescription", () => {
    const collection: CollectionConfig = {
      ...glyphbotsCollection,
      customDescription:
        "[View Bot](http://glyphbots.com/bot/{id}) · [Generate](http://glyphbots.com/bot/{id}/generate)",
    };

    const tokenId = 123;
    const customDesc = (collection.customDescription ?? "").replace(
      /{id}/g,
      tokenId.toString()
    );

    expect(customDesc).toBe(
      "[View Bot](http://glyphbots.com/bot/123) · [Generate](http://glyphbots.com/bot/123/generate)"
    );
    expect(customDesc).not.toContain("{id}");
    expect(customDesc).toContain("/123");
    expect(customDesc).toContain("/123/generate");
  });
});

describe("NFT name pattern extraction", () => {
  describe("extractNftSubtitle", () => {
    it("extracts subtitle from 'Name #123 - Subtitle' pattern", () => {
      expect(extractNftSubtitle("GlyphBot #1 - Vector the Kind")).toBe(
        "Vector the Kind"
      );
      expect(extractNftSubtitle("CryptoPunk #1234 - Alien")).toBe("Alien");
      expect(extractNftSubtitle("Cool Collection #99999 - Description")).toBe(
        "Description"
      );
    });

    it("handles multiple dashes in subtitle", () => {
      expect(extractNftSubtitle("GlyphBot #1 - Vector - the - Kind")).toBe(
        "Vector - the - Kind"
      );
      expect(extractNftSubtitle("NFT #42 - Sub-title-here")).toBe(
        "Sub-title-here"
      );
    });

    it("handles varying whitespace around dash", () => {
      expect(extractNftSubtitle("GlyphBot #1- NoSpaceBefore")).toBe(
        "NoSpaceBefore"
      );
      expect(extractNftSubtitle("GlyphBot #1 -NoSpaceAfter")).toBe(
        "NoSpaceAfter"
      );
      expect(extractNftSubtitle("GlyphBot #1-NoSpaces")).toBe("NoSpaces");
      expect(extractNftSubtitle("GlyphBot #1  -  ExtraSpaces")).toBe(
        "ExtraSpaces"
      );
    });

    it("returns full name when pattern does not match", () => {
      expect(extractNftSubtitle("My Cool NFT")).toBe("My Cool NFT");
      expect(extractNftSubtitle("Just a name")).toBe("Just a name");
      expect(extractNftSubtitle("NFT - Something")).toBe("NFT - Something");
      expect(extractNftSubtitle("GlyphBot #123")).toBe("GlyphBot #123");
      expect(extractNftSubtitle("Token #1 is cool")).toBe("Token #1 is cool");
    });

    it("handles edge cases with numbers and hashes", () => {
      expect(extractNftSubtitle("NFT #abc - Title")).toBe("NFT #abc - Title");
      expect(extractNftSubtitle("NFT #1 - Title #2")).toBe("Title #2");
      expect(extractNftSubtitle("GlyphBot #1 - ")).toBe("");
    });

    it("handles real-world NFT names from fixtures", () => {
      expect(extractNftSubtitle("GlyphBot #1 - Vector the Kind")).toBe(
        "Vector the Kind"
      );
      expect(extractNftSubtitle("GlyphBot #1533 - Fizzyprime")).toBe(
        "Fizzyprime"
      );
    });

    it("handles names with special characters", () => {
      expect(extractNftSubtitle("Bot #1 - 🤖 Robot")).toBe("🤖 Robot");
      expect(extractNftSubtitle("NFT #42 - (Special) [Edition]")).toBe(
        "(Special) [Edition]"
      );
      expect(extractNftSubtitle("Collection #999 - Item's Name")).toBe(
        "Item's Name"
      );
    });

    it("handles very long token IDs", () => {
      expect(extractNftSubtitle("Token #123456789012345 - Long ID Title")).toBe(
        "Long ID Title"
      );
    });

    it("handles single digit token IDs", () => {
      expect(extractNftSubtitle("NFT #0 - Zero")).toBe("Zero");
      expect(extractNftSubtitle("Bot #1 - One")).toBe("One");
      expect(extractNftSubtitle("Token #9 - Nine")).toBe("Nine");
    });
  });

  describe("NFT_NAME_PATTERN regex", () => {
    it("matches standard NFT name patterns", () => {
      expect(NFT_NAME_PATTERN.test("GlyphBot #1 - Vector")).toBe(true);
      expect(NFT_NAME_PATTERN.test("CryptoPunk #1234 - Alien")).toBe(true);
      expect(NFT_NAME_PATTERN.test("BAYC #9999 - Bored Ape")).toBe(true);
    });

    it("does not match names without the pattern", () => {
      expect(NFT_NAME_PATTERN.test("My Cool NFT")).toBe(false);
      expect(NFT_NAME_PATTERN.test("NFT - Something")).toBe(false);
      expect(NFT_NAME_PATTERN.test("GlyphBot #123")).toBe(false);
      expect(NFT_NAME_PATTERN.test("#123 - Title")).toBe(false);
    });

    it("requires whitespace before hash", () => {
      expect(NFT_NAME_PATTERN.test("GlyphBot#1 - Vector")).toBe(false);
      expect(NFT_NAME_PATTERN.test("GlyphBot #1 - Vector")).toBe(true);
    });
  });
});
