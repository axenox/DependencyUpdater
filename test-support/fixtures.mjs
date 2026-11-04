/** Create independent trusted registry and untrusted app-inventory fixtures. */
export function fixtures() {
    return {
        registry: {
            schemaVersion: 1,
            apps: [{
                id: 'exface.Core',
                repository: 'ExFace/Core',
                baseBranch: '1.x-dev',
                inventory: 'includes.json',
                vendorPath: 'exface/core',
                enabled: true
            }]
        },
        entry: {
            name: 'npm-asset/mermaid',
            version: '12.2.0',
            license: ['MIT'],
            update: {
                schemaVersion: 1,
                provider: { type: 'npm', package: 'mermaid' },
                policy: 'same-major',
                artifacts: {
                    adapter: 'npm-dist',
                    files: [
                        { source: 'dist/mermaid.min.js', target: 'assets/mermaid.min.js' },
                        { source: 'LICENSE', target: 'assets/LICENSE.txt' }
                    ]
                }
            }
        }
    };
}

/** Published dependency declarations are deliberately not resolved bundle identities. */
export function metadataFixture() {
    const versions = {};
    for (const version of ['0.1.0', '0.9.0', '1.0.0', '12.2.0', '12.3.0', '12.4.0-beta.1', '12.4.0', '13.0.0']) {
        versions[version] = {
            name: 'mermaid',
            version,
            license: 'MIT',
            dependencies: { example: '^1.0.0' },
            dist: {
                tarball: `https://registry.npmjs.org/mermaid/-/mermaid-${version}.tgz`,
                integrity: `sha512-${Buffer.alloc(64).toString('base64')}`
            }
        };
    }
    versions['12.4.0'].deprecated = 'fixture deprecation';
    return { name: 'mermaid', versions, 'dist-tags': { latest: '13.0.0' } };
}
