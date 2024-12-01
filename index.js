const path = require('path')
const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const os = require('os')
const fs = require('fs')
const child_process = require('child_process');
class MCP {
  constructor(options) {
    if (options) {
      if (options.servers) this.servers = options.servers
      if (options.config) this.config = options.config
    }
    if (!this.servers) {
      this.servers = process.env.MCP_SERVER_PATH || path.resolve(os.homedir(), "mcpfoundation")
    }
    if (!this.config) {
      let platform = os.platform()
      if (platform === "win32") {
        const APPDATA = process.env.AppData || process.env.APPDATA
        this.config = process.env.MCP_CONFIG_PATH || path.resolve(APPDATA, 'Claude/claude_desktop_config.json')
      } else if (platform === "darwin") {
        const HOME = process.env.HOME || process.env.Home
        this.config = process.env.MCP_CONFIG_PATH || path.resolve(HOME, 'Library/Application Support/Claude/claude_desktop_config.json')
      } else {
        throw new Error(`${platform} not yet supported`)
      }
    }
  }
  open(args) {
    let command = '';
    const platform = os.platform()
    switch (platform) {
      case 'darwin':
        command = 'open -R';
        break;
      case 'win32':
        command = 'explorer';
        break;
      default:
        command = 'xdg-open';
        break;
    }
    let c = `${command} "${this.config}"`
    child_process.exec(c)
  }

