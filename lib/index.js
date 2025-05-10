const { spawn } = require('child_process');
const ps = require('ps-node');
const pm2 = require('pm2');
const path = require('path');

/**
 * Initialize monitor module
 *
 * @param {Object} options - Options
 * @param {String} options.projectName - Server Name
 * @param {Array} options.appNames - App Names
 * @param {Array} options.monitorPort - WebSocket Port Number
 * @example 
 * monitor({
 *   projectName: 'server001',
 *   appNames: ['app1', 'app2'],
 *   monitorPorts: 6500,
 * });
 */
function index ({ projectName, appNames = [], monitorPort = 6500 }) {
    console.log('projectName', projectName);
    console.log('appNames', appNames);
    console.log('monitorPort', monitorPort);

    if (!appNames.length) {
        console.error('pm2-server-monitor requires apps list!');
        process.exit();
    }
    if (!projectName) {
        console.error('pm2-server-monitor requires projectName!');
        process.exit();
    }

    // 首先查找 god 进程是否存在，若不存在才继续创建
    ps.lookup({
        command: 'node',
        arguments: [
            '--monitorport', monitorPort,
            '--monitprojectname', projectName,
            '--monitappnames', appNames.join(',')
        ],
    }, (err, resultList) => {
        if (err) {
            return console.error(err);
        }

        if (resultList && Array.isArray(resultList) && resultList.length > 0) {
            // 说明存在 god 进程
            // console.log(`God process (pid ${resultList[0].pid}) already exists, continue to be used.`);
            console.log(`God process (pid ${resultList[0].pid}) already exists, kill it.`);
            ps.kill(resultList[0].pid);
        }

        // const currentPid = process.pid;
        pm2.list((err, data) => {
            if (err) {
                return console.error(err);
            }
            if (data && Array.isArray(data) && data.length > 0) {
                // console.log('pm2 process length', data.length);
                const processes = data.filter(process => appNames.includes(process.name) || appNames.includes('all'));
                if (processes.length) {
                    return spawnGod();
                }

                
            }
        });
    });

    function spawnGod() {
        const godScript = path.join(__dirname, './god.js');

        // --monitport 其实是一个特殊标识，方便查找该进程
        const god = spawn('node', [
            godScript,
            '--monitport', monitorPort,
            '--monitprojectname', projectName,
            '--monitappnames', appNames.join(',')
        ], {
            slient: true,
            detached: true,
            // stdio: 'ignore'
        });
        console.log(`God process was successfully created! pid ${god.pid}.`, projectName);
        god.unref();
        // god.stdout.on('data', data => console.log(data.toString().slice(0, 50)));
        // god.stdout.on('data', data => console.log(data.toString()));
        god.stderr.on('data', data => console.log(data.toString()));
    }
};
module.exports = index;
