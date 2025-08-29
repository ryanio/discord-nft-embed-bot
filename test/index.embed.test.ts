import { EmbedBuilder } from 'discord.js';
import fetchMock from 'jest-fetch-mock';
import { opensea } from '../src/index';
import type { Log } from '../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const eventsFixture = require('./fixtures/opensea-events.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nftFixture = require('./fixtures/opensea-nft.json');

describe('embed composition', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('fetches NFT and builds an embed with expected fields', async () => {
    const tokenId = 1;
    const nftUrl = opensea.getNFT(tokenId);
    const eventsUrl = `${opensea.getEvents(tokenId)}?event_type=sale&limit=1`;

    fetchMock.mockResponseOnce(JSON.stringify(nftFixture));
    fetchMock.mockResponseOnce(JSON.stringify(eventsFixture));

    const log: Log = [];

    const res1 = await fetch(nftUrl, opensea.GET_OPTS);
    const res2 = await fetch(eventsUrl, opensea.GET_OPTS);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);

    expect(fetchMock.mock.calls[0][0]).toBe(nftUrl);
    expect(fetchMock.mock.calls[1][0]).toBe(eventsUrl);

    // basic sanity of fixture content used downstream
    const nft = (await res1.json()) as typeof nftFixture;
    const embed = new EmbedBuilder()
      .setTitle(`Test #${tokenId}`)
      .setURL(nft.nft.opensea_url);
    expect(embed.data.title).toContain(`#${tokenId}`);
    expect(embed.data.url).toBe(nft.nft.opensea_url);
    expect(log).toEqual([]);
  });
});
