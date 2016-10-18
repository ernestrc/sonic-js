# Sonic-js [![Build Status](https://travis-ci.org/xarxa6/sonic-js.svg)](https://travis-ci.org/xarxa6/sonic-js) [![npm version](https://badge.fury.io/js/sonic-js.svg)](https://badge.fury.io/js/sonic-js)

WebSockets Client library for the Sonic protocol

# Installation
- Using npm:
```
npm install sonic-js
```

- For browser usage, bundling has has been tested with browserify and babel.

# Usage
```javascript
var Client = require('sonic-js').Client;
var assert = require('assert');

var client = new Client('wss://0.0.0.0:443');

var query = {
  query: '5',
  config: {
    "class" : "SyntheticSource",
    "seed" : 1000,
    "progress-delay" : 10
  }
};

/* Client.prototype.run */

client.run(query, function(err, res) {
  if (err) {
    console.log(err);
    return;
  }

  res.forEach(function(e) {
    console.log(e);
  });

  client.close();
  console.log('exec is done!');

});

/* Client.prototype.stream */

var stream = client.stream(query);

var done = 0;

stream.on('data', function(data) {
  console.log(data);
});

stream.on('progress', function(p) {
  done += p.progress;
  console.log('running.. ' + done + "/" + p.total + " "+ p.units);
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
```

For a more complete example, check [examples/example.js](examples/example.js).

# Contribute
If you would like to contribute to the project, please fork the project, include your changes and submit a pull request back to the main repository.

# License
MIT License
