<div align="center">

# [Quantum Bunker](https://quantum-bunker.onrender.com/)

**Open-Source End-to-End Encrypted Ephemeral Messaging — Self-Destructing Secure Chat Built for Privacy**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-orange)](#)

</div>

## 📖 Table of Contents

- [Overview](#-overview)
- [Why Quantum Bunker?](#-why-quantum-bunker)
- [Key Features](#-key-features)
- [Security & Privacy](#-security--privacy)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Deployment Strategy](#-deployment-strategy)
- [Architecture](#-architecture)
- [Contributing](#-contributing)
- [License](#-license)

## 🛡️ Overview

**Quantum Bunker** is a **zero-knowledge, end-to-end encrypted (E2EE) ephemeral messaging** application for **privacy-first communication**. Built with **React**, **TypeScript**, and **Node.js**, it delivers **real-time secure chat** over **WebSockets** with **self-destructing messages** that vanish after a configurable TTL.

The server operates as a **blind relay** — it routes encrypted envelopes between peers but **never logs, stores, or decrypts message contents**. Each chat session lives inside an **ephemeral vault** identified by a `sessionId` (Vault Hash). Vaults **auto-expire** or can be **manually destroyed** by the host, wiping all traces from memory.

Perfect for: **secure team chat**, **private group messaging**, **confidential peer-to-peer communication**, **privacy tools**, and any scenario demanding **E2EE ephemeral messaging** with zero server-side footprint.

## ❓ Why Quantum Bunker?

- **No Logs. No Storage. No Traces.** — Messages are relayed, never persisted. Once a vault is destroyed, everything is gone.
- **True End-to-End Encryption** — Powered by **X25519 key exchange**, **Ed25519 signatures**, and **ChaCha20-Poly1305 AEAD** symmetric encryption via the [`@stablelib`](https://github.com/StableLib/stablelib) cryptographic library suite.
- **Anti-Screenshot & Anti-Recording Protection** — Built-in **blur-to-reveal** mechanism and **automatic app-focus blackout** thwart screen capture attempts.
- **Open Source & Auditable** — MIT-licensed. Every line of code is transparent and reviewable.
- **Self-Hostable** — Deploy your own private messaging relay on your infrastructure. No third-party servers needed.

## ✨ Key Features

| Feature | Description |
|---|---|
| **Zero-Knowledge Relay** | Server routes encrypted payloads; plaintext never touches the backend. |
| **Ephemeral Vaults** | Chat rooms (vaults) auto-expire or can be explicitly destroyed by the host. |
| **Self-Destructing Messages** | Messages disappear client-side after a configurable TTL (default 5 minutes). |
| **Anti-Capture Security** | Blur-to-reveal text bubbles + full UI blackout when the browser tab loses focus. |
| **Read Receipts** | Real-time delivery and read-status tracking for every message. |
| **Group Sessions** | Host-controlled participant management — accept/reject join requests, kick peers. |
| **Host Persistence** | Recover your host status on accidental refresh via `localStorage` recovery tokens. |
| **QR Code Invites** | Share vault access via scannable QR codes for quick peer onboarding. |
| **Event-Driven Architecture** | Decoupled, observable system via `EventBus` for extensibility and testing. |
| **Clean Architecture** | Ports & Adapters pattern with centralized dependency injection for maintainability. |

## 🔒 Security & Privacy

Quantum Bunker is designed with a **privacy-first, security-by-default** philosophy:

- **E2EE Encryption Suite**: X25519 (key agreement) + Ed25519 (signing) + ChaCha20-Poly1305 (authenticated symmetric encryption) + HKDF (key derivation) + SHA-256 (hashing).
- **Zero-Knowledge Backend**: The server sees only encrypted envelopes — it cannot read message contents.
- **Anti-Capture Guard**: Message text is blurred by default. Users hover or click to reveal. Alt+Tab or window blur instantly blackouts the entire app UI.
- **No Persistence**: Messages live only in browser memory. No database storage. No logging of decrypted content.
- **Host-Controlled Access**: Vault hosts approve or reject every joining peer. No unauthorized access.
- **Automatic Cleanup**: Idle vaults expire and are purged from server memory automatically.

> 📘 See [`docs/security.md`](docs/security.md) for the full security model and threat considerations.

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.x, Vite 6, Tailwind CSS 4, Motion (Framer Motion), Lucide React |
| **Backend** | Node.js, Express 4, WebSocket (`ws`), TSX (runtime TypeScript) |
| **Cryptography** | `@stablelib/x25519`, `@stablelib/ed25519`, `@stablelib/chacha20poly1305`, `@stablelib/hkdf`, `@stablelib/sha256`, `@stablelib/random` |
| **Validation** | Zod 4 |
| **Testing** | Vitest, Supertest, JSDOM, Vitest Coverage (V8) |
| **Logging** | Winston |
| **Security Headers** | Helmet |
| **QR Codes** | `qrcode` |

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** (ships with Node.js)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/quantum-bunker/Quantum_bunker.git
cd Quantum_bunker

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open your browser to the localhost URL shown in the terminal
```

> 🧪 **Try it live:** [🚀 Open Dev Server](https://quantum-bunker.onrender.com/) — click for instant testing without local setup.

### Available Scripts

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server (Express + Vite HMR) |
| `npm run build` | Production build via Vite |
| `npm run preview` | Preview production build locally |
| `npm run lint` | TypeScript type-checking |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Run tests with Vitest UI |

## 🚢 Deployment Strategy

We follow a **trunk-based development** workflow with protected branches:

| Branch | Purpose |
|---|---|
| `main` | Production-ready, deployable code |
| `staging` | Pre-production validation & smoke testing |
| `develop` | Active daily development integration |

**Flow**: `feature/*` → `develop` → `staging` → `main`

Deployments are managed via **GitHub Environments** and **branch protection rulesets**. See [`docs/workflow.md`](docs/workflow.md) for the full CI/CD pipeline details.

## 🏗️ Architecture

Quantum Bunker follows **Clean Architecture (Ports & Adapters)** with centralized **Dependency Injection**:

- **Contracts** — Shared TypeScript schemas and types in `src/shared/contracts`
- **Use Cases** — Core business logic in `src/backend/application/use-cases`
- **Ports** — Interface definitions in `src/backend/application/ports`
- **Adapters** — Concrete implementations in `src/backend/adapters`
- **Entrypoints** — HTTP, WebSocket, and CLI entrypoints in `src/backend/entrypoints`
- **Event Bus** — Cross-cutting pub/sub via `EventEmitterBus`

> 📘 See [`docs/architecture.md`](docs/architecture.md) for the full architecture breakdown.

## 📐 Design & Diagrams

Visual references render as images on GitHub (Mermaid):

- [`docs/design-document.md`](docs/design-document.md) — full design document (goals, invariants, security, rationale)
- [`docs/diagrams/workflows.md`](docs/diagrams/workflows.md) — workflow diagrams for every runtime case
- [`docs/diagrams/architecture.md`](docs/diagrams/architecture.md) — structural & deployment diagrams

## 🤝 Contributing

Contributions are welcome! Whether it's a bug fix, feature enhancement, documentation improvement, or security audit — we appreciate your help.

Before submitting a Pull Request, please read:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Contribution guidelines
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Community standards
- [`docs/test-strategy.md`](docs/test-strategy.md) — Testing expectations

## 📄 License

This project is open source and available under the **MIT License**. See [`LICENSE`](LICENSE) for full terms.

---

<div align="center">

**Quantum Bunker** — *Secure Ephemeral Messaging. Zero Knowledge. Zero Traces.*

</div>