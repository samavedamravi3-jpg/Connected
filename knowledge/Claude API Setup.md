# Claude API setup

Claude Code in VS Code is already working. The API key below is only for Claude features inside Connected.

1. Open [Anthropic API keys](https://platform.claude.com/settings/keys) and create a key yourself. Any billing setup is also your decision.
2. In VS Code, open the ignored `.dev.vars` file in the project root. Paste the key after `ANTHROPIC_API_KEY=`. Do not paste it into chat, notes, or GitHub.
3. Restart the local development server and open a person’s card. Generate an introduction; it should identify Claude as the source. Without a key it clearly uses a template.
4. When private hosting is unblocked, configure the key as a server-side runtime secret there too. Local settings are not deployed.

The code limits each signed-in user to 20 AI drafts per day. No precise location is sent to Claude. The current default model can be overridden with `ANTHROPIC_MODEL`.
