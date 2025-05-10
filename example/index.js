const http = require('http');
const port = 3001;
const monitor = require('../lib/index');

/*
monitor([
    {
        name: 'dev-backend',
        port: 3500
    },
    {
        name: 'cross-link',
        port: 3502
    }
]);
*/


monitor({
    projectName: 'AVP',
    appNames: ['dev-backend', 'cross-link'],
    monitorPort: 6500
});


const server = http.createServer((req, res) => {
    res.end('OK');
});
server.listen(port);
console.log(`Example server is running on http://127.0.0.1:${port}`);
