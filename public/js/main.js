
function Pingdom() {
	//woop woop lets do this
	var _self = this;
	this.downChecks = [];	
	this.beep = false;
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
		_self.dom.status.text('Connection Lost');
		_self.dom.body.addClass('disconnected');
		_self.dom.monitorStatus.children().remove();
		_self.dom.checkList.children().remove();
	});
	this.socket.on('connect', function(){
		console.log('Connected');
		_self.dom.body.removeClass('disconnected');
		
		//refresh when we (re)connect
		_self.updateChecks();
	});	
	
	//guess what this does!
	this.updateChecks = function(){
		console.log('Getting Updated Checks');
		_self.socket.emit('getDownStates', {}, function(data) {
			_self.downChecks = data;
			_self.render();
		});	
	}
	
	this.playBeep = function(){
		if( _self.beep){
			console.log('BBBEEEEEEPPPPP');
			_self.dom.audio.trigger('play');
		}
	}
	//beep every 30s if beep flag is set
	//TODO sync this time with server so you dont get out of sync beeping?
	setInterval(_self.playBeep(), 30000);
	
	//render the status + list of down checks
	this.render = function(){
		console.log('Rendering Display');
		//console.log(_self.downChecks)
		
		_self.dom.body.removeClass('up down');
		if( _self.downChecks.length == 0 ){
			//nothing is down :woop-woop:
			_self._renderUp();
		}else{
			//check if all the downchecks have been acknowledged
			var down = false;
			for (var i = 0, l = _self.downChecks.length; i < l; i++) {
				if( _self.downChecks[i].acknowledged == false){
					down = true;
				}
			}
			if( down ){
				_self._renderDown();
			}else{
				_self._renderUp();
			}
		}
	}
	this._renderUp = function(){
		_self.dom.checkList.addClass('hide').children().remove();
		_self.dom.body.addClass('up');
		_self.dom.status.text('ok');	
		_self.beep = false;
		if( _self.downChecks.length != 0 ){
			_self.dom.checkList.removeClass('hide')
			_self._renderList();
		}
	}
	this._renderDown = function(){
		//ruh roh
		_self.dom.body.addClass('down');
		_self.dom.status.text('down');
		_self.dom.checkList.removeClass('hide').children().remove();
		_self._renderList();
		//BEEPY TIME
		_self.beep = true;
		_self.playBeep();			
	}
	this._renderList = function(){
		console.log('rendering list');
		for (var i = 0, l = _self.downChecks.length; i < l; i++) {
			var li = $('<li/>');
			
			//render each list element from jade template
			var locals = clone(_self.downChecks[i]);
			locals.status = ( locals.acknowledged ) ? 'acknowledged':locals.status;
			var a = $( _self.templates.list(locals) ).appendTo(li);
			//set acknowledge click event
			a.click(function(e){
					e.preventDefault();
					_self.acknowledge( $(this).attr('id') );
				});
			li.appendTo(_self.dom.checkList);
		}	
		
	}
	
	this.renderMonitorStatus = function(status){
		console.log('Rendering Monitor Status');
		_self.dom.monitorStatus.children().remove();
		//render from template		
		_self.dom.monitorStatus.append( _self.templates.monitorStatus(status) );
	}
	this.acknowledge = function(id){
		console.log('Acknowledging '+id);
		_self.socket.emit('acknowledge', id);
	};
	//event listeners
	this.socket.on('statusChange', function(data){
		console.log(data);
		console.log('Status Change: '+data.id+' - '+data.hostname+' - '+data.status + ' - acknowledged: '+ data.acknowledged);
		_self.updateChecks();
	});	
	this.socket.on('monitorStatus', function(data){
		console.log('Monitor Status Update');
		_self.renderMonitorStatus(data);
	});	
	
	this.updateChecks();
};

//copy an object
function clone(obj) {
	var tmp = (obj instanceof Array) ? [] : {};
	for (var i in obj) {
		tmp[i] = ( typeof(obj[i]) === 'object' ) ? clone(obj[i]) : obj[i];
	}
	return tmp;
}
var kiosk;
$(document).ready(function(){
	kiosk = new Pingdom();
});
