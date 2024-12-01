#!/usr/bin/env node
const express = require('express')
const path = require('path')
const MCP = require('../index')
const app = express()
const port = process.env.PORT || 3000
const mcp = new MCP()
app.use(express.static(path.resolve(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set("views", path.resolve(__dirname, "views"))
app.use(express.static(path.resolve(__dirname, 'public')))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', async (req, res) => {
  res.render("index", {
    MCP_DEFAULT_REPO: (process.env.MCP_DEFAULT_REPO || "peanutcocktail/mcpc")
  })
})
app.get("/inspect/*", async (req, res) => {
  let repo = req.params[0]
  await mcp.run({ _: ["synchronize", repo] })
  let items = await mcp.run({ _: ["ls", repo] })
  let url = `https://github.com/${repo}`
  res.render("inspect", { repo, url, items })
})
app.post("/run", async (req, res) => {
  await mcp.run(req.body)
  res.json({ success: true })
})
app.listen(port, () => {
  console.log(`MCP Foundation UI running at: http://localhost:${port}`)
})
