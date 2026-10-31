# Candid

> A new place. A little more familiar.

A text-based AI companion for adults settling into a new city or program.
Talk through your day, explore small next steps, and choose what you want Candid
to remember.

Built for **Hackathon@Dartmouth**.

**[Visit the website](https://candid-dartmouth.vercel.app/)** ·
**[Open the app](https://candid-dartmouth.vercel.app/app)**

## What you can do

- **Talk things through.** Share everyday experiences, new routines, and the
  small decisions that come with getting settled.
- **Choose what gets remembered.** Review, edit, save, or dismiss suggested
  memories from your conversations.
- **Manage your memories.** Edit saved facts, choose when they expire, or
  delete them.
- **Pick up a conversation.** Revisit saved chats and delete individual threads
  or all your app data.
- **Use it on desktop or phone.** The interface adapts to your screen, with
  dedicated conversation, memory, and history views.

## Try Candid

1. Open the [website](https://candid-dartmouth.vercel.app/) and select
   **Start a conversation**.
2. Confirm that you are 18 or older to begin an anonymous session.
3. Start chatting. When a memory suggestion appears, choose whether to save it.

No email or password is required. Your session belongs to the browser you use;
signing out, clearing cookies, or switching devices means you cannot return to
that anonymous session.

Chat history is saved separately from approved memories. Suggested memories
become saved memories only when you choose **Save**.

## About the prototype

Candid is an early hackathon prototype for adults 18+. It is AI, not a person or
a clinical service, and its replies can be wrong. It is designed to support
connection with the people and places around you.

Text chat is available today. Controls labeled **coming soon**, including voice
and companion-style selection, are previews of planned features.

## Built with

| Layer                      | Technology                       |
| -------------------------- | -------------------------------- |
| Web application            | Next.js, React, TypeScript       |
| Conversation model         | Claude through the Anthropic API |
| Authentication and storage | Supabase                         |
| Hosting                    | Vercel                           |

## Run locally

Use **Node.js 22.13+ within the Node 22 release line** and npm.

```sh
git clone https://github.com/RaegenDyer/Dartmouth-Hackathon.git
cd Dartmouth-Hackathon
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) for the landing page or
[localhost:3000/app](http://localhost:3000/app) for the app.

The landing page runs without service credentials. Working chat requires a
configured development Supabase project and application settings; see
[Contributing](CONTRIBUTING.md) and [.env.example](.env.example). The mock model
option supports development without paid model calls.

To check the project:

```sh
npm run check
npm run build
```

## Documentation

- [Contributing and development setup](CONTRIBUTING.md)
- [Architecture](docs/architecture.md)
- [API reference and planned contracts](docs/api-contracts.md)
- [Product boundaries and guardrails](docs/guardrails.md)
