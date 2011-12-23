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

		var status = ['up','up','up','up','up'];
	if( c > 2){
		// Make 2 of the checks go down 
		var tmp = Math.floor(Math.random()*5);
		status[tmp] = 'down';
		var tmp = Math.floor(Math.random()*5);
		status[tmp] = 'down';		
		c = 0;
	}
		console.log(status);
	


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
					"status": status[1],
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
					"status": status[2],
					"type": "ping"
				},
				{
					"hostname": "mydomain2.com",
					"id": 5678,
					"lasterrortime": 1299194968,
					"lastresponsetime": 1141,
					"lasttesttime": 1300977268,
					"name": "My check 3",
					"resolution": 5,
					"status": status[3],
					"type": "ping"
				},
								{
					"hostname": "mydomain3.com",
					"id": 1234,
					"lasterrortime": 1299194968,
					"lastresponsetime": 1141,
					"lasttesttime": 1300977268,
					"name": "My check 4",
					"resolution": 5,
					"status": status[4],
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
}).listen(9000);

console.log('Fake HTTPS Pingdom server running on port 9000.');
