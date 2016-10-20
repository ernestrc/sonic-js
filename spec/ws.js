/* eslint-env node, mocha */

var Client = require('../src/lib.js').Client;
var assert = require('chai').assert;
var process = require('process');
var sonicEndpoint = (process.env.SONIC_HOST || 'wss://0.0.0.0:443') + '/v1/query';
var util = require('./util');
var token;

function runSpecTests(client, id) {
  it(id + ' - should be able to run a simple query and stream the data back from the server', function(done) {
    var query = {
      query: '5',
      auth: token,
      config: {
        class: 'SyntheticSource',
        seed: 1000,
        'progress-delay': 10
      }
    };

    util.testHappyPath(client, query, 5, done);
  });

  it(id + ' - should return an error if source class is unknown', function(done) {
    var query = {
      query: '1',
      auth: token,
      config: {
        class: 'UnknownClass'
      }
    };

    util.expectError(client, query, done);
  });

  it(id + ' - should return an error if query or config is null', function(done) {
    var query = {
      query: null,
      auth: token,
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(id + ' - should return an error if config is null', function(done) {
    var query = {
      query: '1',
      auth: token,
      config: null
    };

    util.expectError(client, query, done);
  });

  it(id + ' - should return an error if source publisher completes stream with exception', function(done) {
    var query = {
      // signals source to throw expected exception
      query: '28',
      auth: token,
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(id + ' - should return an error if source throws an exception and terminates', function(done) {
    var query = {
      // signals source to throw unexpected exception
      query: '-1',
      auth: token,
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(id + ' - should stream a big payload correctly', function(done) {
    this.timeout(4000);
    var q = "";
    var i = 0;
    while (i < 10000) {
      q += 'aweqefekwljflwekfjkelwfjlwekjfeklwjflwekjfeklwjfeklfejklfjewlkfejwklw';
      i += 1;
    }

    var query = {
      query: q,
      auth: token,
      config: {
        class: 'SyntheticSource',
        'progress-delay': 0,
        size: 5
      }
    };

    util.testHappyPath(client, query, 5, done);
  });
}

describe('Sonicd ws', function() {

  var client = new Client(sonicEndpoint);

  runSpecTests(client, 'unauthenticated');

  it('should return an error if source requires authentication and user is unauthenticated', function(done) {
    var query = {
      query: '1',
      // tipically set server side, but also
      // valid to be passed client side
      config: {
        class: 'SyntheticSource',
        security: 2
      }
    };

    util.expectError(client, query, done);
  });


  describe('Sonicd ws auth', function() {

    it('should throw an error if api key is invalid', function(done) {
      client.authenticate('spec_tests', 'mariano', function(err) {
        if(err) {
          done();
        } else {
          done(new Error('did not return error on invalid api key'));
        }
      });
    });

    it('should authenticate user', function(done) {
      util.doAuthenticate(client, function(err, token) {
        if (err) {
          done(err);
          return;
        }
        done();
      });
    });
  });


  describe('Sonicd ws with authentication', function() {

    var authenticated = new Client(sonicEndpoint);

    before(function(done) {
      util.doAuthenticate(authenticated, function(err, t) {
        if (err) {
          done(err);
          return;
        }
        token = t;
        done();
      });
    });

    // client is authenticated
    runSpecTests(authenticated, 'authenticated');

    it('should allow an authenticated and authorized user to run a query on a secure source', function(done) {
      var query = {
        query: '5',
        auth: token,
        config: {
          class: 'SyntheticSource',
          security: 1
        }
      };

      util.testHappyPath(authenticated, query, 5, done);
    });

    it('should return error if an authenticated user but unauthorized user tries to run a query on a secured source', function(done) {
      var query = {
        query: '5',
        auth: token,
        config: {
          class: 'SyntheticSource',
          security: 2000
        }
      };

      util.expectError(authenticated, query, done);
    });

    it('should return error if an authenticated and authorized user from not a whitelisted IP tries to run a query on a secured source', function(done) {

      util.doAuthenticate(authenticated, function(err, token) {
        if (err) {
          done(err);
          return;
        }

        var query = {
          query: '5',
          auth: token,
          config: {
            class: 'SyntheticSource',
            security: 1
          }
        };
        util.expectError(authenticated, query, done);
        authenticated.close();
      }, 'only_from_ip'); // check server's reference.conf
    });
  });
});
