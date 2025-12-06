// Import all GraphQL type definitions to register them with builder
// Types are registered as a side effect of importing

import './scalars.js';
import './enums.js';

// Entity types - must import in dependency order
// Run and Scenario are imported first since Definition references them
import './run.js';
import './scenario.js';
import './definition.js';

// Types to be added in later phases
// import './transcript.js';
// import './experiment.js';
