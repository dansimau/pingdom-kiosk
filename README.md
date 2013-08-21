# Installing
Pingdom Kiosk requires node.js, available at http://nodejs.org/download/ or via
your distributors software channels.

Use npm to install dependencies:
```
git clone https://github.com/hamishforbes/pingdom-kiosk
cd pingdom-kiosk
npm install
```

You will also need to copy node-launcher from contrib/ into /usr/local/bin/,
either link or install node to /usr/local/bin/ and put Pingdom Kiosk in
/opt/pingdom-kiosk if you want to avoid making any manual changes to the init
script.

# Configuration
The configuration file must be added at [pingdom kiosk root]/kiosk-server.conf.
This file is JSON *not* a JavaScript object literal, that means no single quotes etc.
An example file called kiosk-server.conf.dist is provided in this package.
name, username, password and app_key are required, exclude[], include[] and allowed_contacts[] are
all optional.

include[] and exclude[] are comma separated entries which can be spread over
multiple lines.
```json
	"include": [],
	"exclude": [
		"serverone",
		"servertwo",
		"serverthree"
	]
```

allowed_contacts is an array of pingdom contact *names*.
Names are the only required attribute for contacts so we can't reliably use anything else.
Any check that is configured to send notifications to any of the defined contacts will be included.

```json
   "allowed_contacts":[
        "Dave",
        "Alice",
        "Bob"
   ]
```

# Running
Below is an example run of pingdom kiosk outside the init script.

sudo ./contrib/node-launcher --no-detach --pidfile=/var/run/pingdom-kiosk.pid --logfile=/var/log/pingdom-kiosk.log /usr/local/bin/node ./pingdom-kiosk.js

Running with the init script should be as easy as
sudo ./contrib/init start

The kiosk will start on http://0.0.0.0:3000 by default so should be easily accessible at http://127.0.0.1:3000/

# Proxying

Its probably a good idea to proxy connections to node through nginx.
nginx >1.4.0 is required to support proxying of WebSocket connections.
The below is a config snippet that should allow you to serve static files via nginx and proxy everything else through to node.
```
map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
}

server {
    listen 80;
    listen 443 ssl;
    server_name pingdom-kiosk.example.local;

    root /opt/pingdom-kiosk/public;

    location / {
         try_files $uri @nodejs;
    }

    location @nodejs {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_pass http://127.0.0.1:3000;
    }

}
```
