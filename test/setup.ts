// Set log level to error to suppress info/debug logs during tests
// This makes test output cleaner and easier to read
process.env.LOG_LEVEL = "error";

import fetchMock from "jest-fetch-mock";

fetchMock.enableMocks();

beforeEach(() => {
  fetchMock.resetMocks();
});
