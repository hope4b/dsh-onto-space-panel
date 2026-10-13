# Changelog

## 1.2.1

- Accept a pasted `X-Onto-Api-Key: value` line in the API key field.
- Explain Onto authentication failures returned as successful MCP text, instead of reporting a realm-format error.
- Clarify that the key field expects only the header value.

## 1.2.0

- First-use Onto connection form with endpoint, masked API key and access check.
- Reuse existing Harness MCP connections; restore panel-managed connections on startup.
- Store keys through Harness's credential provider and keep configuration per profile.
- Show inline connection errors without exposing server error text or keys.
- Invalidate previous selections and attached context when the server or account changes.
- Parse realm lists returned as plain MCP text as well as structured content.

## 1.1.1

- First public release as `dsh-onto-space-panel`.
- Compact split control for selecting an Onto space and opening its overview.
- Composer-aligned spacing and a quiet attached-context row.

## 1.1.0

- Added the space side panel for declarations, resident agents, memory and objects.
- Added persistent per-chat context and user-requested model context changes.
- Added active-resident validation and accepted charter/constitution loading.

## 1.0.0

- Initial per-chat Onto space picker and realm defaults for MCP calls.
