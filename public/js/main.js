
function Pingdom() {
	//woop woop lets do this
	var self = this;
	this.downChecks = [];	
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
			if( self.interval != 0 ){ clearInterval(self.interval); }
			//beep every 30s if beep flag is set, synchronised across clients
			log('syncing beep at '+ new Date() +' beeping every '+interval+' seconds');
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
		self.socket.emit('getDownStates', {}, function(data) {
			self.downChecks = data;
			self.render();
		});	
	}
	
	//render the status + list of down checks
	this.render = function(){
		log('Rendering Display');
		//log(self.downChecks)
		
		self.dom.body.removeClass('up down');
		if( self.downChecks.length == 0 ){
			//nothing is down :woop-woop:
			self._renderUp();
		}else{
			//check if all the downchecks have been acknowledged
			var down = false;
			for (var i = 0, l = self.downChecks.length; i < l; i++) {
				if( self.downChecks[i].acknowledged == false){
					down = true;
				}
			}
			if( down ){
				self._renderDown();
			}else{
				self._renderUp();
			}
		}
	}
	this._renderUp = function(){
		self.dom.checkList.addClass('hide').children().remove();
		self.dom.body.addClass('up');
		self.dom.status.text('ok');	
		self.beep = false;
		//clearInterval(self.interval);

		if( self.downChecks.length != 0 ){
			self.dom.checkList.removeClass('hide')
			self._renderList();
		}
	}
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

	}
	this._renderList = function(){
		log('rendering list');
		for (var i = 0, l = self.downChecks.length; i < l; i++) {
			var li = $('<li/>');
			
			//render each list element from jade template
			var locals = clone(self.downChecks[i]);
			locals.status = ( locals.acknowledged ) ? 'acknowledged':locals.status;
			var a = $( self.templates.list(locals) ).appendTo(li);
			//set acknowledge click event
			a.click(function(e){
					e.preventDefault();
					self.acknowledge( $(this).attr('id') );
				});
			li.appendTo(self.dom.checkList);
		}	
		
	}
	
	this.renderMonitorStatus = function(status){
		log('Rendering Monitor Status');
		self.dom.monitorStatus.children().remove();
		//render from template		
		self.dom.monitorStatus.append( self.templates.monitorStatus(status) );
	}
	this.acknowledge = function(id){
		log('Acknowledging '+id);
		self.socket.emit('acknowledge', id);
	};
	//event listeners
	this.socket.on('statusChange', function(data){
		log(data);
		log('Status Change: '+data.id+' - '+data.hostname+' - '+data.status + ' - acknowledged: '+ data.acknowledged);
		self.updateChecks();
	});	
	this.socket.on('monitorStatus', function(data){
		log('Monitor Status Update');
		self.renderMonitorStatus(data);
	});	


	//this.updateChecks();
};

//copy an object
function clone(obj) {
	var tmp = (obj instanceof Array) ? [] : {};
	for (var i in obj) {
		tmp[i] = ( typeof(obj[i]) === 'object' ) ? clone(obj[i]) : obj[i];
	}
	return tmp;
}

function log(d){
	debug = debug || false;
	if( debug && typeof(console) == 'object'  ){
		console.log(d);
	}
}
var kiosk;
var debug = true;
$(document).ready(function(){
	kiosk = new Pingdom();
});
