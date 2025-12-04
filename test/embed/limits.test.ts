import { MAX_EMBEDS_PER_MESSAGE } from "../../src/config/constants";

describe("embed limits", () => {
  it("MAX_EMBEDS_PER_MESSAGE is set to 6", () => {
    expect(MAX_EMBEDS_PER_MESSAGE).toBe(6);
  });

  it("respects embed limit when slicing matches", () => {
    const matches = [1, 2, 3, 4, 5, 6, 7, 8];
    const limited = matches.slice(0, MAX_EMBEDS_PER_MESSAGE);

    expect(limited).toHaveLength(6);
    expect(limited).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("handles fewer matches than limit", () => {
    const matches = [1, 2, 3];
    const limited = matches.slice(0, MAX_EMBEDS_PER_MESSAGE);

    expect(limited).toHaveLength(3);
    expect(limited).toEqual([1, 2, 3]);
  });

  it("handles exactly 6 matches (at limit)", () => {
    const matches = [1, 2, 3, 4, 5, 6];
    const limited = matches.slice(0, MAX_EMBEDS_PER_MESSAGE);

    expect(limited).toHaveLength(6);
    expect(limited).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("multiple random embeds", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.COLLECTIONS =
      "0xabc:MainNFT:1:100,artifacts:0xdef:ArtifactsNFT:1:50";
    const { initCollections: init } = jest.requireActual(
      "../../src/config/collection"
    );
    init();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("parses multiple #? randoms with mixed prefixes", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? artifacts#?");

    expect(matches.length).toBe(2);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtifactsNFT");
  });

  it("parses message like '#? artifacts#?' with space", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? artifacts#?");

    expect(matches.length).toBe(2);
    expect(matches.at(0).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(0).tokenId).toBeLessThanOrEqual(100);
    expect(matches.at(1).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(1).tokenId).toBeLessThanOrEqual(50);
  });

  it("parses six random requests from different collections", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #? artifacts#? artifacts#? #? artifacts#?");

    expect(matches.length).toBe(6);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("MainNFT");
    expect(matches.at(2).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(3).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(4).collection.name).toBe("MainNFT");
    expect(matches.at(5).collection.name).toBe("ArtifactsNFT");
  });

  it("parses more than 6 randoms (parser finds all, limit enforced later)", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #? #? artifacts#? artifacts#? #? #? #?");

    expect(matches.length).toBe(8);

    const limited = matches.slice(0, MAX_EMBEDS_PER_MESSAGE);
    expect(limited.length).toBe(6);
  });

  it("parses alternating default and prefixed #? randoms", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? artifacts#? #? artifacts#? #? artifacts#?");

    expect(matches.length).toBe(6);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(3).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(4).collection.name).toBe("MainNFT");
    expect(matches.at(5).collection.name).toBe("ArtifactsNFT");
  });

  it("parses mixed #random, #rand, #? with prefixes", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#random artifacts#rand #? artifacts#random");

    expect(matches.length).toBe(4);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(3).collection.name).toBe("ArtifactsNFT");
  });

  it("parses mixed token IDs and randoms across collections", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse(
      "#42 artifacts#? #random artifacts#25 #? artifacts#rand"
    );

    expect(matches.length).toBe(6);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(0).tokenId).toBe(42);
    expect(matches.at(1).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(3).collection.name).toBe("ArtifactsNFT");
    expect(matches.at(3).tokenId).toBe(25);
    expect(matches.at(4).collection.name).toBe("MainNFT");
    expect(matches.at(5).collection.name).toBe("ArtifactsNFT");
  });

  it("parses all defaults only", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #random #rand #? #? #rand");

    expect(matches.length).toBe(6);
    for (const match of matches) {
      expect(match.collection.name).toBe("MainNFT");
      expect(match.tokenId).toBeGreaterThanOrEqual(1);
      expect(match.tokenId).toBeLessThanOrEqual(100);
    }
  });

  it("parses all prefixed only", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse(
      "artifacts#? artifacts#random artifacts#rand artifacts#? artifacts#? artifacts#rand"
    );

    expect(matches.length).toBe(6);
    for (const match of matches) {
      expect(match.collection.name).toBe("ArtifactsNFT");
      expect(match.tokenId).toBeGreaterThanOrEqual(1);
      expect(match.tokenId).toBeLessThanOrEqual(50);
    }
  });
});
