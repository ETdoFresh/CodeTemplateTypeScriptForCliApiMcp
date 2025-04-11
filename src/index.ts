#!/usr/bin/env node

import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import { runCli } from './cli-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';
import { runRepl } from './repl-lib';

const libraries: Record<string, (...args: string[]) => any>[] = [
    calculator,
    echoLib
];

// runCli(libraries);
// runApi(libraries);
// runMcp(libraries);
runRepl(libraries);