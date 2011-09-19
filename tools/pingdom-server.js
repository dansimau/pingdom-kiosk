var http = require("http");
var liburl = require("url");
var log = require("../lib/log");

// Request counter
var c = 0;

http.createServer(function (req, res) {

	c++;
	var url = liburl.parse(req.url);

	log.info("Received API call: " + url.pathname);

	if (url.pathname == '/api/2.0/checks') {

		var status = 'up';

		// Make one of the checks go down from the second request
		if (c > 3) {
			status = 'down';
		}

		res.writeHead(200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Req-Limit-Short': 'Remaining: 2000 Time left: 3600',
			'Req-Limit-Long': 'Remaining: 5000 Time left: 86400'
		});
		res.end(JSON.stringify({
			"checks": [
				{
					"hostname": "example.com",
					"id": 85975,
					"lasterrortime": 1297446423,
					"lastresponsetime": 355,
					"lasttesttime": 1300977363,
					"name": "My check 1",
					"resolution": 1,
					"status": "up",
					"type": "http"
				},
				{
					"hostname": "mydomain.com",
					"id": 161748,
					"lasterrortime": 1299194968,
					"lastresponsetime": 1141,
					"lasttesttime": 1300977268,
					"name": "My check 2",
					"resolution": 5,
					"status": status,
					"type": "ping"
				}
			]
		}));
	} else {
		res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
		res.write(JSON.stringify({
		   "error": {
			  "statuscode": 404,
			  "statusdesc": "Error - not found",
			  "errormessage": "Something went wrong!"
		   }
		}));
		res.end();
	}
}).listen(80);

console.log('Fake HTTPS Pingdom server running on port 80.');
