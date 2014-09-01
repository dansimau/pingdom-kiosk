
function Pingdom() {
	//woop woop lets do this
	var self = this;
	this.downChecks = [];
	self.acknowledgedChecks = [];
	this.beep = false;
	this.interval = 0;
	//templates are bootstrapped into the initial html
	this.templates = templates;

	//insert basic dom elements
	$('body').text('').html('');
	this.dom = {};
	this.dom.body 			= $('body');
	this.dom.app 			= $('<div id="app"/>').appendTo('body');
	this.dom.status 		= $('<h1 id="status" class="uppercase"/>').appendTo(this.dom.app);
	this.dom.checkList 		= $('<ul id="checkList" class="hide"/>').appendTo(this.dom.app);
	this.dom.monitorStatus 	= $('<div id="monitorStatus"/>').appendTo(this.dom.app);
	this.dom.audio 			= $('<audio src="/beep.wav" preload />').appendTo(this.dom.app);

	this.maxFont = (matches = this.dom.status.css('font-size').match(/([0-9]+)px/)) ? matches[1] : 120;
	this.minFont = 60;

	//connect websockets
	this.socket = io.connect();

	this.socket.on('disconnect', function(){
		self.dom.status.text('Connection Lost');
		self.dom.body.addClass('disconnected');
		self.dom.monitorStatus.children().remove();
		self.dom.checkList.children().remove();
	});
	this.socket.on('connect', function(){
		log('Connected');
		self.dom.body.removeClass('disconnected');

		//resync
		self.socket.once('beepSync', function(interval){
			if( self.interval !== 0 ){ clearInterval(self.interval); }
			//beep every 30s if beep flag is set, synchronised across clients
			log('syncing beep at '+ new Date() +' beeping every '+( interval / 1000 )+' seconds');
			self.interval = setInterval(function(){
				if( self.beep ){
					log('BBBEEEEEEPPPPP');
					self.dom.audio.trigger('play');
				}
			}, interval);
		});

		//refresh when we (re)connect
		self.updateChecks();
	});

	//guess what this does!
	this.updateChecks = function(){
		log('Getting Updated Checks');
		self.socket.emit('getStates', ['down','acknowledged'], function(data) {
			self.downChecks = data.down;
			self.acknowledgedChecks = data.acknowledged;
			self.render();
		});
	};

	//render the status + list of down checks
	this.render = function(){
		log('Rendering Display');
		//log(self.downChecks)

		self.dom.body.removeClass('up down');
		if( self.downChecks.length === 0 ){
			//nothing is down :woop-woop:
			self._renderUp();
		}else{
			//check if all the downchecks have been acknowledged
			var down = false;
			for (var i = 0, l = self.downChecks.length; i < l; i++) {
				if( self.downChecks[i].acknowledged === false){
					down = true;
				}
			}
			if( down ){
				self._renderDown();
			}else{
				self._renderUp();
			}
		}
		self.adjustSize();
	};
	this._renderUp = function(){
		self.dom.checkList.addClass('hide').children().remove();
		self.dom.body.addClass('up');
		self.dom.status.text('ok');
		self.beep = false;

		if( self.downChecks.length !== 0 || self.acknowledgedChecks !== 0 ){
			self.dom.checkList.removeClass('hide');
			self._renderList();
		}
	};
	this._renderDown = function(){
		//ruh roh
		self.dom.body.addClass('down');
		var text = [];
		for (var i = 0; i < self.downChecks.length; i++) {
			if( !self.downChecks[i].acknowledged ){
				text.push(self.downChecks[i].name);
			}
		}
		self.dom.status.html( text.join('<br/>') );
		self.dom.checkList.removeClass('hide').children().remove();
		self._renderList();
		//BEEPY TIME
		self.beep = true;

	};
	this.adjustSize = function(){
		var avail = $(window).height();
		var tot = self.dom.checkList.height() + self.dom.monitorStatus.height();
		var max = avail - tot - 100;
		var fontStep = 10;
		var fontSize;
		log('Resizing');

		//set height to whatever
		self.dom.status.height('');
		var brk = false;
		var n = 0;
		if( self.dom.status.prop('clientHeight') > max){
			//too big, resize until it fits!
			while( self.dom.status.prop('clientHeight') >  max && !brk ){
				n++;
				fontsize = parseInt( self.dom.status.css('font-size').match(/([0-9]+)px/)[1], 10 );
				if( fontsize < self.minFont || n > 50 ){
					log('Min font reached or loop out of control!');
					fontsize += (fontStep*2);
					brk = true;
				}
				self.dom.status.css('font-size', fontsize - fontStep +'px' );
			}
		}else{
			while( self.dom.status.prop('clientHeight') < max && !brk ){
				n++;
				fontsize = parseInt( self.dom.status.css('font-size').match(/([0-9]+)px/)[1], 10 );
				if( fontsize > self.maxFont || n > 50 ){
					log('Max font reached or loop out of control!');
					fontsize -= (fontStep*2);
					brk = true;
				}
				self.dom.status.css('font-size', fontsize + fontStep +'px' );
			}
		}
		//fix height, overflow is set to hide anything that pushes over
		self.dom.status.height(max);

	};
	this._renderList = function(){
		log('rendering list');
		var i;
		for (i = 0, l = self.downChecks.length; i < l; i++) {
			//unacknowledged checks only
			if( self.downChecks[i].acknowledged ){
				continue;
			}
			self._renderListCheck(self.downChecks[i]).appendTo(self.dom.checkList);
		}
		for (i = 0, l = self.acknowledgedChecks.length; i < l; i++) {
			self._renderListCheck(self.acknowledgedChecks[i]).appendTo(self.dom.checkList);
		}

	};
	this._renderListCheck = function(check){
		var li = $('<li/>');

		//render each list element from jade template
		var locals = clone(check);

		//ghetto downtime counter
		if ( locals.status == 'down') {
			//calculate time check has been down for
			var t = timeFormat(new Date().getTime() - (locals.laststatuschange*1000) );
			locals.name += ' '+locals.status+' for <span class="time" rel="'+locals.laststatuschange+'">'+t+'</span>';
		}
		if ( locals.acknowledged ){
			//calculate time check has been acknowledge for
			var atime = timeFormat(new Date().getTime() - (locals.acknowledgedtime*1000) );
			locals.name += ' acknowledged for <span class="time" rel="'+locals.acknowledgedtime+'">'+atime+'</span>';
		}

		locals.statusClass = ( locals.acknowledged ) ? 'acknowledged_'+locals.status:locals.status;
		locals.status = ( locals.acknowledged ) ? 'Acknowledged '+locals.status:locals.status;

		var a = $( self.templates.list(locals) ).appendTo(li);
		//set acknowledge click event
		a.click(function(e){
				e.preventDefault();
				self.acknowledge( $(this).attr('id') );
			});
		return li;
	};

	//calculate time the check has been down
	setInterval( function(){
		self.dom.checkList.find('span.time').each(function(){
			$(this).text( timeFormat( new Date().getTime() - ($(this).attr('rel')*1000) ) );
		});
	},1000);

	this.renderMonitorStatus = function(status){
		log('Rendering Monitor Status');
		self.dom.monitorStatus.children().remove();
		//render from template
		self.dom.monitorStatus.append( self.templates.monitorStatus(status) );
	};
	this.acknowledge = function(id){
		log('Acknowledging '+id);
		self.socket.emit('acknowledge', id);
	};
	//event listeners
	this.socket.on('statusChange', function(data){
		log('Status Change: '+data.id+' - '+data.hostname+' - '+data.status + ' - acknowledged: '+ data.acknowledged);
		self.updateChecks();
	});
	this.socket.on('monitorStatus', function(data){
		log('Monitor Status Update');
		self.renderMonitorStatus(data);
	});

	//adjust status text size on window resize
	$(window).resize(self.adjustSize);
}

