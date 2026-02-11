/** @type {import("@playwright/test").PlaywrightTestConfig} */
module.exports = {
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command:
      "cmd /c \"set PATH=%LOCALAPPDATA%\\Microsoft\\WinGet\\Packages\\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\\node-v24.13.0-win-x64;%PATH% && .\\node_modules\\.bin\\next.cmd dev\"",
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI
  }
};
