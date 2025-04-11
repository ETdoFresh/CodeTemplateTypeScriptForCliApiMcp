#!/usr/bin/env node

import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import { runArgs } from './args-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';

const libraries: Record<string, (...args: string[]) => any>[] = [
    calculator,
    echoLib
];

runArgs(libraries);
// runApi(libraries);
// runMcp(libraries);