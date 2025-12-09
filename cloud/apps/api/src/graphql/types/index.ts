// Import all GraphQL type definitions to register them with builder
// Types are registered as a side effect of importing

import './scalars.js';
import './enums.js';

// Object references - must be imported first to avoid circular deps
import './refs.js';

// Entity types - order no longer matters since refs are defined centrally
import './definition.js';
import './run.js';
import './scenario.js';
import './transcript.js';
import './experiment.js';
import './tag.js';

// Queue-related types
import './queue-status.js';
import './run-progress.js';

// Model types
import './available-model.js';

// LLM Provider types
import './llm-provider.js';
import './llm-model.js';
import './system-setting.js';

// Health types
import './health.js';

// Analysis types
import './analysis.js';

// Input types
import './inputs/start-run.js';
import './inputs/llm.js';
