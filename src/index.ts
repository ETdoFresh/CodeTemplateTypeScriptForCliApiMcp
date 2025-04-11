import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import { runApi } from './api-lib';

const libraries: Record<string, (...args: string[]) => any>[] = [
    calculator,
    echoLib
];

runApi(libraries);