var express = require('express'),
	io = require('socket.io');

var pingdom = require("./lib/pingdom.js");
var config = require("./lib/config.js");
var tpl = require('./lib/templates.js');

// Read config from file
var conf = config.parseJsonFromFileSync(__dirname + '/kiosk-server.conf');
if (!conf) {
	console.log("Failed parsing configuration file. Exiting.");
	process.exit(10);
}

// Determine API server config
var api = conf.pingdom.apiserver || {
	"host": "api.pingdom.com",
	"port": "443",
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

//setup http server
var app = module.exports = express.createServer();

//configure express
app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({secret:'asdfasdfasdfdghjfkkj'}));  
    app.use(express.methodOverride());
    app.use(app.router);
	app.set("view options", {layout: false});
});
app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
	app.use(express.static(__dirname + '/public'));
});

// render the initial page
// write templates directly into a <script> tag
app.get('/', function(req, res){
	res.render('index.jade', { templates: tpl.writeTemplates() });
});

//websockets (fuckyeah)
io = io.listen(app);
io.configure(function(){
	//io.set('transports', ['websocket']);
	io.set('log level', 1);
	io.enable('browser client minification');
	io.enable('browser client etag');
});

// Subscribe to the status change event
monitor.addListener('statusChange', function(data) {
	//something changed so updated everything!
	io.sockets.emit('statusChange', data);
	sendMonitorStatusUpdate(io.sockets);
});
function sendMonitorStatusUpdate(sock){
	monitor.monitorStatus(function(status){
		sock.emit('monitorStatus', status);
	});
}

//update client status when a connector goes up or down
monitor.addListener('connectorDown', function(data) {
	sendMonitorStatusUpdate(io.sockets);
});
monitor.addListener('connectorUp', function(data) {
	sendMonitorStatusUpdate(io.sockets);
});



io.sockets.on('connection', function (socket) {
	//send status to new clients
	sendMonitorStatusUpdate(socket);
	
	//return downstates
	socket.on('getDownStates', function(data, fn){
		monitor.getChecks(function(states){
				fn(states)
			}, 'down');
	});

	//return upstates
	socket.on('getUpStates', function(data, fn){
		monitor.getChecks(function(states){
				fn(states)
			}, 'up');
	});
	
	//return all checks
	socket.on('getStates', function(data, fn){
		monitor.getChecks(function(states){
				fn(states)
			}, 'all');
	});
	
	//acknowledge a downcheck
	socket.on('acknowledge', function(data){
		monitor.acknowledge(data, function(check){
			//emit to all clients, will trigger an update
			io.sockets.emit('statusChange', check);
			sendMonitorStatusUpdate(io.sockets);
		});
	});		
});

//start webserver
app.listen(3000);

