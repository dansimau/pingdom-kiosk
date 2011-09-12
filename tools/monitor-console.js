var pingdom = require("../lib/pingdom.js");
var console = require("console");

// Create pingdom connector
var testConnector = pingdom.createConnector({
		"username": "",
		"password": "",
		"app_key": ""
});

// Create pingdom monitor
var monitor = pingdom.createMonitor([testConnector], function(data) {
	// Event
	console.log(data);
});
