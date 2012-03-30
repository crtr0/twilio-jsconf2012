var config = {};

config.couchdb = {};
config.twilio = {};
config.bus = {};

config.couchdb.url = 'https://your_instance.iriscouch.com';
config.couchdb.port = 1234;
config.couchdb.username = 'username';
config.couchdb.password = 'password';

config.twilio.sid = 'ACXXX';
config.twilio.key = 'YYYY';
config.twilio.number = '+15555551212'

config.bus.oneway = 22;

module.exports = config;
