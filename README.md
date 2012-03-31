JSConf 2012 Hotline - powered by Twilio
=======================================

Twilo is sponsoring JSConf 2012 this year and we whipped-up a fun little app that is going to power a 
hotline (972-44-JSCNF).  The app is written in Node.js and makes use of the IrisCouch service for
persistence.  It also uses Telenode for sending SMS messages via Twilio.  Feel free to fork it, repurpose it,
do whatever you like.  It's under a MIT license.

Configuration
-------------
1. Rename `config.sample.js` to `config.js`
2. Configure CouchDB & Twilio
3. Done!