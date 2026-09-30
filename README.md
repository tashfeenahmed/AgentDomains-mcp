# AgentDomains MCP server

MCP server for [AgentDomains](https://agentdomains.co) — free domains for the websites and
APIs AI agents build. It gives any MCP-speaking agent a real hostname under `makes.fyi` or
`agentdomains.co`, with DNS records, HTTPS, URL forwarding, and reverse proxying.

Two ways to run it: locally over stdio via `npx`, or against the hosted remote endpoint at
`https://mcp.agentdomains.co`.

## Install (stdio)

No install step — `npx` fetches it on demand:

```bash
AGENTDOMAINS_API_KEY=adom_… npx -y agentdomains-mcp
```

### Claude Code

```bash
claude mcp add agentdomains --env AGENTDOMAINS_API_KEY=adom_… -- npx -y agentdomains-mcp
```

### Claude Desktop and other config-file clients

Add to `claude_desktop_config.json` (or your client's equivalent):

```json
{
  "mcpServers": {
    "agentdomains": {
      "command": "npx",
      "args": ["-y", "agentdomains-mcp"],
      "env": { "AGENTDOMAINS_API_KEY": "adom_…" }
    }
  }
}
```

## Remote endpoint

```
https://mcp.agentdomains.co
```

Streamable HTTP; send JSON-RPC over `POST` with your key in the `Authorization` header:

```bash
curl -s https://mcp.agentdomains.co \
  -H 'Authorization: Bearer adom_…' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

In Claude Code: `claude mcp add --transport http agentdomains https://mcp.agentdomains.co --header "Authorization: Bearer adom_…"`

## Configuration

| Variable | Purpose |
| --- | --- |
| `AGENTDOMAINS_API_KEY` | Your API key (`adom_…`). Falls back to `api_key` in `~/.agentdomains/config.json`. |
| `AGENTDOMAINS_API_URL` | Override the API base URL. Defaults to `https://api.agentdomains.co`. |

If you already use the [Go CLI](https://github.com/tashfeenahmed/AgentDomains), its
`~/.agentdomains/config.json` is picked up automatically and no env var is needed.

No key yet? Call the `signup` tool — it needs no credentials and returns one. **The key is
shown once and is never retrievable**, so store it immediately. Accounts are provisional:
attach an email with `attach_email` and confirm it within 30 days or the account and its
domains are deleted.

The API key is never logged, printed, or included in any tool output.

## Tools

| Tool | Endpoint | Description |
| --- | --- | --- |
| `check_availability` | `GET /v1/available` | Is a label free? No key required. |
| `signup` | `POST /v1/signup` | Create an account, get an API key (shown once). No key required. |
| `whoami` | `GET /v1/whoami` | Account state, email, quota, usage. |
| `attach_email` | `POST /v1/account/email` | Attach an email and send its verification link. |
| `claim_domain` | `POST /v1/subdomains` | Register `label.domain`, optionally with a first record. |
| `list_domains` | `GET /v1/subdomains` | List every name on the account. |
| `get_domain` | `GET /v1/subdomains/{label}` | One name, its records, forward/proxy state. |
| `delete_domain` | `DELETE /v1/subdomains/{label}` | **Destructive** — permanently delete a name and its records. |
| `add_dns_record` | `POST /v1/subdomains/{label}/records` | Add an A, AAAA, CNAME, or TXT record. |
| `delete_record` | `DELETE /v1/subdomains/{label}/records/{id}` | **Destructive** — remove one record, keeping the name. Ids come from `get_domain`. |
| `add_acme_challenge` | `POST /v1/subdomains/{label}/records` | TXT at `_acme-challenge` for Let's Encrypt DNS-01. |
| `set_forward` | `PUT /v1/subdomains/{label}/forward` | Redirect the name to a URL; replaces the address records on it. |
| `remove_forward` | `DELETE /v1/subdomains/{label}/forward` | Stop forwarding. |
| `set_proxy` | `PUT /v1/subdomains/{label}/proxy` | Serve a backend through the edge, with TLS terminated for you; replaces the address records on it. |
| `remove_proxy` | `DELETE /v1/subdomains/{label}/proxy` | Stop proxying. |
| `delegate_nameservers` | `PUT /v1/subdomains/{label}/ns` | Delegate the name to your own nameservers. |
| `delete_account` | `DELETE /v1/account[?force=true]` | **Destructive** — close the account and kill its key; refuses while names are held unless `force`. |
| `upgrade_to_pro` | `POST /v1/billing/checkout` | A Stripe checkout link for Pro (100 names, $5/month or $48/year). Charges nothing; a human opens the link and pays. |
| `manage_billing` | `POST /v1/billing/portal` | A Stripe billing-portal link for a Pro account (card, invoices, interval, cancel). |

Every label-scoped tool takes an optional `domain` (`makes.fyi`, the default, or
`agentdomains.co`).

**Setting a forward or a proxy takes the hostname over.** The `A`/`AAAA`/`CNAME` records
on the label itself are deleted in the same call and handed back as `replaced_records`,
so tell the user what moved. Sub-label records (`www.myapp.makes.fyi`) and TXT records
are left alone, and if the forward fails to come up the replaced records are restored
with new ids.

**A claim and its first record stand or fall together.** If `claim_domain` is given a
record it cannot create, nothing is claimed — fix the record and call again. Re-claiming
a name the account already holds answers `409` with `owned:true`, which means carry on.

### On HTTPS

"Get me SSL" is not one operation here. Two honest paths:

- **`set_proxy`** — the edge terminates TLS with its own certificate and proxies to your
  backend. Nothing to install on the origin.
- **`add_acme_challenge`** — publishes the DNS-01 TXT record so your own ACME client can
  issue a Let's Encrypt certificate (needed for wildcards or hosts with no public port 80).
  A plain public web server can just use HTTP-01 and needs no DNS record at all.

## Compatibility

Any MCP client works. Verified shapes for the common ones:

- **Claude Code** — `claude mcp add` (stdio or `--transport http`), as above.
- **Claude Desktop** — `mcpServers` block in `claude_desktop_config.json`.
- **OpenAI Agents SDK** — `MCPServerStdio(params={"command": "npx", "args": ["-y", "agentdomains-mcp"]})`, or `MCPServerStreamableHttp` against the remote URL.
- **LangChain / LangGraph** — `langchain-mcp-adapters`: `MultiServerMCPClient({"agentdomains": {"command": "npx", "args": ["-y", "agentdomains-mcp"], "transport": "stdio"}})`.
- **CrewAI** — `MCPServerAdapter` with the same stdio parameters.
- **Anything else** — point your client at `npx -y agentdomains-mcp` over stdio, or at
  `https://mcp.agentdomains.co` over Streamable HTTP.

## Development

```bash
npm install
npm run build     # tsc -> dist/
npm run smoke     # boots dist/index.js, runs initialize + tools/list over stdio
```

Requires Node 18+. The only runtime dependency is `@modelcontextprotocol/sdk`.

## Related

- [CLI (Go)](https://github.com/tashfeenahmed/AgentDomains) — the `agentdomains` command
- [Agent skill](https://github.com/tashfeenahmed/AgentDomains-skill) — Claude Code plugin
- [Docs](https://docs.agentdomains.co) · [HTTP API](https://docs.agentdomains.co/#api)

## License

FSL-1.1-Apache-2.0 — see [LICENSE](LICENSE). Same terms as the CLI.

## MCP Registry listing

This server is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io)
as `io.github.tashfeenahmed/agentdomains-mcp` — the index PulseMCP, Glama and other
agent-tool directories read from. The metadata is `server.json` in this repo.

Publishing is **manual** (GitHub Actions is not running on this account). On each npm
release, bump `version` in `server.json` and its `packages[0].version` to match
`package.json`, publish to npm first, then:

```bash
# once: install the publisher (macOS/Linux)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

./mcp-publisher login github     # device-code flow as the tashfeenahmed GitHub account
./mcp-publisher publish          # uploads server.json
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.tashfeenahmed/agentdomains-mcp"
```

The registry checks that the npm package's `mcpName` matches `name` in `server.json`,
so the npm version named in `server.json` must already be published.

`docs/publish-mcp-registry.yml` is an optional GitHub Actions workflow that does the same
on a `v*` tag via GitHub OIDC. It only runs if moved to `.github/workflows/` and Actions
is available on the account.