  tracker() {
    const accessedProperties = new Set();
    const handler = {
      get(_, prop) {
        accessedProperties.add(prop); // Track the accessed property
        //return "<input>"
        return prop
//        return new Proxy({}, handler); // Return a dummy proxy for further access
      }
    };
    return { proxy: new Proxy({}, handler), accessedProperties };
  }
  async args(argv) {
    if (!argv) {
      argv = { _: [] }
    }
    if (!argv._) argv._ = []
    // 1. the first argument is the command
    let cmd = argv._[0]
    // 2. the second argument is the URI (REPOSITORY_ID/FILEPATH)
    if (argv._.length > 1) {
      let id = argv._[1]
      let safe_id = id.split("/").join(".")
      let chunks = id.split("/")
      let repo
      let filepath
      if (chunks.length === 3) {
        repo = chunks.slice(0,2).join("/")
        filepath = chunks.slice(2).join("/") + ".js"
      } else if (chunks.length === 2) {
        repo = chunks.join("/")
        filepath = null
      }
      return { cmd, id, safe_id, chunks, repo, filepath, argv }
    } else {
      return { cmd, argv }
    }
  }
  async exists(argv) {
    let { repo, filepath } = await this.args(argv)
    let repo_exists = await this.pathExists(path.resolve(this.servers, repo))
    if (repo_exists) {
      if (filepath) {
        let file_exists = await this.pathExists(path.resolve(this.servers, repo, filepath))
        if (file_exists) {
          return true
        }
      } else {
        let file_exists = await this.pathExists(path.resolve(this.servers, repo))
        if (file_exists) {
          return true
        }
      }
    }
    return false
  }
  pathExists(p) {
    return fs.promises.access(p, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
  }
  async update(args) {
    const dir = path.join(this.servers, args.repo)
    await git.fastForward({ fs, http, dir })
  }
  async synchronize(args) {
    let argv = args.argv
    const dir = path.join(this.servers, args.repo)
    let exists = await this.exists(argv)
    if (!exists) {
      // doesn't exist. try cloning
      const github = `https://github.com/${args.repo}`
      await git.clone({ fs, http, dir, url: github })
    }
    if (argv.fresh) {
      await git.fastForward({ fs, http, dir })
    }
  }
  async add(args) {
    let argv = args.argv
    await this.synchronize(args)

    // require the module
    let fullpath = path.resolve(this.servers, args.repo, args.filepath)
    let mod = require(fullpath)
    let add_mcp_config
    try {
      add_mcp_config = mod(argv).mcpServers
    } catch (e) {
      console.log(e.stack)
      return
    }

    // if the MCP_ENV variable is set, inherit the environment variables from the current environment
    if (process.env.MCP_ENV) {
      const env_keys = process.env.MCP_ENV.split(",")
      if (!add_mcp_config.env) {
        add_mcp_config.env = {}
      }
      for(let key of env_keys) {
        add_mcp_config.env[key] = process.env[key]
      }
    }

    // get the existing JSON stored at the MCP_SERVER_PATH
    let mcp_config_exists = await this.pathExists(this.config)
    // add the json to the existing JSON
    let existing_mcp_config
    if (mcp_config_exists) {
      existing_mcp_config = require(this.config)
      existing_mcp_config.mcpServers = {
        ...existing_mcp_config.mcpServers,
        //[args.id]: add_mcp_config,
        [args.safe_id]: add_mcp_config,
      }
    } else {
      existing_mcp_config = {
        mcpServers: {
          //[args.id]: add_mcp_config
          [args.safe_id]: add_mcp_config
        }
      }
    }
    // write back to the location
    await fs.promises.writeFile(this.config, JSON.stringify(existing_mcp_config, null, 2))
  }
  async walk(dir) {
    let results = []
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          let result = await this.walk(fullPath)
          results = results.concat(result)
        } else if (entry.isFile() && fullPath.endsWith('.js')) {
          try {
            let relpath = path.relative(this.servers, fullPath)
            let chunks = relpath.split("/")
            let repo = chunks.slice(0, 2).join("/")
            let filepath = chunks.slice(2).join("/")
            let result = await this._inspect(repo, filepath)
            results.push(result)
          } catch (error) {
            console.error(`Failed to import or execute ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to process directory ${dir}:`, error);
    }
    return results
  }
  async ls(args) {
    // no arg return all installed package configs
    // arg "on" => return only the ones included in the config file
    // arg "off" => return only the ones NOT included in the config file
    let startPath = this.servers
    if (args.argv._.length === 2) {
      startPath = path.resolve(this.servers, args.argv._[1]) 
    }
    let results = await this.walk(startPath)
    let mcp_config_exists = await this.pathExists(this.config)
    if (mcp_config_exists) {
      let mcp_config = require(this.config)
      for(let i=0; i<results.length; i++) {
        let item = results[i]
        if (mcp_config.mcpServers[item.safe_id]) {
          results[i].on = true  
          results[i].stored = mcp_config.mcpServers[item.safe_id]
          // find the variables from 'args' and set 'stored_args'
          let stored_args = {}
          if (results[i].stored && results[i].example) {
            if (results[i].stored.args.length === results[i].example.args.length) {
              let args = results[i].args
              for(let arg of args) {
                let example_args = results[i].example.args
                for(let j=0; j<example_args.length; j++) {
                  let example_arg = example_args[j]
                  if (example_arg === arg) {
                    let stored = results[i].stored.args[j]
                    stored_args[arg] = stored
                  }
                }
              }
            }
          }
          results[i].stored_args = stored_args
        } else {
          results[i].on = false
        }
      }
    }
    // sort so the on results appear at the top
    let on = []
    let off = []
    for(let result of results) {
      if (result.on) {
        on.push(result)
      } else {
        off.push(result)
      }
    }
    on.sort()
    off.sort()
    let items = [].concat(on).concat(off)
    return items
  }
  async rm(args) {
    let argv = args.argv
    let mcp_config = require(this.config)
    //delete mcp_config.mcpServers[args.id]
    delete mcp_config.mcpServers[args.safe_id]
    await fs.promises.writeFile(this.config, JSON.stringify(mcp_config, null, 2))
  }
  async run(argv) {
    await fs.promises.mkdir(this.servers, { recursive: true }).catch((e) => { })
    let args = await this.args(argv)
    let response = await this[args.cmd](args)
    return response
  }

  // Returns the arguments used by the server
  async inspect(args) {
    if (args.argv.fresh) {
      await this.synchronize(args)
    }
    let r = await this._inspect(args.repo, args.filepath)
    return r
  }
  async _inspect(repo, filepath) {
    let { proxy, accessedProperties } = await this.tracker()
    let fullpath = path.resolve(this.servers, repo, filepath)
    let mod = require(fullpath)
    let proxy_return_value = mod(proxy).mcpServers
    const generate_example = (obj) => {
      if (obj && typeof obj === "object") {
        return Array.isArray(obj)
          ? obj.map(generate_example) // Recursively handle arrays
          : Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
              key,
              accessedProperties.has(key) ? key : generate_example(value)
            ])
          );
      }
      return obj;
    };
    const example = generate_example(proxy_return_value)
    let id = repo + "/" + filepath.split(".")[0]
    let safe_id = id.split("/").join(".")
    return {
      id,
      safe_id,
      repo,
      filepath,
      args: [...accessedProperties],
      example
    }
  }
}
module.exports = MCP
