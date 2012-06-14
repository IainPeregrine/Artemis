
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');

var app = module.exports = express.createServer();
var io = require('socket.io');
io = io.listen(app);
io.sockets.on('connection', function (socket) {
	artemis.create_client(socket);
});

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);

app.listen(8080, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

// Artemis

var PROTOCOL_VERSION = "0.3";
var SYSTEM = "system";
var SYSTEM_CHANNEL = "system";
var MOTD = "You have connected to Ceres Communications Base, runing Artemis protocol version 0.3."

var MAX_HANDLE_LENGTH = 8;

var ACTION_SUCCESS = 1;
var ACTION_FAILURE = 2;
var ACTION_MALFORMED = 3;
var ACTION_COLLISION = 4;
var ACTION_NONEXIST = 5;
var ACTION_UNREACHABLE = 6;
//var ACTION_DEATH = 8;

var ACTION_PING = 10;
var ACTION_REGSERVER = 11;
var ACTION_SERVERUPDATE = 12;
var ACTION_DISCONNECT = 13;
var ACTION_REGUSER = 14;
var ACTION_BADUSER = 15;
var ACTION_CONFLICT = 16;
var ACTION_CHANSYNC = 17;

var ACTION_MESSAGE = 30;
var ACTION_JOIN = 31;
var ACTION_LEAVE = 32;
var ACTION_DENIED = 33;
var ACTION_OPERATE = 34;
var ACTION_PREFERENCES = 35;
var ACTION_TRAFFIC = 36;
var ACTION_EMOTE = 37;
var ACTION_CODE = 38;

var PERMISSION_OWNER = 5;
var PERMISSION_OPERATOR = 4;
var PERMISSION_VOICED = 3;
var PERMISSION_NORMAL = 2;
var PERMISSION_MUTED = 1;
var PERMISSION_BLOCKED = 0;
var PERMISSION_ACTIVEFLAG = 16;

var STATUS_NORMAL = 0;
var STATUS_CLOSED = 1;
var STATUS_HIDDEN = 2;
var STATUS_LOCKED = 4;

Array.prototype.ip_remove = function(){
	for(var index = 0; index < arguments.length; index++){
		var removal = arguments[index];
		var removal_index = this.indexOf(removal);
		if(removal_index == -1){ continue}
		this.splice(removal_index, 1);
	}
}

function Message(sender, target, action, body){
	this.sender = sender;
	this.target = target;
	this.action = action;
	this.body   = body;
	this.time   = (new Date()).getTime();
}

var artemis = Object.create(Object, {
	users: {
		configurable: true,
		writable: true,
		value: {} // A new object (but not a new Object!)
	},
	channels: {
		configurable: true,
		writable: true,
		value: {} // A new object (but not a new Object!)
	},
	register_user: { value: function (desired_name, intelligence){
		if(desired_name in this.users){
			desired_name = "Foobar";
			}
		var new_user = this.user.constructor.call(Object.create(this.user), desired_name, intelligence);
		this.users[new_user.name] = new_user;
		return new_user;
	}},
	create_client: { value: function (socket){
		var new_client = this.client.constructor.call(Object.create(this.client));
		new_client.configure_socket(socket);
		return new_client;
	}},
	drop_client: { value: function(client){
		var old_socket = client.socket;
		if(old_socket){ /* By the time drop_client is called, socket.io has deleted the socket.*/
			old_socket.client = null;
			client.socket = null;
		}
		var old_user = client.user;
		if(old_user){ /* clients can be dropped before they register names.*/
			old_user.intelligence = null;
			client.user = null;
			var old_user_name = old_user.name
			delete this.users[old_user_name]
			while(old_user.channels.length){
				var channel = old_user.channels[0];
				channel.remove_user(old_user);
			}
		}
	}},
	create_channel: { value: function (channel_name, owner){
		var new_channel = this.channel.constructor.call(Object.create(this.channel), channel_name);
		this.channels[new_channel.name] = new_channel;
		return new_channel;
	}},
	cancel_channel: { value: function (channel_name){
		var channel = this.channels[channel_name];
		while(channel.users.length){
			channel.remove_user(channel.users[0]);
		}
		delete this.channels[channel_name];
	}},
	relay: { value: function (message){
		var message_action = message.action;
		var target;
		var target_array = message.target.split("#");
		var user_name = target_array[0];
		if(user_name.length){
			target = this.users[user_name]
		}
		else{
			var chan_name = target_array[1];
			target = this.channels[chan_name]
			if(!target && message.action == ACTION_JOIN){
				target = this.create_channel(chan_name, message.sender);
			}
		}
		if(!target){ return}
		target.recieve_message(message);
	}},
	handle_message: { value: function (message){ // For use as system_user's intelligence
		switch(message.action){
			case ACTION_MESSAGE:
				if(message.body == "motd"){
					var response = new Message(
						SYSTEM,
						message.sender+"#"+SYSTEM_CHANNEL,
						ACTION_MESSAGE,
						MOTD
					)
					artemis.relay(response);
				}
			break;
			/*case ACTION_PREFERENCES:
				var desired_nick = message.body.nick;
				if(desired_nick){
					var cleaned_nick = desired_nick; // TO DO: clean user input
					if(this.users.indexOf(cleaned_nick) >= 0){ return;}
					
				}
			break;*/
		}
		/*switch(message_action){
			case ACTION_MESSAGE:
			for(var user_name in this.users){
				var index_user = this.users[user_name];
				index_user.recieve_message(message);
			}
			break;
			case ACTION_TRAFFIC:
			for(var user_name in this.users){
				var index_user = this.users[user_name];
				index_user.recieve_message(message);
			}
			break;
		}*/
	}}
});
artemis.client = Object.create(Object, {
	constructor: { value: function (){
		this.socket = undefined;
		this.user = undefined;
		return this;
	}},
	configure_socket: { value: function (socket){		
		socket.client = this;
		this.socket = socket;
		socket.on("disconnect", function (){
			artemis.drop_client(this.client);
		});
		socket.on("Artemis:local_traffic", function (data){
			//console.log("Recieved Message: "+JSON.stringify(data))
			var action = data.action;
			var content = data.content;
			switch(action){
				case "register":
				this.client.configure_user(content.name)
				break;
				case "channel_list":
				this.client.channel_list();
				break;
				case "message":
				if(this.client.user){
					content.sender = this.client.user.name;
					this.client.send_message(content)
					}
				break;
			}
		});
	}},
	configure_user: { value: function (desired_name){
		this.user = artemis.register_user(desired_name, this);
		if(!this.user){
			this.socket.emit("Artemis:local_traffic", { action: "confirm_register", content: undefined});
			return;
		}
		else{
			this.socket.emit("Artemis:local_traffic", { action: "confirm_register", content: this.user.name});
			var join_msg = new Message(this.user.name, "#"+SYSTEM_CHANNEL, ACTION_JOIN);
			artemis.relay(join_msg);
			var motd_query = new Message(this.user.name, SYSTEM, ACTION_MESSAGE, "motd");
			artemis.relay(motd_query);
		}
	}},
	send_message: { value: function (message){
		if(!this.user){ return};
		//var message = { action: ACTION_MESSAGE, sender: this.user.name, body: message.body}
		artemis.relay(message)
	}},
	handle_message: { value: function (message){
		this.socket.emit("Artemis:local_traffic", {action: "message", content: message});
	}},
	channel_list: { value: function (local_content){
		var _content = {};
		for(var channel_name in artemis.channels){
			var channel = artemis.channels[channel_name];
			_content[channel_name] = {population: channel.users.length};
		}
		var channels = {
			action: "channel_list",
			content: _content
			};
		this.socket.emit("Artemis:local_traffic", channels);
	}}
});
artemis.user = Object.create(Object, {
	constructor: { value: function (name, intelligence){
		this.name = name;
		this.intelligence = intelligence;
		this.channels = new Array();
		return this;
	}},
	add_channel: { value: function (channel){
		if(this.channels.indexOf(channel) >= 0){
			return
		}
		this.channels.push(channel);
	}},
	remove_channel: { value: function (channel){
		this.channels.ip_remove(channel);
	}},
	recieve_message: { value: function (message){
		if(this.intelligence && this.intelligence.handle_message){
			this.intelligence.handle_message(message);
		}
	}}
});
artemis.channel = Object.create(Object, {
	constructor: { value: function (name, owner){
		this.name = name;
		this.users = new Array();
		return this;
	}},
	add_user: { value: function (user){
		if(this.users.indexOf(user) >= 0){
			return;
		}
		this.users.push(user);
		user.add_channel(this);
		var who_message = new Message(
			SYSTEM,
			user.name,
			"who_list",
			{channel: this.name, permissions: this.compile_who()}
		);
		artemis.relay(who_message);
		var original_length = this.users.length
		for(var index = 0; index < original_length; index++){
			var indexed_user = this.users[index];
			var traffic_body = {
				name: user.name,
				status: 1 // TO DO: Pass channel permission.
			}
			var traffic_message = new Message(
				SYSTEM,
				indexed_user.name+"#"+this.name,
				ACTION_TRAFFIC,
				traffic_body
			);
			artemis.relay(traffic_message);
		}
	}},
	remove_user: { value: function (user){
		if(this.users.indexOf(user) < 0){ return;}
		user.remove_channel(this);
		var success = this.users.ip_remove(user);
		if(!this.users.length){
			artemis.cancel_channel(this.name);
			return;
		}
		var original_length = this.users.length;
		for(var index = 0; index < original_length; index++){
			var indexed_user = this.users[index];
			var traffic_body = {
				name: user.name,
				status: 0 // TO DO: Pass channel permission.
			}
			var traffic_message = new Message(
				SYSTEM,
				indexed_user.name+"#"+this.name,
				ACTION_TRAFFIC,
				traffic_body
			);
			artemis.relay(traffic_message);
		}
	}},
	compile_who: { value: function (){
		var who_data = {};
		var original_length = this.users.length;
		for(var index = 0; index < original_length; index++){
			var user = this.users[index];
			who_data[user.name] = 1; // TO DO: record permissions.
		}
		return who_data;
	}},
	recieve_message: { value: function (message){
		switch(message.action){
			case ACTION_JOIN:
				var new_user = artemis.users[message.sender]
				this.add_user(new_user);
				break;
			case ACTION_LEAVE:
				var old_user = artemis.users[message.sender]
				this.remove_user(old_user);
				break;
			case ACTION_MESSAGE:
				if(!this.can_speak(artemis.users[message.sender])){ break;}
				var original_length = this.users.length;
				for(var user_index = 0; user_index < original_length; user_index++){
					var indexed_user = this.users[user_index];
					artemis.relay(new Message(
						message.sender,
						indexed_user.name+message.target,
						message.action,
						message.body,
						message.time
					));
				}
				break;
		}
	}},
	can_speak: { value: function (user){
		if(this.users.indexOf(user) >= 0){ return true}
		else{ return false}
	}}
});
var system_user = artemis.register_user(SYSTEM, artemis);
