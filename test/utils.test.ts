import fetchMock from 'jest-fetch-mock';
import { formatAmount, imageForNFT, type Log, openseaGet } from '../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nftFixture = require('./fixtures/opensea-nft.json');

const USDC_DECIMALS = 6;
const BIG_USDC = 123_456_789;
const ONE_USDC = 1_000_000;
const FETCH_ERROR_REGEX = /Fetch Error/;

describe('utils', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('formatAmount trims decimals and adds symbol', () => {
    expect(formatAmount(BIG_USDC, USDC_DECIMALS, 'USDC')).toBe(
      '123.45678 USDC'
    );
    expect(formatAmount(ONE_USDC, USDC_DECIMALS, 'USDC')).toBe('1 USDC');
  });

  it('imageForNFT returns high-res image url', () => {
    const url = imageForNFT({ image_url: 'https://a.com/img?w=200' });
    expect(url).toBe('https://a.com/img?w=1000');
  });

  it('openseaGet returns parsed json', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(nftFixture));
    const log: Log = [];
    const res = await openseaGet('https://api.opensea.io/api/v2/some', log);
    expect(res).toEqual(nftFixture);
    expect(log.length).toBe(0);
  });

  it('openseaGet logs non-2xx responses', async () => {
    fetchMock.mockResponseOnce('Bad', { status: 500 });
    const log: Log = [];
    const res = await openseaGet('https://api.opensea.io/api/v2/some', log);
    expect(res).toBeUndefined();
    expect(log[0]).toMatch(FETCH_ERROR_REGEX);
  });
});
