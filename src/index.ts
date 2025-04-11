#!/usr/bin/env node

import * as calculator from './calculator-lib/index.js';
import * as echoLib from './echo-lib/index.js';
import { runCli } from './cli-lib/index.js';
import { runApi } from './api-lib/index.js';
import { runMcp } from './mcp-lib/index.js';

const libraries: Record<string, (...args: string[]) => any>[] = [
    calculator,
    echoLib
];

// runCli(libraries);
// runApi(libraries);
runMcp(libraries);