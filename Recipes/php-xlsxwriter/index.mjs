/**
 * Adapt PHP_XLSXWriter to Core's namespace and four-argument column-options API.
 * Preserve reviewed local extensions through checked source transformations, never fuzzy patches.
 * The legacy 0.37 copy has an explicit fingerprint; later copies must match recipe output.
 */
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { member } from '../../src/archive.mjs';
import { originalTerms, sha256 } from '../../src/distribution.mjs';

const sourceFile = 'xlsxwriter.class.php';
const legacyHash = '3bda8bceedfa9d8e35340786b0e0c1ae392e0cb613db0d2c9e41798df33da15d';
const sourceHashes = {
    '0.37': '29bc8ce1a06a0a960a9e96dd636748d119fd6bd6ad547f008ed6995a514e5b07',
    '0.39': 'af50a690d25f45673d6e702714e830efa46ff6ed17543a4621af04f8ed02ce45'
};

/** Require one unambiguous transformation anchor, never silently accept upstream structure changes. */
function replaceOnce(source, before, after, label) {
    if (source.split(before).length !== 2) throw new Error(`PHP_XLSXWriter patch anchor changed: ${label}`);
    return source.replace(before, () => after);
}

/** Preserve the integrated API on reviewed upstream sources; new releases require recipe review first. */
export function adaptSource(bytes, version) {
    if (!sourceHashes[version] || sha256(bytes) !== sourceHashes[version]) {
        throw new Error(`Unreviewed PHP_XLSXWriter source/version: ${version}; review Core adaptations before updating.`);
    }
    let source = bytes.toString('utf8');
    source = replaceOnce(source, '<?php\n', '<?php\nnamespace exface\\Core\\CommonLogic\\Utils;\n', 'namespace');
    source = replaceOnce(source, ' * @license MIT License\n',
        ' * @license MIT License\n * @link https://github.com/mk-j/PHP_XLSXWriter\n', 'upstream attribution');
    source = replaceOnce(source, 'new ZipArchive()', 'new \\ZipArchive()', 'ZipArchive construction');
    source = replaceOnce(source, 'ZipArchive::CREATE', '\\ZipArchive::CREATE', 'ZipArchive constant');
    source = replaceOnce(source, 'protected function initializeSheet($sheet_name, $col_widths=array(),',
        'protected function initializeSheet($sheet_name, $col_options=array(),', 'column options parameter');
    const columnStart = '\t\tif (!empty($col_widths)) {';
    const columnEnd = '\n\t\t$sheet->file_writer->write(  \'<col collapsed="false" hidden="false" max="1024"';
    const start = source.indexOf(columnStart);
    const end = source.indexOf(columnEnd);
    if (start < 0 || end <= start) throw new Error('PHP_XLSXWriter column block changed.');
    const columns = [
        '\t\tif (!empty($col_options)) {',
        '\t\t\tforeach ($col_options as $opt) {',
        "\t\t\t\tif (!is_array($opt)) $opt = array('width' => $opt);",
        '\t\t\t\t$width = isset($opt[\'width\'])',
        '\t\t\t\t\t? \'customWidth="true" width="\'.floatval($opt[\'width\']).\'"\'',
        '\t\t\t\t\t: \'customWidth="false" width="11.5"\';',
        '\t\t\t\t$hidden = ($opt[\'hidden\'] ?? false) === true ? \'true\' : \'false\';',
        '\t\t\t\t$collapsed = ($opt[\'collapsed\'] ?? false) === true ? \'true\' : \'false\';',
        '\t\t\t\t$sheet->file_writer->write(\'<col collapsed="\'.$collapsed.\'" hidden="\'.$hidden.\'" max="\'.($i+1).\'" min="\'.($i+1).\'" style="0" \'.$width.\'/>\');',
        '\t\t\t\t$i++;',
        '\t\t\t}',
        '\t\t}'
    ].join('\n');
    source = source.slice(0, start) + columns + source.slice(end);
    source = replaceOnce(source,
        'public function writeSheetHeader($sheet_name, array $header_types, $col_options = null)',
        'public function writeSheetHeader($sheet_name, array $header_types, $options = null, array $columns = [])',
        'four-argument header API');
    const headerStart = source.indexOf('\tpublic function writeSheetHeader(');
    const headerEnd = source.indexOf('\n\tpublic function ', headerStart + 1);
    if (headerStart < 0 || headerEnd < 0) throw new Error('PHP_XLSXWriter header method boundary changed.');
    let header = source.slice(headerStart, headerEnd).replaceAll('$col_options', '$options');
    header = replaceOnce(header,
        "\t\t$col_widths = isset($options['widths']) ? (array)$options['widths'] : array();",
        [
            "\t\tif (isset($options['widths'])) {",
            "\t\t\tforeach ((array)$options['widths'] as $nr => $width) {",
            "\t\t\t\t$columns[$nr]['width'] = $width;",
            '\t\t\t}',
            '\t\t}'
        ].join('\n'), 'legacy widths compatibility');
    header = replaceOnce(header, 'self::initializeSheet($sheet_name, $col_widths,',
        'self::initializeSheet($sheet_name, $columns,', 'column options forwarding');
    source = source.slice(0, headerStart) + header + source.slice(headerEnd);
    if (version === '0.37') {
        source = replaceOnce(source, '$value{0}', '$value[0]', 'PHP 8 string offset');
        source = replaceOnce(source, 'htmlspecialchars($val, ENT_QUOTES | ENT_XML1)',
            "htmlspecialchars($val ?? '', ENT_QUOTES | ENT_XML1)", 'null XML values');
    }
    return Buffer.from(source);
}

