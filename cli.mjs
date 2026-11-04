import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readJson } from './src/paths.mjs';
import { selectApps } from './src/config.mjs';
import { planUpdates } from './src/planner.mjs';

try {
    const { values, positionals } = parseArgs({
        options: {
            app: { type: 'string' },
            root: { type: 'string' },
            package: { type: 'string' }
        },
        allowPositionals: true
    });
    const registry = await readJson(fileURLToPath(new URL('./Config/apps.json', import.meta.url)));
    let result;
    if (positionals.length === 1 && positionals[0] === 'apps'
        && values.root === undefined && values.package === undefined) {
        result = selectApps(registry, values.app);
    } else if (positionals.length === 1 && positionals[0] === 'plan' && values.app && values.root) {
        result = await planUpdates({
            registry,
            appId: values.app,
            root: values.root,
            packageName: values.package
        });
    } else {
        throw new Error('Usage: node cli.mjs apps [--app ID] | plan --app ID --root CHECKOUT [--package INVENTORY_NAME]');
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
    process.stderr.write(`DependencyUpdater: ${error.message}\n`);
    process.exitCode = 1;
}
