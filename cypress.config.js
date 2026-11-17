require('dotenv').config();
const { defineConfig } = require('cypress');
const { registerFailedRequestReport } = require('./cypress/support/failed-request-report');

module.exports = defineConfig({
  requestTimeout: 30000,
  responseTimeout: 30000,
  e2e: {
    baseUrl: 'https://www.goflightlabs.com',
    env: {
      FLIGHTLABS_API_KEY: process.env.FLIGHTLABS_API_KEY
    },
    video: false,
    setupNodeEvents(on, config) {
      registerFailedRequestReport(on, config);
      return config;
    }
  }
});