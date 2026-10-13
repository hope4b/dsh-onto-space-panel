# Onto Space Panel for DeepSeek Harness

A compact Onto space picker and a side panel for declarations, resident agents,
memory artifacts, templates and objects. Select what belongs in the current chat;
the active context remains visible above the composer.

## Features

- Search and select available Onto spaces.
- Open the space panel with **Обзор**.
- Read an accepted/current space declaration and attach it to the chat.
- Inspect resident agents and their charters. Selecting a valid active resident
  loads its accepted charter and constitution into the current chat.
- Search and page through accepted memory artifacts, read their contents and
  explicitly attach or disconnect them.
- Browse templates and objects, then include selected objects in the conversation.
- Keep selections and context separate for each chat and each selected realm.
- Change context through the `select_onto_space` and
  `configure_onto_chat_context` model tools when the user requests it.

The UI is currently in Russian. Names and descriptions are supplied by Onto.
An agent selection gives the current Harness conversation a resident role;
it does not launch a separate agent process or external agent broker.

## Requirements

- DeepSeek Harness with its Web UI or Desktop application.
- An existing authenticated Onto MCP connection named **`onto`**. This package
  does not create an MCP connection, include an API key or connect to a fixed host.
- The connection must expose `list_available_realms`, `about_realm`,
  `list_realm_agents`, `get_realm_agent`, `search_memory_artifacts`,
  `get_memory_artifact`, `get_memory_artifact_by_path`, `search_templates`,
  `search_objects` and `get_entity` for their respective panel features.

Host integration was developed against DeepSeek Harness **0.2.0-rc.2**.
Other releases are not yet verified. Harness is in developer preview and its
extension interfaces can change.

## Install a release tarball

Download the package `.tgz` from the project's release and install it into a
Web-capable profile. For example:

```sh
dsh plugin --profile web add ./dsh-onto-space-panel-1.1.1.tgz
```

Release downloads: https://github.com/hope4b/dsh-onto-space-panel/releases

You can also install the tagged GitHub source, which already contains the built
browser entry point and has no install-time build script:

```sh
dsh plugin --profile web add github:hope4b/dsh-onto-space-panel#v1.1.1
```

In Desktop, use **Plugins** to install the downloaded bundle where supported by
your version. The tarball already contains the browser bundle; no install-time
build script or extra build permission is needed.

If this plugin was previously loaded manually by an absolute-path row in
`cordis.patch.yml`, disable that old row before enabling the packaged bundle.
Do not run two copies: they register the same tools and API routes.

Restart Harness after installing or replacing the bundle. Select an Onto space
above the composer and press **Обзор** to open its panel. Use **В контекст** to
attach a declaration or memory artifact. A role or material can be removed using
the `×` next to its context label.

## Connect Onto MCP

The panel currently has no connection-settings form. Configure the Onto MCP
server in Harness, then the panel uses that connection automatically.
If your profile already has a working server named `onto`, skip this setup.

1. Obtain your Onto **MCP endpoint URL** and personal API key from your Onto
   administrator. Use the MCP endpoint, not the ordinary Onto website URL.
2. Open the active profile's `cordis.patch.yml`: normally
   `~/.dsh/profiles/web/cordis.patch.yml` for Web or
   `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` for Windows Desktop.
   A custom `DSH_HOME` changes the `.dsh` location.
3. Append the following patch, replacing the placeholder URL. If an Onto entry
   already exists, update it instead of creating a duplicate. The server name
   must be exactly `onto`.

```yaml
- insert:
    - id: mcp-onto
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: onto
        transport: streamable-http
        url: https://YOUR-ONTO-MCP-HOST/mcp
        headers:
          X-Onto-Api-Key: !!js process.env.ONTO_API_KEY
```

This example uses Onto's `X-Onto-Api-Key` header. Confirm the authentication
scheme with your server administrator if your deployment differs.
A copy is available in [examples/onto-mcp.patch.yml](examples/onto-mcp.patch.yml).

4. Set `ONTO_API_KEY` in the environment of the process that starts Harness.
   For Web on Windows, start it from the same PowerShell window:

```powershell
$env:ONTO_API_KEY = 'YOUR_PERSONAL_API_KEY'
dsh --profile web
```

For Windows Desktop, fully quit Harness first, set the variable above, then
launch the executable from that same PowerShell window. For the default installer
location:

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe"
```

Launching via an existing desktop shortcut does not inherit a variable set only
in this PowerShell window. The variable must be available on every launch.
Enter your real key locally; do not commit it or share terminal history containing it.

5. Open the space selector above the composer. Your accessible spaces should
   appear. You can also ask the model to call `mcp__onto__list_available_realms`.

If connection fails, check the endpoint and network access first. A `401` or
`403` response usually indicates authentication or access rights. If the tools
work in chat but the panel cannot find them, check that `serverName` is `onto`.
Missing agent or memory tools affect those sections separately; an empty list
can also mean your account has no access to those resources.

The transport and environment-variable syntax follow the official
[Harness MCP client configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md#minimal-configuration).

## Privacy and context

The plugin makes read-only Onto calls through your existing MCP connection.
It does not publish Onto data or perform artifact lifecycle mutations.
Attached documents are sent to the model used by your Harness chat as context.

Selections and document snapshots are persisted locally under:

```text
$DSH_HOME/storages/onto-space-selections/
$DSH_HOME/storages/onto-chat-contexts/
```

When `DSH_HOME` is unset, the usual `~/.dsh` home is used. The context directory
contains copies of documents you attached. It is not part of the distributed
package. Context changes are protected against stale revisions and realm switches.

Missing declarations, unavailable agent governance and empty memory collections
are displayed explicitly. An unavailable resident cannot be selected. Connected
materials are snapshots from the time they were attached, not a live synchronization
of their later revisions.

## Package locally

The checked-in `client.js` is ready to load, so packaging requires no compilation:

```sh
npm run check
npm pack
```

From a source checkout, run the synthetic public tests with `npm test`.

The package uses Node built-ins on the host and Harness's shared React runtime
in the browser. It has no runtime dependencies of its own and no install scripts.

## Validation

The development checks covered real Onto response formats, declaration reading,
resident validation and accepted governance loading, memory list/body reading,
context projection, persistence, per-chat/per-realm isolation, stale revisions,
and realm switches during attachment. Browser checks covered space selection,
panel navigation, context attachment and separation between conversations.

Private example data and development fixtures are excluded from this release.

## License

MIT. This is a community integration, not an official DeepSeek product.
