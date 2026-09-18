import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { engines } = require('../package.json');

const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 19;

const [major, minor] = process.versions.node.split('.').map(Number);
const satisfied = major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR);

if (satisfied) {
    process.exit(0);
}

const lines = [
    '',
    `  Node ${process.versions.node} non basta: questo progetto richiede ${engines.node}.`,
    '',
    '  Il build della PWA minifica il service worker con terser, che dipende da',
    '  serialize-javascript: dalla versione 7 quel pacchetto usa il global di Web Crypto,',
    '  che Node 18 non espone. Su Node 18 il build si interrompe con',
    '  "ReferenceError: crypto is not defined", un errore che non dice cosa fare.',
    '',
    '  Se usi fnm, nella cartella del progetto:',
    '',
    '      fnm use 22',
    '',
    '  Se fnm non e nel PATH di questa shell:',
    '',
    '      $env:PATH = "$env:LOCALAPPDATA\\fnm;$env:PATH"',
    '      fnm use 22',
    '',
    '  Per attivarlo una volta per sempre, aggiungi al profilo PowerShell:',
    '',
    '      fnm env --use-on-cd | Out-String | Invoke-Expression',
    '',
    '  Il file .node-version del progetto dichiara 22: con --use-on-cd la versione',
    '  giusta viene selezionata entrando nella cartella.',
    ''
];

console.error(lines.join('\n'));
process.exit(1);
