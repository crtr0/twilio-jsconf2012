// Required Modules 

var config = require('./config'),
    telenode = require('telenode'),
    cradle = require('cradle'),
    crypto = require('crypto'),
    express = require('express'),
    stylus = require('stylus');

// Configuration 

var connection = new(cradle.Connection)(config.couchdb.url, config.couchdb.port, {
        auth:{username: config.couchdb.username, password: config.couchdb.password}}),
    cowpokes = connection.database('cowpokes'),
    twiliobus = connection.database('twiliobus'),
    twilio = new telenode(telenode.providers.twilio),
    app = express.createServer();

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.set('view options', { layout: false });
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(stylus.middleware({ src: __dirname + '/public' }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

twilio.credentials({sid: config.twilio.sid, authToken: config.twilio.key});

// Utility Functions

var updateBus = function(response, direction) {
    var now = new Date();
    twiliobus.save('state', {
        to: direction,
        departure: JSON.stringify(now),
        eta: JSON.stringify(new Date(now.getTime() + config.bus.oneway*60*1000))
    }, function (err, res) {
        if (err) { coucherror(response, err); }
        else {
            response.render('sms.jade', { locals: {
                msg: 'Thanks for checking-in, bus status now: on way to '+ direction }
            });
        } 
    });
};

var twiliosig = function(request) {
   var url = 'http://jsconf2012.nodejitsu.com' + request.url;
   Object.keys(request.body).sort().forEach(function(key, i) {
       url = url + key + request.body[key];
   });
   return crypto.createHmac('sha1', config.twilio.key).update(url).digest('Base64');
};

var coucherror = function(response, err) {
    console.log("CouchDB error", err);
    response.render('sms.jade', { locals: {
        msg: 'Error communicating with CouchDB, try again?' 
        }
    });
};

var smsify = function(str) {
    if (str.length <= 160) { return str; }
    else { return str.substr(0,157)+'...'; }
};

// Routes 

app.get('/', function(request, response) {
    response.render('index.jade');
});

app.post('/processSMS', function(request, response) {

    if (request.header('X-Twilio-Signature') === twiliosig(request)) {

        response.header('Content-Type', 'text/xml');

        var body = request.param('Body');

        if (body.indexOf('#toairport') === 0) {
            updateBus(response, 'airport');
        }
        else if (body.indexOf('#toresort') === 0) {
            updateBus(response, 'resort');
        }
        else if (body.indexOf('#pour') === 0) {
            tokens = body.split('#pour ');
            if (tokens.length > 1) {
                cowpokes.get(request.param('From'), function(err, doc) {
                    if (err) {
                        cowpokes.save(request.param('From'), {
                            name: tokens[1],
                            opt: 'in',
                            alerts: 4,
                            cell: request.param('From'),
                            city: request.param('FromCity'),
                            state: request.param('FromState')
                        }, function (err, res) {
                            if (err) { coucherror(response, err); } 
                            else {
                                response.render('sms.jade', { locals: {
                                    msg: 'Thanks for joining Whiskey Alerts! Text #moo {message} to send a broadcast text. You only get 4, so use wisely. Text #detox anytime to leave.'
                                    }
                                });
                            }
                        });
                    }
                    else {
                        cowpokes.merge(request.param('From'), {opt: 'in', name: tokens[1] }, function(err, res) {
                            if (err) { coucherror(response, err); }
                            else {
                                response.render('sms.jade', { locals: {
                                    msg: 'Thanks for re-joining Whiskey Alerts!' }
                                });
                            }
                        });
                    }
                });
            }
            else {
                response.render('sms.jade', { locals: {
                    msg: 'Error. The format for the join command is: #pour {your name}' }
                });
            }
        }
        else if (body.indexOf('#detox') === 0) {
            cowpokes.merge(request.param('From'), {opt: 'out'}, function(err, res) {
                if (err) { coucherror(response, err); }
                else {
                    response.render('sms.jade', { locals: {
                        msg: 'Sorry to see you go! Text "#pour {name}" anytime to hop back in to Whiskey Alerts.' }
                    });
                }
            });
        }
        else if (body.indexOf('#shuttle') === 0) {
            twiliobus.get('state', function (err, doc) {
                if (err) { coucherror(response, err); }
                else {
                    if (doc.status === 'notrunning') {
                        response.render('sms.jade', { locals: {
                            msg: 'The Twilio Bus is not currently running.' }
                        });
                    }
                    else {
                        var now = new Date(),
                            eta = new Date(JSON.parse(doc.eta)),
                            min = ((eta - now)/60000).toFixed(0);
                        response.render('sms.jade', { locals: {
                            msg: 'Shuttle is en route to ' + doc.to + '. ETA is ' + min + ' minutes.'
                            }
                        });
                    }
                }
            });
        }
        else if (body.indexOf('#poopin') === 0) {
            response.send('<Response></Response>');
        }
        else if (body.indexOf('#help') === 0) {
            response.render('sms.jade', { locals: {
                msg: 'Valid commands: #pour {name}, #detox, #shuttle, #help, #moo {message}' }
            });
        }
        else if (body.indexOf('#moo') === 0) {
            tokens = body.split('#moo ');
            if (tokens.length > 1) {
                cowpokes.get(request.param('From'), function(err, doc) {
                    if (err) {
                        response.render('sms.jade', { locals: {
                            msg: 'Error locating your record, you need to join the Whiskey Call to moo. Text #pour {name} to join!' }
                        });
                    }
                    else if (doc.alerts > 0) {
                        cowpokes.view('users/in', function(err, res) {
                            res.forEach(function(row) {
                                if (row.cell !== request.param('From')) {
                                    twilio.SMS.send({
                                        from: config.twilio.number, 
                                        to: row.cell, 
                                        body: smsify(doc.name + ': ' + tokens[1])
                                    }, function(err, res) {
                                        if (err) {
                                            console.log("#moo error:", err); 
                                        }
                                    });
                                }
                            });
                        });
                        var moos = doc.alerts - 1;
                        cowpokes.merge(request.param('From'), {alerts: moos},
                            function(err, res) {
                                if (err) {
                                    coucherror(response, err);
                                }
                                else {
                                    var msg = (moos === 0 ? 'Message sent. You are fresh out of moos, thanks for having fun with Whiskey Alerts!' : 'Message sent. You now have ' + moos + ' remaining moos, send wisely.');
                                    response.render('sms.jade', { locals: {
                                        msg: msg }
                                    });
                                }
                        });
                    }
                    else {
                        response.render('sms.jade', { locals: {
                            msg: 'Sorry, you are all out of moos.' }
                        });
                    }
                });
            }
            else {
                response.render('sms.jade', { locals: {
                    msg: 'Error. The format for the moo command is: #moo {your broadcast message}' }
                });
            }
        }
        else {
            response.render('sms.jade', { locals: {
                msg: 'Welcome to the JSConf 2012 hotline, powered by Nodejitsu, Iris Couch & Twilio. Text #help for more commands or check-out: http://bit.ly/jscnf' }
            });
        }
    }
    else {
        response.render('forbidden.jade');
    }
});

app.get('/test', function(request, response) {
    response.send('test');
});

// Webserver 

var port = process.env.PORT || 3000;

app.listen(port, function() {
    console.log("Listening on " + port);
});

