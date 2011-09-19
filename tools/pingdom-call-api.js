/**
 * Calls the Pingdom API with the specified action and outputs the returned
 * data.
 *
 * Usage: node ./pingdom-call-api.js <call>
 *
 */

var pingdom = require("./lib/pingdom.js");
var config = require("../lib/config.js");
var console = require("console");

// Show usage
if (typeof(process.argv[2]) == 'undefined') {
	console.log("Usage: " + process.argv[0] + " " + process.argv[1] + " <request>");
	console.log("  Eg.: " + process.argv[0] + " " + process.argv[1] + " checks/1234");
	process.exit(99);
}

// Read config from file
config.parseJsonFromFile(__dirname + '../kiosk-server.conf', function(conf, err) {

	if (err) {
		console.log("Failed parsing configuration file. Exiting.");
		process.exit(10);
	}

	// Create connector
	var testConnector = conf.pingdom.accounts[0];

	// Make API call
	testConnector.apiCall(process.argv[2], function(apiResponse) {
		if (apiResponse.statusCode != 200) {
			console.log("API request returned error: status code: " + apiResponse.statusCode);
		} else {
			console.log(apiResponse.data);
		}
	});
});