/** Lint source through stdin with no php.ini, auto-prepend files, scripts or inherited secrets. */
export function lintSource(bytes) {
    const result = spawnSync('php', ['-n', '-l'], {
        input: bytes, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: {
            PATH: process.env.PATH,
            ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {})
        }
    });
    if (result.error || result.status !== 0) {
        throw new Error(`PHP_XLSXWriter syntax lint failed: ${
            result.error?.message ?? [result.stderr, result.stdout].filter(Boolean).join('\n')}`);
    }
}

/** Obtain commit-verified originals, preserve terms, and return the adapted runtime without executing it. */
export async function prepare(entry, version, { readPackage }) {
    if (!entry.update.artifacts.evidence) throw new Error('PHP_XLSXWriter requires explicit evidence outputs.');
    const mappings = new Map(entry.update.artifacts.files.map(file => [file.source, file.target]));
    if (mappings.size !== 2 || !mappings.has(sourceFile) || !mappings.has('LICENSE')) {
        throw new Error('PHP_XLSXWriter requires exactly its source and original LICENSE mappings.');
    }
    const original = await readPackage('mk-j/php_xlsxwriter', version);
    if (original.manifest.name !== 'mk-j/php_xlsxwriter'
        || original.release.version !== version
        || original.release.source?.url !== 'https://github.com/mk-j/PHP_XLSXWriter.git'
        || !original.evidence || original.evidence.commit !== original.release.source.reference) {
        throw new Error('PHP_XLSXWriter source identity mismatch.');
    }
    const runtime = adaptSource(member(original.files, sourceFile), version);
    lintSource(runtime);
    return {
        name: original.manifest.name, version, license: original.release.license,
        licenses: [{ name: original.release.license, file: mappings.get('LICENSE') }],
        outputs: [
            { path: mappings.get(sourceFile), bytes: runtime },
            { path: mappings.get('LICENSE'), bytes: member(original.files, 'LICENSE') }
        ],
        embedded: [], embeddedDescription: 'no embedded third-party packages in the reviewed source file',
        terms: originalTerms(original.files),
        evidence: {
            ...original.evidence, adaptation: 'core-column-options-v1',
            upstreamSourceSha256: sha256(member(original.files, sourceFile)),
            adaptedSourceSha256: sha256(runtime)
        },
        checks: { sourceCommitAndBlobs: 'passed', reviewedCoreAdaptations: 'passed', phpSyntax: 'passed' }
    };
}

/** Accept only the reviewed legacy copy or the exact previously generated runtime and original terms. */
export async function validateInstalled(entry, previous, { vendorPath, readInstalled }) {
    const mappings = new Map(entry.update.artifacts.files.map(file => [file.source, file.target]));
    const expectedLicenses = previous.licenses.map(license => ({ ...license, file: `${vendorPath}/${license.file}` }));
    const bootstrap = entry.version === '0.37' && entry.licenses === undefined;
    if (bootstrap ? !isDeepStrictEqual(entry.license, [previous.license])
        : !isDeepStrictEqual(entry.licenses, expectedLicenses)) {
        throw new Error('Installed PHP_XLSXWriter license declaration/ownership mismatch.');
    }
    for (const output of previous.outputs) {
        let installed;
        try {
            installed = await readInstalled(output.path);
        } catch (error) {
            if (bootstrap && output.path !== mappings.get(sourceFile) && error.code === 'ENOENT') continue;
            throw error;
        }
        const expected = output.path === mappings.get(sourceFile) && entry.version === '0.37'
            ? legacyHash : sha256(output.bytes);
        // Git checkouts may use CRLF, but no other change to the reviewed PHP copy is accepted.
        const actual = output.path === mappings.get(sourceFile)
            ? sha256(Buffer.from(installed.toString('utf8').replaceAll('\r\n', '\n'))) : sha256(installed);
        if (actual !== expected) {
            throw new Error(`Locally modified or mismatched PHP_XLSXWriter file; refusing replacement: ${output.path}`);
        }
    }
}

export default Object.freeze({ prepare, validateInstalled });
