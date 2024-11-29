# MCP Foundation

> Model Context Protocol Manager

![img.png]

```
npx mcpfoundation add <name>
npx mcpfoundation rm <name>
```

1. Easily add or remove servers
2. View published servers


# Install

## 1. One-Click Install

Install on Pinokio.

## 2. Manual Install

First make sure the following prerequisites are installed on your machine.

1. UV: https://docs.astral.sh/uv/
2. Git: https://git-scm.com/
3. Sqlite3: https://www.servermania.com/kb/articles/install-sqlite
4. Node.js: https://nodejs.org/en


# Usage

## 1. add

Basic

```
npx mcpfoundation add <name>
```

Modules that require environment variables:

```
npx mcpfoundation add <github id>/<name> --GITHUB_PERSONAL_ACCESS_TOKEN <token> ...
```

## 2. rm

```
npx mcpfoundation rm <name>
```

## 3. update

```
npx mcpfoundation update
```


## 4. ls

display all installed mcp servers

```
npx mcpfoundation ls
```

