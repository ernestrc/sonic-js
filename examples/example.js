/* eslint no-console: [0]*/

// var Client = require('sonic-js').Client;
const Client = require('../src/lib.js').Client;
const assert = require('assert');

const host = process.env.SONIC_HOST || 'ws://0.0.0.0:9111';
const API_KEY = '1234';
const USER = 'serrallonga';

const opt = {
	maxPoolSize: 5, /* max connection pool size */
	minPoolSize: 1, /* min connection pool size */
	acquireTimeout: 3000, /* new connection total acquisition timeout */
};

const client = new Client(`${host}/v1/query`, opt);

const query = {
	query: '10',
	config: {
		class: 'SyntheticSource',
		seed: 1000,
		'progress-delay': 10
	}
};

const query2 = {
	query: '5',
	config: 'secured_test'
};

let done = 0;


/* UNAUTHENTICATED Client.prototype.stream */

const stream = client.stream(query);

stream.on('data', (data) => {
	console.log(data);
});

stream.on('progress', (p) => {
	done += p.progress;
	console.log(`running.. ${done}/${p.total} ${p.units}`);
});

stream.on('metadata', (meta) => {
	console.log(`metadata: ${JSON.stringify(meta)}`);
});

stream.on('done', () => {
	console.log('stream is done!');
});

stream.on('error', (err) => {
	console.log(`stream error: ${err}`);
});


/* UNAUTHENTICATED Client.prototype.run */

client.run(query, (err, res) => {
	if (err) {
		console.log(err);
		return;
	}

	res.forEach((e) => {
		console.log(e);
	});

	console.log('exec is done!');
});

// `secured_test` source can be accessed without
// an auth token that grants
// authorization equal or higher than 3.
client.run(query2, (err) => {
	assert.throws(() => {
		if (err) {
			throw err;
		}
	});
});


/* AUTHENTICATED Client.prototype.run */

// first we need to authenticate
client.authenticate(USER, API_KEY, (err, token) => {
	if (err) {
		throw err;
	}

	query2.auth = token;

	client.run(query2, (qerr, res) => {
		if (qerr) {
			throw qerr;
		}

		res.forEach((e) => {
			console.log(e);
		});

		console.log('secured exec is done!');

    // close ws
		client.close()
      .then(() => console.log('released all resources'))
      .catch(error => console.error(error));
	});
});
