# ValueRank DevTool

Web-based GUI for authoring moral dilemma scenarios and running the ValueRank evaluation pipeline.

## Prerequisites

- Node.js 18+
- Python 3.10+ (for deep analysis features)
- An LLM API key (Anthropic or OpenAI) for scenario generation

## Setup

1. Install Node.js dependencies:

```bash
cd devtool
npm install
```

2. (Optional) Install Python dependencies for deep analysis:

```bash
pip install -r scripts/requirements.txt
```

3. Configure API keys by creating a `.env` file in the project root (`valuerank/.env`):

```
ANTHROPIC_API_KEY=your-key-here
# or
OPENAI_API_KEY=your-key-here
```

## Running the App

Start both the client and server:

```bash
npm run dev
```

This launches:
- **Client** (Vite): http://localhost:5173
- **Server** (Express): http://localhost:3030

Open your browser to **http://localhost:5173** to use the app.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client and server in development mode |
| `npm run dev:client` | Start only the Vite client |
| `npm run dev:server` | Start only the Express server |
| `npm run build` | Build for production |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |

## Features

- **Scenario Editor**: Create and edit scenario YAML files
- **Scenario Generator**: Define scenario templates with dimensions, generate combinations via LLM
- **Pipeline Runner**: Execute the ValueRank probe/judge/aggregate pipeline
- **Analysis**: Visualize model decision distributions, variance, and deep statistical analysis

## Project Structure

```
devtool/
├── src/
│   ├── client/          # React frontend (port 5173)
│   │   ├── App.tsx      # Main app with tabs: Editor, Generator, Runner, Analyze
│   │   └── components/  # UI components
│   └── server/          # Express API (port 3030)
│       ├── routes/      # API endpoints
│       └── utils/       # Shared utilities
├── scripts/
│   └── deep_analysis.py # Statistical analysis script
└── package.json
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/scenarios/folders` | List scenario folders |
| `GET /api/scenarios/files/:folder` | List files in a folder |
| `GET /api/config/runtime` | Get runtime configuration |
| `POST /api/generator/generate/:folder/:name` | Generate scenarios from definition |
| `POST /api/runner/start` | Start pipeline execution (SSE) |
| `POST /api/analysis/deep` | Run deep statistical analysis |
