import * as calculator from './calculator-lib';
import { runCli } from './cli-lib';

const libraries = [
    calculator
];

// Call the imported runCli function with the libraries
runCli(libraries); 