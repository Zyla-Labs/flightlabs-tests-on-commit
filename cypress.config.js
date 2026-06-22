require('dotenv').config();
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  requestTimeout: 30000,
  responseTimeout: 30000,
  e2e: {
    baseUrl: 'https://www.goflightlabs.com',
    env: {
      FLIGHTLABS_API_KEY: process.env.FLIGHTLABS_API_KEY
    },
    video: false
  }
});