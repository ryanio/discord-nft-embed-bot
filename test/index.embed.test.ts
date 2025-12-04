import { EmbedBuilder } from "discord.js";
import fetchMock from "jest-fetch-mock";
import { GET_OPTS, urls } from "../src/opensea";
import type { CollectionConfig, Log } from "../src/types";

// GlyphBots fixtures from real OpenSea API responses
const nftFixture = require("./fixtures/opensea/get-nft.json");
const eventsFixture = require("./fixtures/opensea/get-events-sale.json");

// GlyphBots collection config (matching real contract)
const glyphbotsCollection: CollectionConfig = {
  prefix: "",
  address: "0xb6c2c2d2999c1b532e089a7ad4cb7f8c91cf5075",
  name: "GlyphBots",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 10_735,
};

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
});