//copy an object
function clone(obj) {
	var tmp = (obj instanceof Array) ? [] : {};
	for (var i in obj) {
		tmp[i] = ( typeof(obj[i]) === 'object' ) ? clone(obj[i]) : obj[i];
	}
	return tmp;
}

function log(msg){
	debug = debug || false;
	if( debug && typeof(console) == 'object' ){
		if( typeof(msg) == 'string' ){
			var d = new Date();
			var timestamp = d.getDate().toString().padLeft(2,0) +
							'-'+(d.getMonth()+1).toString().padLeft(2,0) +
							'-'+d.getFullYear().toString().padLeft(2,0) +
							' '+d.getHours().toString().padLeft(2,0) +
							':'+d.getMinutes().toString().padLeft(2,0) +
							':'+d.getSeconds().toString().padLeft(2,0);
			console.log(timestamp+' - '+msg);
		}else{
			console.log(msg);
		}

	}
}
//js string functions are awful
String.prototype.padLeft = function(num, chr){
	var str = this.toString();
	if( str.length >= num ){
		return str;
	}
	for( i=num; i>=str.length; i-- ){
		str = chr+str;
	}
	return str;
};
function timeDiff(t){
	t = Math.floor(t / 1000);

	var d = Math.floor( t / 86400 );
	t = t % 86400;

	var h = Math.floor( t / 3600 );
	t = t % 3600;

	var m = Math.floor( t / 60 );
	t = t % 60;

	return [d,h,m,t];
}
function timeFormat(t){
	t = timeDiff(t);
	var r = '';
	if(t[0] > 0 ) r +=    t[0]+'d ';
	if(t[1] > 0 ) r += ' '+t[1]+'h ';
	if(t[2] > 0 ) r += ' '+t[2]+'m ';
	r += t[3]+'s';
	return r;
}

var kiosk;
var debug = true;
