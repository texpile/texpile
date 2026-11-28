---
nav: Other models and API keys
description: Run Texpile's AI features on a local model, an API key or a gateway by setting the model up in OpenCode.
order: 6
---

# Other models and API keys

Texpile reaches every model through an agent. OpenCode connects to almost any provider. Use it for a local model through Ollama or LM Studio, your own API key, OpenRouter, or a university gateway.

> [!REQUIRES] [OpenCode](https://opencode.ai) installed outside Texpile

## Set up OpenCode

1. Set up the model in OpenCode, as in the sections below.
2. Pick **OpenCode** from the **Agent** menu in `Preferences › AI agent`.
3. Pick the model for each task under **Models**. The menus list every model OpenCode knows.

A local model keeps your text on your computer. It answers more slowly than a hosted one and makes more mistakes, which shows most in Proofread project on a long paper.

## API key or OpenRouter

Run `opencode auth login` in a terminal and pick the provider, such as Anthropic, OpenAI or OpenRouter. Paste the key when it asks. OpenCode keeps the key, and Texpile never sees it.

## Ollama or LM Studio

Add the server to OpenCode's config file, `~/.config/opencode/opencode.json` (`%USERPROFILE%\.config\opencode\opencode.json` on Windows), and list the models you pulled:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"provider": {
		"ollama": {
			"npm": "@ai-sdk/openai-compatible",
			"name": "Ollama",
			"options": { "baseURL": "http://localhost:11434/v1" },
			"models": { "qwen3:8b": { "name": "Qwen3 8B" } }
		}
	}
}
```

For LM Studio, use `http://localhost:1234/v1` as `baseURL` and the model names LM Studio shows.

## A gateway

A gateway that speaks the OpenAI API, such as one your university runs, takes the same entry with its address and key:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"provider": {
		"gateway": {
			"npm": "@ai-sdk/openai-compatible",
			"name": "University gateway",
			"options": { "baseURL": "https://ai.example.edu/v1", "apiKey": "{env:GATEWAY_KEY}" },
			"models": { "llama-3.3-70b": { "name": "Llama 3.3 70B" } }
		}
	}
}
```

`{env:GATEWAY_KEY}` reads the key from an environment variable of that name. Set it before you start Texpile.

## Fields

| Field             | Type   | Description                                                                     |
| ----------------- | ------ | ------------------------------------------------------------------------------- |
| `npm`             | string | `"@ai-sdk/openai-compatible"` for any server that speaks the OpenAI API.        |
| `name`            | string | The provider's name in the Models menus.                                        |
| `options.baseURL` | string | The server's address, ending in `/v1`.                                          |
| `options.apiKey`  | string | The key, or `{env:NAME}` to read it from an environment variable. Optional.     |
| `models`          | object | One entry per model: the model's id on the server, with a `name` for the menus. |

OpenCode's own [provider docs](https://opencode.ai/docs/providers/) list every provider and option.
