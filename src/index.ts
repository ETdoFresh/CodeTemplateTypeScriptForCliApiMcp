import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import { runCli } from './cli-lib';

const libraries = [
    calculator,
    echoLib
];

runCli(libraries);