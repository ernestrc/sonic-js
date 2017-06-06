/* eslint-env node, mocha */
const Client = require('../src/lib.js').Client;
const assert = require('chai').assert;

const sonicEndpoint = `${process.env.SONIC_HOST || 'wss://0.0.0.0:9111'}/v1/query`;

describe('Client#close', () => {
	it('should cancel all ongoing queries', () => {
		const client = new Client(sonicEndpoint, { maxPoolSize: 5, minPoolSize: 5, });
		const q = {
			query: '100',
			'progress-delay': 1000,
			config: { class: 'SyntheticSource' }
		};

		const queries = [q, q, q];

		const progress = Promise.all(queries.map(client.run2.bind(client)));
		let closeProm;

		const timer = setInterval(() => {
      // wait until all queries are running
			if (Object.keys(client.running).length === queries.length) {
				closeProm = client.close();
				clearInterval(timer);
			}
		}, 100);

		return progress.then((data) => {
			assert.equal(data.reduce((a, d) => a + d.length, 0), 0);
		}).then(() => closeProm);
	});

	it('should not allow more queries to be submitted', () => {
		const client = new Client(sonicEndpoint, { maxPoolSize: 5, minPoolSize: 5, });
		const q = {
			query: '100',
			'progress-delay': 1000,
			config: { class: 'SyntheticSource' }
		};

		const queries = [q, q, q];

		const closeProm = client.close();
    
		return Promise.all(queries.map(client.run2.bind(client))).then((data) => {
			throw new Error(`not bubble up error: ${JSON.stringify(data)}`);
		}).catch((err) => {
			assert(err.toString().indexOf('closing') >= 0, err.toString());
			assert.equal(Object.keys(client.running).length, 0);
		}).then(() => closeProm);
	});
});

describe('stream#cancel', () => {
	it('should cancel query', (done) => {
		const client = new Client(sonicEndpoint);
		const query = {
			query: '100',
			config: { class: 'SyntheticSource' }
		};
		let cancelCb = false;
		const emitter = client.stream(query);

		emitter.on('done', () => {
			assert.equal(Object.keys(client.running).length, 0);
			assert(cancelCb, 'cancelCb was not called!');
			done();
		});
		emitter.on('error', (err) => {
			done(err);
		});
		emitter.cancel(() => {
			cancelCb = true;
		});
	});
});
