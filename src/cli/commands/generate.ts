/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */
import { Program } from '../program';
import { join } from 'path';

const dynamicImport = new Function('specifier', 'return import(specifier)');

export const generate = (program: Program): Program =>
    program.command(
        ['generate'],
        'Generates typescript code based on resource schema',
        (yargs) =>
            yargs
                .option('schema', {
                    type: 'string',
                    description: 'The path to the resource schema.',
                })
                .options('src', {
                    type: 'string',
                    description: 'The source directory for the resource.',
                })
                .option('out', {
                    type: 'string',
                    description:
                        'The output directory for generated code within the source directory.',
                    default: '__generated',
                }),
        async (argv) => {
            const { schema, src, out } = argv;
            const {
                makeConverter,
                getJsonSchemaReader,
                getSureTypeWriter,
            } = (await dynamicImport('typeconv')) as typeof import('typeconv');

            const { readFile, exists, mkdirp, writeFile } = await import('fs-extra');
            const { default: dedent } = await import('ts-dedent');

            if (!(await exists(schema))) {
                console.error(`Schema file ${schema} does not exist.`);
                throw new Error(`Schema file ${schema} does not exist.`);
            }

            const outputDirectory = join(src, out);
            try {
                await mkdirp(outputDirectory);
            } catch (e) {
                console.error(`Could not create output directory ${outputDirectory}`);
                throw e;
            }

            const schemaContents = await readFile(schema, 'utf8');
            const schemaJson = JSON.parse(schemaContents);

            const { definitions, ...resource } = schemaJson;
            resource.type = 'object';
            definitions['ResourceProperties'] = resource;

            const reader = getJsonSchemaReader();
            const writer = getSureTypeWriter({
                useUnknown: true,
                unsupported: 'warn',
                missingReference: 'error',
                userPackage: 'cloudformation-cli-typescript-plugin',
                userPackageUrl:
                    'https://github.com/aws-cloudformation/cloudformation-cli-typescript-plugin',
                exportValidator: false,
                exportEnsurer: false,
                exportTypeGuard: false,
            });
            const { convert } = makeConverter(reader, writer);
            const { data } = await convert({ data: { definitions } as any });

            await writeFile(join(outputDirectory, 'resource.ts'), data, 'utf8');

            const model = dedent`
              /* tslint:disable */
              /* eslint-disable */
              import { compile } from 'suretype';
              import { default as camelcaseKeys } from 'camelcase-keys';
              import { schemaResourceProperties, ResourceProperties as RawResource } from './resource';
              
              export const ResourceOptions = {
                TYPE_NAME: "Example::Monitoring::Alarm" as const,
                /**
                 * Validates the incoming properties against the resource schema
                 */
                validateProperties(properties: unknown) {
                  const ensure = compile<typeof schemaResourceProperties, RawResource>(
                    schemaResourceProperties,
                    {
                      ensure: true,
                      ajvOptions: {
                        /** Coerces CloudFormation stringly-typed properties to their correct types */
                        coerceTypes: true,
                      },
                    }
                  );
                  return ensure(properties);
                },
                /**
                 * Casts the incoming properties to the correct to Javascript-y casing.
                 * This is optional, and can be deleted.
                 */
                castProperties(properties: RawResource) {
                  return camelcaseKeys(properties, { deep: true });
                },
                /**
                 * Casts the outgoing properties from Javascript-y casing to pascal.
                 * This is optional, and can be deleted.
                 */
                uncastProperties(properties: unknown) {
                  return camelcaseKeys(properties, { deep: true, pascalCase: true });
                }
              };
              
              export type Resource =
                typeof ResourceOptions extends { castProperties: (properties: RawResource) => infer R } 
                  ? R
                  : RawResource;
            `;

            await writeFile(join(outputDirectory, 'index.ts'), model);
        }
    );
