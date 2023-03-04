import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export const program = yargs(hideBin(process.argv))
    .scriptName('sst')
    .demandCommand(1, 'Please specify a command');

export type Program = typeof program;
