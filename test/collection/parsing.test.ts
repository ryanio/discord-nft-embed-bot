describe("parseMessageMatches", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.COLLECTIONS = "0xabc:TestNFT:1:100";
    const { initCollections: init } = jest.requireActual(
      "../../src/config/collection"
    );
    init();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns empty array for non-matching content", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    expect(parse("hello world")).toEqual([]);
  });

  it("returns empty array for hashtags without numbers", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    expect(parse("#hello #world")).toEqual([]);
  });

  it("matches simple token IDs", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Check out #42!");

    expect(matches.length).toBe(1);
    expect(matches.at(0).tokenId).toBe(42);
  });

  it("matches multiple token IDs", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Compare #10 and #20");

    expect(matches.length).toBe(2);
    expect(matches.at(0).tokenId).toBe(10);
    expect(matches.at(1).tokenId).toBe(20);
  });

  it("ignores token IDs outside range", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#999");

    expect(matches.length).toBe(0);
  });

  it("matches #random keyword", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Show me #random");

    expect(matches.length).toBe(1);
    expect(matches.at(0).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(0).tokenId).toBeLessThanOrEqual(100);
  });

  it("matches #rand keyword", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#rand please");

    expect(matches.length).toBe(1);
  });

  it("matches #? shorthand", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Give me #?");

    expect(matches.length).toBe(1);
  });

  it("matches multiple #? in same message", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? and #?");

    expect(matches.length).toBe(2);
    expect(matches.at(0).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(0).tokenId).toBeLessThanOrEqual(100);
    expect(matches.at(1).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(1).tokenId).toBeLessThanOrEqual(100);
  });

  it("matches three #? randoms in same message", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #? #?");

    expect(matches.length).toBe(3);
    for (const match of matches) {
      expect(match.tokenId).toBeGreaterThanOrEqual(1);
      expect(match.tokenId).toBeLessThanOrEqual(100);
    }
  });

  it("matches five #? randoms (embed limit)", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #? #? #? #?");

    expect(matches.length).toBe(5);
  });

  it("parses more than five #? randoms (beyond embed limit)", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #? #? #? #? #? #?");

    expect(matches.length).toBe(7);
  });

  it("each #? generates independent random token IDs", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );

    const iterations = 10;
    let hadDifferentIds = false;

    for (let i = 0; i < iterations; i++) {
      const matches = parse("#? #?");
      if (matches.at(0).tokenId !== matches.at(1).tokenId) {
        hadDifferentIds = true;
        break;
      }
    }

    expect(hadDifferentIds).toBe(true);
  });
});

describe("parseMessageMatches with prefixes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.COLLECTIONS = "0xabc:MainNFT:1:100,art:0xdef:ArtNFT:1:50";
    const { initCollections: init } = jest.requireActual(
      "../../src/config/collection"
    );
    init();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("matches default collection without prefix", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#42");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("MainNFT");
  });

  it("matches prefixed collection", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("art#25");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("ArtNFT");
    expect(matches.at(0).tokenId).toBe(25);
  });

  it("matches prefix case-insensitively", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("ART#25");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("ArtNFT");
  });

  it("matches mixed default and prefixed in same message", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#10 and art#20");

    expect(matches.length).toBe(2);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtNFT");
  });

  it("matches multiple #? with different prefixes", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? art#?");

    expect(matches.length).toBe(2);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtNFT");
  });

  it("matches alternating default and prefixed randoms", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? art#? #? art#?");

    expect(matches.length).toBe(4);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtNFT");
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(3).collection.name).toBe("ArtNFT");
  });

  it("matches mixed #random, #rand, and #? keywords with prefixes", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#random art#rand #? art#?");

    expect(matches.length).toBe(4);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(1).collection.name).toBe("ArtNFT");
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(3).collection.name).toBe("ArtNFT");
  });

  it("matches prefixed #random keyword", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("art#random");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("ArtNFT");
    expect(matches.at(0).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(0).tokenId).toBeLessThanOrEqual(50);
  });

  it("matches prefixed #rand keyword", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("art#rand");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("ArtNFT");
  });

  it("matches all default collection randoms", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#? #random #rand #?");

    expect(matches.length).toBe(4);
    for (const match of matches) {
      expect(match.collection.name).toBe("MainNFT");
      expect(match.tokenId).toBeGreaterThanOrEqual(1);
      expect(match.tokenId).toBeLessThanOrEqual(100);
    }
  });

  it("matches all prefixed collection randoms", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("art#? art#random art#rand art#?");

    expect(matches.length).toBe(4);
    for (const match of matches) {
      expect(match.collection.name).toBe("ArtNFT");
      expect(match.tokenId).toBeGreaterThanOrEqual(1);
      expect(match.tokenId).toBeLessThanOrEqual(50);
    }
  });

  it("matches mixed token IDs and randoms across collections", () => {
    const { parseMessageMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#42 art#? #random art#25");

    expect(matches.length).toBe(4);
    expect(matches.at(0).collection.name).toBe("MainNFT");
    expect(matches.at(0).tokenId).toBe(42);
    expect(matches.at(1).collection.name).toBe("ArtNFT");
    expect(matches.at(1).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(2).collection.name).toBe("MainNFT");
    expect(matches.at(2).tokenId).toBeGreaterThanOrEqual(1);
    expect(matches.at(3).collection.name).toBe("ArtNFT");
    expect(matches.at(3).tokenId).toBe(25);
  });
});

describe("parseUsernameMatches", () => {
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

  it("returns empty array for non-matching content", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    expect(parse("hello world")).toEqual([]);
  });

  it("returns empty array for token IDs (numbers)", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    expect(parse("#1234")).toEqual([]);
    expect(parse("#42")).toEqual([]);
  });

  it("returns empty array for reserved keywords", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    expect(parse("#random")).toEqual([]);
    expect(parse("#rand")).toEqual([]);
  });

  it("matches simple username", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Show me #codincowboy");

    expect(matches.length).toBe(1);
    expect(matches.at(0).username).toBe("codincowboy");
    expect(matches.at(0).collection.name).toBe("MainNFT");
  });

  it("matches username with underscore", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Check #cool_user_123");

    expect(matches.length).toBe(1);
    expect(matches.at(0).username).toBe("cool_user_123");
  });

  it("matches prefixed username", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("artifacts#codincowboy");

    expect(matches.length).toBe(1);
    expect(matches.at(0).username).toBe("codincowboy");
    expect(matches.at(0).collection.name).toBe("ArtifactsNFT");
  });

  it("matches multiple usernames", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("Compare #user_one and #user_two");

    expect(matches.length).toBe(2);
    expect(matches.at(0).username).toBe("user_one");
    expect(matches.at(1).username).toBe("user_two");
  });

  it("ignores usernames starting with numbers", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#1user");

    expect(matches.length).toBe(0);
  });

  it("ignores usernames that are too short", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("#ab");

    expect(matches.length).toBe(0);
  });

  it("handles case-insensitive prefix matching", () => {
    const { parseUsernameMatches: parse } = jest.requireActual(
      "../../src/config/collection"
    );
    const matches = parse("ARTIFACTS#someuser");

    expect(matches.length).toBe(1);
    expect(matches.at(0).collection.name).toBe("ArtifactsNFT");
  });
});
