/**
 * 每个服务（如node_pro, ssr）都会有独立的一个god进程，用来做监控
 * 由传递进来的参数：pmExecPath，和pm2 api返回的数据做匹配，来判断究竟是哪个服务
 */

const socketIo = require('socket.io');
const pm2 = require('pm2');
const os = require('os');
const ps = require('ps-node');
const http = require('http');
const osUtil = require('os-utils');
const hostname = os.hostname();
const cpus = os.cpus().length;
const totalmemNum = os.totalmem();
const totalmem = memoryString(os.totalmem());
const nodev = process.version;
const godid = process.pid;

/**
 * CPU阈值（系统）
 */
const cpuThreshold = 90;

function memoryString(byteLen) {
    // 得到MB
    let mem = byteLen / 1024 / 1024;
    if (mem.toFixed() >= 1000) {
        // 转为GB
        mem = (mem / 1024)
            .toFixed(2);
        return `${mem}GB`;
    }
    mem = mem.toFixed(2);
    return `${mem}MB`;
}

function timeString(time, style = 1) {
    const date = new Date(time);
    const month = (date.getMonth() + 1)
        .toString()
        .length > 1 ? (date.getMonth() + 1) : `0${date.getMonth() + 1}`;
    const day = date.getDate()
        .toString()
        .length > 1 ? date.getDate() : `0${date.getDate()}`;
    const hour = date.getHours()
        .toString()
        .length > 1 ? date.getHours() : `0${date.getHours()}`;
    const minute = date.getMinutes()
        .toString()
        .length > 1 ? date.getMinutes() : `0${date.getMinutes()}`;
    const second = date.getSeconds()
        .toString()
        .length > 1 ? date.getSeconds() : `0${date.getSeconds()}`;
    let milliseconds = date.getMilliseconds().toString();
    if (milliseconds.length === 2) {
        milliseconds = `0${milliseconds}`;
    } else if (milliseconds.length === 1) {
        milliseconds = `00${milliseconds}`;
    }

    if (style === 1) {
        return `${month}/${day} ${hour}:${minute}:${second}`;
    }

    if (style === 2) {
        return `${month}-${day} ${hour}:${minute}:${second}.${milliseconds}`;
    }
}

function totalUptimeString(time) {
    const diff = Date.now() - time;
    const seconds = Math.round(diff / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.round(diff / 1000 / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(diff / 1000 / 60 / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.round(diff / 1000 / 60 / 60 / 24);
    return `${days}d`;
}

function pm2List() {
    return new Promise(resolve => {
        pm2.list((err, data) => {
            if (err) {
                return resolve([]);
            }
            resolve(data);
        });
    });
}

function getCpuUsage() {
    return new Promise(resolve => {
        osUtil.cpuUsage(val => {
            resolve(Math.round(val * 100));
        });
    });
}

try {
    // 将端口加一些值，作为http和ws的端口号
    const port = parseInt(process.argv[3]);    
    const projectName = process.argv[5];
    const appNames = process.argv[7].split(',');

    const httpServer = http.createServer((req, res) => {
        if (req.url.startsWith('/killMonitor')) {
            ps.kill(process.pid);
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Monitor process pid: ${godid}`);
    });
    httpServer.listen(port, () => {
        console.log(`listening on port ${port}`);
    });
    const io = socketIo(httpServer);

    // 接收到新的连接
    io.on('connection', socket => {
        console.log('websocket server connect!', socket.handshake.query.interval);
        const timer = setInterval(() => {
            Promise.all([
                pm2List(),
                getCpuUsage()
            ]).then(val => {
                const processes = val[0];
                const cpuUsage = val[1];

                const totalData = {
                    hostname,
                    cpus,
                    cpuUsage: `${cpuUsage}%`,
                    cpuUsageCls: cpuUsage >= cpuThreshold ? 'red' : '',
                    totalmem,
                    freemem: memoryString(os.freemem()),
                    memUsage: `${Math.round((totalmemNum - os.freemem()) / totalmemNum * 100)}%`,
                    node_version: nodev,
                    godid,
                    memory: 0,
                    cpu: 0,
                    restart: 0,
                };

                if (processes && processes.length > 0) {
                    const processData = [];
                    let totalUptime;
                    let instances = 0;
                    processes.forEach(app => {
                        // pm2启动脚本一致，说明是集群模式启动的同一系列进程
                        if (appNames.includes(app.name) || appNames.includes('all')) {
                            const memory = app.monit ? Number(app.monit.memory) : 0;
                            totalData.memory += memory;
                            instances++;
                            const cpu = app.monit ? Math.min(parseInt(app.monit.cpu), 100) : 0;
                            totalData.cpu += cpu;
                            totalData.name = projectName;
                            totalData.pm_version = `v${app.pm2_env._pm2_version || 0}`;
                            totalData.restart += app.pm2_env.restart_time;

                            // 启动模式
                            let mode = app.pm2_env.exec_mode;
                            if (mode.indexOf('_mode') > 0) {
                                mode = mode.substring(0, mode.indexOf('_mode'));
                            }

                            let processUptime = '-';
                            if (app.pm2_env.status === 'online') {
                                // processUptime = timeString(app.pm2_env.pm_uptime);
                                processUptime = app.pm2_env.pm_uptime ? totalUptimeString(app.pm2_env.pm_uptime) : '0'

                                // 取最小的uptime
                                if (!totalUptime) {
                                    totalUptime = app.pm2_env.pm_uptime;
                                } else if (totalUptime > app.pm2_env.pm_uptime) {
                                    totalUptime = app.pm2_env.pm_uptime;
                                }
                            }
                            processData.push({
                                name: app.name,
                                mode,
                                pmid: app.pm_id,
                                pid: app.pid,
                                memory: memoryString(memory),
                                cpu: `${cpu}%`,
                                cpuCls: cpu >= cpuThreshold ? 'red' : '',
                                uptime: processUptime,
                                restart: app.pm2_env.restart_time,
                                status: app.pm2_env.status,
                                user: app.pm2_env.username
                            });
                        }
                    });
                    // instances were meant to be like Same App but with multiple instances on pm2
                    // Since AVP does not have instances, but specific replica with different name, let's not use instances on calculation for average
                    totalData.instances = `x${instances}`;
                    totalData.totalUptime = totalUptime ? totalUptimeString(totalUptime) : '0';
                    // totalData.cpu = `${Math.round(totalData.cpu / instances)}%`;
                    // totalData.cpuCls = Math.round(totalData.cpu / instances) >= cpuThreshold ? 'red' : '';
                    // totalData.memory = memoryString(totalData.memory / instances);
                    totalData.cpu = `${Math.round(totalData.cpu)}%`;
                    totalData.cpuCls = Math.round(totalData.cpu) >= cpuThreshold ? 'red' : '';
                    totalData.memory = memoryString(totalData.memory);
                    socket.emit('stats', { totalData, processData });
                } else {
                    socket.emit('stats', { totalData });
                }
            });
        }, socket.handshake.query.interval || 1000);

        // 断开后，清除计时器
        socket.on('disconnect', () => {
            console.log('disconnect!');
            clearInterval(timer);
        });
    });
} catch (e) {
    // if any error, kill the process
    ps.kill(process.id);
    process.exit(0);
}
