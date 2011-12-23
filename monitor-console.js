var console = require("console");
var pingdom = require("./lib/pingdom.js");
var config = require("./lib/config.js");

// Read config from file
var conf = config.parseJsonFromFileSync(__dirname + '/kiosk-server.conf');
if (!conf) {
	console.log("Failed parsing configuration file. Exiting.");
	process.exit(10);
}

// Determine API server config
var api = conf.pingdom.apiserver || {
	"host": "127.0.0.1",
	"port": "9000",
	"protocol": "http",
	"pollfreq": ""
};

// Create pingdom API connectors
var connectors = [];
for (var i = 0, l = conf.pingdom.accounts.length; i < l; i++) {
	conf.pingdom.accounts[i]["host"] = api.host;
	conf.pingdom.accounts[i]["port"] = api.port;
	conf.pingdom.accounts[i]["protocol"] = api.protocol;
	conf.pingdom.accounts[i]["pollfreq"] = api.pollfreq;
	connectors.push(pingdom.createConnector(conf.pingdom.accounts[i]));
}

// Create pingdom middleware monitor
var monitor = pingdom.createMonitor(connectors);

// Subscribe to the status change event
monitor.addListener('statusChange', function(data) {
	console.log("OMG! Something happened!");
	console.log(data);
});
