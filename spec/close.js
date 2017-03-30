/* eslint-env node, mocha */

var Client = require('../src/lib.js').Client;
var assert = require('chai').assert;
var sonicEndpoint = (process.env.SONIC_HOST || 'wss://0.0.0.0:443') + '/v1/query';

describe('Client#close', function() {
  it('should cancel all ongoing queries', function(done) {
    var client = new Client(sonicEndpoint);
    var q = {
      query: '100',
      config: { class: 'SyntheticSource' }
    };

    var queries = [q, q, q, q, q, q];

    queries.forEach(function(query) {
      client.run(query, function(err, d) {
        if (err || d.length !== 0) {
          done(err || new Error('data not empty!'));
          return;
        }
        
        if (queries.length === 1) {
          done();
          assert.equal(client.ws.length, 0);
          return;
        }

        queries.splice(queries.indexOf(query), 1);

      });
    });
    assert.equal(client.ws.length, 6);
    client.close();
  });
});

describe('stream#cancel', function() {
  it('should cancel query', function(done) {
    var client = new Client(sonicEndpoint);
    var query = {
      query: '100',
      config: { class: 'SyntheticSource' }
    };
    var emitter = client.stream(query);

    assert.equal(client.ws.length, 1);

    emitter.on('done', function() {
      assert.equal(client.ws.length, 0);
      done();
    });
    emitter.on('error', function(err) {
      done(err);
    });
    emitter.cancel();
  });
});

describe('run#cancel', function() {
  it('should cancel query', function(done) {
    var client = new Client(sonicEndpoint);
    var query = {
      query: '100',
      config: { class: 'SyntheticSource' }
    };
    var closeable = client.run(query, function(err, d) {
      if (err || d.length !== 0) {
        done(err || new Error('data not empty!'));
      } else {
        assert.equal(client.ws.length, 0);
        done();
      }
    });
    assert.equal(client.ws.length, 1);
    closeable.cancel();
  });
});
