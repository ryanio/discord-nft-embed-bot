const NO_COLLECTIONS_ERROR_REGEX = /No collections configured/;

describe("initCollections with COLLECTIONS env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("parses single collection (default)", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:1000";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

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
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.chain).toBe("polygon");
    expect(defaultCol.color).toBe("#ff5500");
  });

  it("parses collection with custom image URL", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:https://example.com/images/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customImageUrl).toBe(
      "https://example.com/images/{id}.png"
    );
  });

  it("parses collection with custom image URL containing colons", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:https://example.com:8080/images/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customImageUrl).toBe(
      "https://example.com:8080/images/{id}.png"
    );
  });

  it("parses prefixed collection with custom image URL", () => {
    process.env.COLLECTIONS =
      "art:0xabc:ArtNFT:1:1000:ethereum:#ff0000:https://art.io/{id}.png";
    const { initCollections: init, getCollectionByPrefix: getByPrefix } =
      jest.requireActual("../../src/config/collection");

    init();
    const artCol = getByPrefix("art");

    expect(artCol.name).toBe("ArtNFT");
    expect(artCol.customImageUrl).toBe("https://art.io/{id}.png");
  });

  it("returns undefined for customImageUrl when not provided", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:1000:ethereum:#00ff88";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customImageUrl).toBeUndefined();
  });

  it("parses collection with custom description", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:View token #{id} here";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBe("View token #{id} here");
    expect(defaultCol.customImageUrl).toBeUndefined();
  });

  it("parses collection with custom description and image URL", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:View token #{id}:https://example.com/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBe("View token #{id}");
    expect(defaultCol.customImageUrl).toBe("https://example.com/{id}.png");
  });

  it("parses collection with markdown links in custom description", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:[View Bot](http://glyphbots.com/bot/{id}):https://example.com/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBe(
      "[View Bot](http://glyphbots.com/bot/{id})"
    );
    expect(defaultCol.customImageUrl).toBe("https://example.com/{id}.png");
  });

  it("parses collection with https link in custom description (no image URL)", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:[View Bot](https://glyphbots.com/bot/{id})";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBe(
      "[View Bot](https://glyphbots.com/bot/{id})"
    );
    expect(defaultCol.customImageUrl).toBeUndefined();
  });

  it("reconstructs URLs that were split by colons in markdown links", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:[View Bot](http://glyphbots.com/bot/{id}/generate) [View Artifact](https://www.glyphbots.com/artifact/{id}):https://example.com/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toContain(
      "[View Bot](http://glyphbots.com/bot/{id}/generate)"
    );
    expect(defaultCol.customDescription).toContain(
      "[View Artifact](https://www.glyphbots.com/artifact/{id})"
    );
    expect(defaultCol.customImageUrl).toBe("https://example.com/{id}.png");
  });

  it("handles custom description with multiple markdown links", () => {
    process.env.COLLECTIONS =
      "b:0xb6C2c2d2999c1b532E089a7ad4Cb7f8C91cf5075:Bot:1:11111:ethereum:#00ff88:[View Bot · Generate](http://glyphbots.com/bot/{id}/generate) [View Bot](http://glyphbots.com/bot/{id}) [View Artifact](https://www.glyphbots.com/artifact/{id}):https://glyphbots.com/bots/pngs/{id}.png";
    const { initCollections: init, getCollectionByPrefix: getByPrefix } =
      jest.requireActual("../../src/config/collection");

    init();
    const botCol = getByPrefix("b");

    expect(botCol.customDescription).toContain(
      "[View Bot · Generate](http://glyphbots.com/bot/{id}/generate)"
    );
    expect(botCol.customDescription).toContain(
      "[View Bot](http://glyphbots.com/bot/{id})"
    );
    expect(botCol.customDescription).toContain(
      "[View Artifact](https://www.glyphbots.com/artifact/{id})"
    );
    expect(botCol.customImageUrl).toBe(
      "https://glyphbots.com/bots/pngs/{id}.png"
    );
  });

  it("treats standalone URL as imageUrl when no custom description", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:https://example.com/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBeUndefined();
    expect(defaultCol.customImageUrl).toBe("https://example.com/{id}.png");
  });

  it("handles custom description with colons in text", () => {
    process.env.COLLECTIONS =
      "0xabc:TestNFT:1:1000:ethereum:#00ff88:Time: 12:34 PM:https://example.com/{id}.png";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.customDescription).toBe("Time: 12:34 PM");
    expect(defaultCol.customImageUrl).toBe("https://example.com/{id}.png");
  });

  it("parses multiple collections", () => {
    process.env.COLLECTIONS =
      "0xabc:MainNFT:1:1000,secondary:0xdef:SecondNFT:0:500";
    const {
      initCollections: init,
      getCollections: getAll,
      getCollectionByPrefix: getByPrefix,
    } = jest.requireActual("../../src/config/collection");

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
      jest.requireActual("../../src/config/collection");

    init();
    const all = getAll();

    expect(all.length).toBe(1);
  });

  it("skips entries with missing address or name", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:1000,prefix::NoAddress:0:100";
    const { initCollections: init, getCollections: getAll } =
      jest.requireActual("../../src/config/collection");

    init();
    const all = getAll();

    expect(all.length).toBe(1);
  });

  it("throws error when no collections configured", () => {
    process.env.COLLECTIONS = undefined;
    process.env.TOKEN_ADDRESS = undefined;
    process.env.TOKEN_NAME = undefined;

    const { initCollections: init } = jest.requireActual(
      "../../src/config/collection"
    );

    expect(() => init()).toThrow(NO_COLLECTIONS_ERROR_REGEX);
  });

  it("parses first collection with explicit prefix (falls back as default)", () => {
    process.env.COLLECTIONS = "main:0xabc:MainNFT:1:1000";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      getCollectionByPrefix: getByPrefix,
    } = jest.requireActual("../../src/config/collection");

    init();

    const defaultCol = getDefault();
    expect(defaultCol).toBeDefined();
    expect(defaultCol.name).toBe("MainNFT");

    const main = getByPrefix("main");
    expect(main).toBeDefined();
    expect(main.name).toBe("MainNFT");
    expect(main.prefix).toBe("main");
  });

  it("parses multiple collections all with prefixes (first becomes fallback default)", () => {
    process.env.COLLECTIONS =
      "primary:0xabc:MainNFT:1:1000,secondary:0xdef:SecondNFT:0:500";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      getCollections: getAll,
      getCollectionByPrefix: getByPrefix,
    } = jest.requireActual("../../src/config/collection");

    init();
    const all = getAll();

    expect(all.length).toBe(2);

    const defaultCol = getDefault();
    expect(defaultCol).toBeDefined();
    expect(defaultCol.name).toBe("MainNFT");

    const primary = getByPrefix("primary");
    expect(primary.name).toBe("MainNFT");

    const secondary = getByPrefix("secondary");
    expect(secondary.name).toBe("SecondNFT");
  });
});

