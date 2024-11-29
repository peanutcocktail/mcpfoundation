#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const path = require('path')
const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const os = require('os')
const fs = require('fs')
class App {
  async args(argv) {
    // 1. the first argument is the command
    let cmd = argv._[0]
    // 2. the second argument is the URI (REPOSITORY_ID/FILEPATH)
    if (argv._.length > 1) {
      let id = argv._[1]
      let chunks = id.split("/")
      let repo = chunks.slice(0,2).join("/")
      let filepath = chunks.slice(2).join("/") + ".js"
      return { cmd, id, chunks, repo, filepath, argv }
    } else {
      return { cmd, argv }
    }
  }
  async exists(root, argv) {
    let { repo, filepath } = await this.args(argv)
    let repo_exists = await this.pathExists(path.resolve(root, repo))
    if (repo_exists) {
      let file_exists = await this.pathExists(path.resolve(root, repo, filepath))
      if (file_exists) {
        return true
      }
    }
    return false
  }
  pathExists(p) {
    return fs.promises.access(p, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
  }
  async update(root, mcp_config_path, args) {
    const dir = path.join(root, args.repo)
    await git.fastForward({ fs, http, dir })
  }
  async add(root, mcp_config_path, args) {
    let argv = args.argv
    let exists = await this.exists(root, argv)
    const dir = path.join(root, args.repo)
    if (!exists) {
      // doesn't exist. try cloning
      const github = `https://github.com/${args.repo}`
      await git.clone({ fs, http, dir, url: github })
    }
    await git.fastForward({ fs, http, dir })

    // require the module
    let fullpath = path.resolve(root, args.repo, args.filepath)
    let mod = require(fullpath)
    let add_mcp_config = mod(argv)
    // get the existing JSON stored at the MCP_SERVER_PATH
    let mcp_config_exists = await this.pathExists(mcp_config_path)
    // add the json to the existing JSON
    let existing_mcp_config
    if (mcp_config_exists) {
      existing_mcp_config = require(mcp_config_path)
      existing_mcp_config.mcpServers = {
        [args.id]: add_mcp_config,
        ...existing_mcp_config.mcpServers
      }
    } else {
      existing_mcp_config = {
        mcpServers: {
          [args.id]: add_mcp_config
        }
      }
    }
    // write back to the location
    await fs.promises.writeFile(mcp_config_path, JSON.stringify(existing_mcp_config, null, 2))
  }
  async ls(root, mcp_config_path, args) {
    let mcp_config = require(mcp_config_path)
    console.log(Object.keys(mcp_config.mcpServers).join("\n"))
  }
  async foundation() {
    let items = await fetch("https://api.github.com/search/repositories?q=topic:mcpfoundation&sort=updated&direction=desc").then((res) => {
      return res.json()
    }).then((res) => {
      return res.items.map((item) => {
        let owner_avatar = item.owner.avatar_url
        let owner_name = item.owner.login
        let url = item.html_url
        let name = item.full_name
        let short_name = item.name
        let description = (item.description ? item.description : "")
        let star = item.stargazers_count
        let watch = item.watchers_count
        let fork = item.forks
        let clone = item.html_url
        let created = item.created_at
        let updated = item.updated_at
        return {
          title: name.split("/")[1],
          description,
          image: owner_avatar,
          url,
          path: name,
          download: clone,
          updated,
          star
        }
      })
    })
    console.log(items)
  }
  async rm(root, mcp_config_path, args) {
    let argv = args.argv
    let exists = await this.exists(root, argv)
    let mcp_config = require(mcp_config_path)
    delete mcp_config.mcpServers[args.id]
    await fs.promises.writeFile(mcp_config_path, JSON.stringify(mcp_config, null, 2))
  }
  async run() {
    const argv = yargs(hideBin(process.argv)).parse();
    const root = process.env.MCP_DATA_PATH || path.resolve(os.homedir(), "mcpfoundation")
    await fs.promises.mkdir(root, { recursive: true }).catch((e) => { })
    let platform = os.platform()
    let mcp_config_path
    if (platform === "win32") {
      mcp_config_path = process.env.MCP_CONFIG_PATH || path.resolve(envs.APPDATA, 'Claude/claude_desktop_config.json')
    } else if (platform === "darwin") {
      const HOME = process.env.HOME || process.env.Home
      mcp_config_path = process.env.MCP_CONFIG_PATH || path.resolve(HOME, 'Library/Application Support/Claude/claude_desktop_config.json')
    } else {
      throw new Error(`${platform} not yet supported`)
    }
    let args = await this.args(argv)
    if (args.cmd === "add") {
      await this.add(root, mcp_config_path, args)
    } else if (args.cmd === "rm") {
      await this.rm(root, mcp_config_path, args)
    } else if (args.cmd === "update") {
      await this.rm(root, mcp_config_path, args)
    } else if (args.cmd === "ls") {
      await this.ls(root, mcp_config_path, args)
    }
  }
}
(async () => {
  const app = new App();
  await app.run()
})();
