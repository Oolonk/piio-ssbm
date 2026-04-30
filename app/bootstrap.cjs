// CJS bootstrap: registers tsx so that app/main.ts and all its imports
// are transpiled on-demand by tsx/cjs before Electron runs them.
require('tsx/cjs');
require('./main.ts');
