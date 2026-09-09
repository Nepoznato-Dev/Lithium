const fs = require('fs');
const files = ['browser.wasm', 'models.wasm', 'notify.wasm', 'settings.wasm', 'agent.wasm', 'filesystem.wasm'];
for (const f of files) {
    const path = process.argv[2] + '/' + f;
    const bytes = fs.readFileSync(path);
    WebAssembly.instantiate(bytes).then(result => {
        const exports = Object.keys(result.instance.exports);
        console.log(f + ': ' + exports.length + ' exports -> ' + exports.join(', '));
    }).catch(e => console.log(f + ': ERROR ' + e.message));
}
