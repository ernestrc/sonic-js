/* eslint no-console: [0]*/

// var Client = require('sonic-js').Client;
var Client = require('../src/lib.js').Client;
var assert = require('assert');
var host = process.env.SONIC_HOST || 'wss://0.0.0.0:443';
var API_KEY = '1234';
var USER = 'serrallonga';

var client = new Client(host + '/v1/query');

var query = {
  query: '10',
  config: {
    class: 'SyntheticSource',
    seed: 1000,
    'progress-delay': 10
  }
};

var query2 = {
  query: '5',
  config: 'secured_test'
};

var done = 0;


/* UNAUTHENTICATED Client.prototype.stream */

var stream = client.stream(query);

stream.on('data', function(data) {
  console.log(data);
});

stream.on('progress', function(p) {
  done += p.progress;
  console.log('running.. ' + done + '/' + p.total + ' ' + p.units);
});

stream.on('output', function(out) {
  console.log(out);
});

stream.on('metadata', function(meta) {
  console.log('metadata: ' + JSON.stringify(meta));
});

stream.on('done', function() {
  console.log('stream is done!');
});

stream.on('error', function(err) {
  console.log('stream error: ' + err);
});

/* UNAUTHENTICATED Client.prototype.run */

client.run(query, function(err, res) {
  if (err) {
    console.log(err);
    return;
  }

  res.forEach(function(e) {
    console.log(e);
  });

  console.log('exec is done!');

});

/* AUTHENTICATED Client.prototype.run */

// `secured_test` source can be accessed without
// an auth token that grants
// authorization equal or higher than 3.
client.run(query2, function(err) {
  assert.throws(function () {
    if (err) {
      throw err;
    }
  });
});

// first we need to authenticate
client.authenticate(USER, API_KEY, function(err, token) {
  if (err) {
    throw err;
  }

  query2.auth = token;

  client.run(query2, function(err, res) {
    if (err) {
      throw err;
    }

    res.forEach(function(e) {
      console.log(e);
    });

    console.log('secured exec is done!');

    // close ws
    client.close();

  });
});
