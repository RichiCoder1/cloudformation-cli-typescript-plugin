#!/usr/bin/env node
import { program } from './program.js';
import { generate } from './commands/generate.js';

const nodeVersion = process.versions.node;
if (Number(nodeVersion.split('.')[0]) < 14) {
    throw new Error(
        `Node.js version ${nodeVersion} is not supported by the cloudformation-cli-typescript-plugin. Please upgrade to Node.js 14 or later.`
    );
}

generate(program);

program.parse();
