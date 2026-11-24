/** Reviewed upstream/Core source snapshots support offline provider, adaptation and candidate tests. */
import { readFile } from 'node:fs/promises';
import { expandMetadata, releaseInfo } from '../src/packagist.mjs';

export const commits = {
    '0.37': 'c4ba6023fcd49578062e35ed6af3e205dd50a903',
    '0.39': '67541cff96eab25563aa7fcecba33e03368fa464'
};

/** Match real Packagist's minified public stable release format, not npm aliases or fabricated versions. */
export function documentFixture() {
    return {
        minified: 'composer/2.0',
        packages: {
            'mk-j/php_xlsxwriter': [{
                name: 'mk-j/php_xlsxwriter', version: '0.39', version_normalized: '0.39.0.0', license: ['MIT'],
                source: { type: 'git', url: 'https://github.com/mk-j/PHP_XLSXWriter.git', reference: commits['0.39'] },
                require: { php: '>=5.2.1', 'ext-zip': '*' }
            }, {
                version: '0.37', version_normalized: '0.37.0.0',
                source: { type: 'git', url: 'https://github.com/mk-j/PHP_XLSXWriter.git', reference: commits['0.37'] }
            }]
        }
    };
}

/** Keep the initial Core version/runtime unchanged; auxiliary outputs do not exist before first update. */
export function entryFixture() {
    return {
        name: 'mk-j/php_xlsxwriter', version: '0.37', license: ['MIT'],
        license_link: ['https://github.com/mk-j/PHP_XLSXWriter/blob/master/LICENSE'],
        update: {
            schemaVersion: 1, provider: { type: 'packagist', package: 'mk-j/php_xlsxwriter' },
            policy: 'same-major',
            artifacts: {
                adapter: 'php-source',
                files: [
                    { source: 'xlsxwriter.class.php', target: 'assets/XLSXWriter.php' },
                    { source: 'LICENSE', target: 'assets/LICENSE.txt' }
                ],
                evidence: { packages: 'assets/packages.json', notices: 'assets/NOTICES.txt' }
            }
        }
    };
}

/** Original files are immutable reviewed fixtures, with upstream MIT terms retained separately. */
export async function readPackage(name, version) {
    const metadata = expandMetadata(documentFixture(), name);
    const release = releaseInfo(metadata, name, version);
    const manifest = { name, license: 'MIT', require: release.dependencies };
    const files = new Map([
        ['xlsxwriter.class.php', await readFile(new URL(`./php-xlsxwriter-${version}.php.txt`, import.meta.url))],
        ['LICENSE', await readFile(new URL('./php-xlsxwriter.LICENSE.txt', import.meta.url))],
        ['composer.json', Buffer.from(JSON.stringify(manifest))]
    ]);
    return { release, manifest, files, evidence: { commit: release.source.reference, tree: 'b'.repeat(40), files: [] } };
}

/** Read the separately reviewed Core customization, not newly generated adaptation output. */
export function legacySource() {
    return readFile(new URL('./php-xlsxwriter-core-0.37.php.txt', import.meta.url));
}
