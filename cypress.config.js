const { defineConfig } = require("cypress");
const config = require('./next.config')
const { i18n } = require("./next-i18next-static-site.config");

// setConfig(config.publicRuntimeConfig)

module.exports = defineConfig({
  component: {
    devServer: {
      framework: "next",
      bundler: "webpack"
    },
  },
  e2e: {
    baseUrl: 'http://localhost:3000',
  },
  video: false,
  screenshotOnRunFailure: false
});
