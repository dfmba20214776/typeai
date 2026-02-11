/** @type {import("@playwright/test").PlaywrightTestConfig} */
module.exports = {
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" }
};
