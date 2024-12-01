#!/usr/bin/env node
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const MCP = require("../index");
(async () => {
  const app = new MCP({
    servers: null,     // where to store MCP servers
    config: null    // where the MCP config files are stored (for each app)
  });
  const argv = yargs(hideBin(process.argv)).parse();
  let response = await app.run(argv)
  if (response) {
    console.log(JSON.stringify(response, null, 2))
  }
})();