describe("initCollections with legacy env vars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

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
      jest.requireActual("../../src/config/collection");

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

describe("getHelpText", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns formatted help text", () => {
    process.env.COLLECTIONS = "0xabc:MainNFT:1:100,art:0xdef:ArtNFT:1:50";
    const { initCollections: init, getHelpText: help } = jest.requireActual(
      "../../src/config/collection"
    );

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
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.COLLECTIONS = "0xabc:MainNFT:1:100,test:0xdef:TestNFT:1:50";
    const { initCollections: init } = jest.requireActual(
      "../../src/config/collection"
    );
    init();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns undefined for non-existent prefix", () => {
    const { getCollectionByPrefix: getByPrefix } = jest.requireActual(
      "../../src/config/collection"
    );

    expect(getByPrefix("nonexistent")).toBeUndefined();
  });

  it("normalizes prefix to lowercase", () => {
    const { getCollectionByPrefix: getByPrefix } = jest.requireActual(
      "../../src/config/collection"
    );

    expect(getByPrefix("TEST")).toBeDefined();
    expect(getByPrefix("Test")).toBeDefined();
  });
});

describe("dynamic supply (maxTokenId = *)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("parses * as dynamic supply marker", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:*";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.dynamicSupply).toBe(true);
    expect(defaultCol.maxTokenId).toBe(0); // Placeholder until slug init
  });

  it("sets dynamicSupply to false for numeric maxId", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:1000";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.dynamicSupply).toBe(false);
    expect(defaultCol.maxTokenId).toBe(1000);
  });

  it("parses * with chain and color", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:*:polygon:#ff5500";
    const { initCollections: init, getDefaultCollection: getDefault } =
      jest.requireActual("../../src/config/collection");

    init();
    const defaultCol = getDefault();

    expect(defaultCol.dynamicSupply).toBe(true);
    expect(defaultCol.chain).toBe("polygon");
    expect(defaultCol.color).toBe("#ff5500");
  });

  it("parses * for prefixed collection", () => {
    process.env.COLLECTIONS = "art:0xabc:ArtNFT:1:*:ethereum:#ff0000";
    const { initCollections: init, getCollectionByPrefix: getByPrefix } =
      jest.requireActual("../../src/config/collection");

    init();
    const artCol = getByPrefix("art");

    expect(artCol.dynamicSupply).toBe(true);
    expect(artCol.maxTokenId).toBe(0);
  });
});

describe("checkDynamicTokenId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns true for token within range", async () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:100";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      checkDynamicTokenId,
    } = jest.requireActual("../../src/config/collection");

    init();
    const collection = getDefault();
    const result = await checkDynamicTokenId(collection, 50, []);

    expect(result).toBe(true);
  });

  it("returns false for token out of range (non-dynamic)", async () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:100";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      checkDynamicTokenId,
    } = jest.requireActual("../../src/config/collection");

    init();
    const collection = getDefault();
    const result = await checkDynamicTokenId(collection, 150, []);

    expect(result).toBe(false);
  });

  it("returns false for token below minTokenId", async () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:10:100";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      checkDynamicTokenId,
    } = jest.requireActual("../../src/config/collection");

    init();
    const collection = getDefault();
    const result = await checkDynamicTokenId(collection, 5, []);

    expect(result).toBe(false);
  });

  it("returns false for NaN token", async () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:100";
    const {
      initCollections: init,
      getDefaultCollection: getDefault,
      checkDynamicTokenId,
    } = jest.requireActual("../../src/config/collection");

    init();
    const collection = getDefault();
    const result = await checkDynamicTokenId(collection, Number.NaN, []);

    expect(result).toBe(false);
  });
});

describe("parseMessageMatches with dynamic supply", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows explicit tokens beyond max for dynamic collections", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:*";
    const { initCollections: init, parseMessageMatches } = jest.requireActual(
      "../../src/config/collection"
    );

    init();
    // maxTokenId is 0 (placeholder), so #100 would normally be invalid
    const matches = parseMessageMatches("#100");

    expect(matches.length).toBe(1);
    expect(matches.at(0).tokenId).toBe(100);
  });

  it("rejects tokens beyond max for non-dynamic collections", () => {
    process.env.COLLECTIONS = "0xabc:TestNFT:1:50";
    const { initCollections: init, parseMessageMatches } = jest.requireActual(
      "../../src/config/collection"
    );

    init();
    const matches = parseMessageMatches("#100");

    expect(matches.length).toBe(0);
  });
});
