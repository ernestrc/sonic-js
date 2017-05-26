/* eslint-env node, mocha */
const Client = require('../src/lib.js').Client;
const process = require('process');
const util = require('./util');

const sonicEndpoint = `${process.env.SONIC_HOST || 'wss://0.0.0.0:443'}/v1/query`;

let token;

function runSpecTests(client, id) {
  it(`${id} - should be able to run a simple query and stream the data back from the server`, (done) => {
    const query = {
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

  it(`${id} - should return an error if source class is unknown`, (done) => {
    const query = {
      query: '1',
      auth: token,
      trace_id: 'ballz0',
      config: {
        class: 'UnknownClass'
      }
    };

    util.expectError(client, query, done);
  });

  it(`${id} - should return an error if query is null`, (done) => {
    const query = {
      query: null,
      auth: token,
      trace_id: 'ballz1',
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(`${id} - should return an error if config is null`, (done) => {
    const query = {
      query: '1',
      trace_id: 'ballz2',
      auth: token,
      config: null
    };

    util.expectError(client, query, done);
  });

  it(`${id} - should return an error if source publisher completes stream with exception`, (done) => {
    const query = {
      // signals source to throw expected exception
      query: '28',
      auth: token,
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(`${id} - should return an error if source throws an exception and terminates`, (done) => {
    const query = {
      // signals source to throw unexpected exception
      query: '-1',
      auth: token,
      config: {
        class: 'SyntheticSource'
      }
    };

    util.expectError(client, query, done);
  });

  it(`${id} - should stream a big payload correctly`, function (done) {
    this.timeout(6000);
    let q = '';
    let i = 0;
    while (i < 10000) {
      q += 'aweqefekwljflwekfjkelwfjlwekjfeklwjflwekjfeklwjfeklfejklfjewlkfejwklw';
      i += 1;
    }

    const query = {
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

describe('Sonic ws', () => {
  const client = new Client(sonicEndpoint);

  runSpecTests(client, 'unauthenticated');

  it('should return an error if source requires authentication and user is unauthenticated', (done) => {
    const query = {
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


  describe('Sonic ws auth', () => {
    it('should throw an error if api key is invalid', (done) => {
      client.authenticate('spec_tests', 'mariano', (err) => {
        if (err) {
          done();
        } else {
          done(new Error('did not return error on invalid api key'));
        }
      });
    });

    it('should authenticate user', (done) => {
      util.doAuthenticate(client, (err, token) => {
        if (err) {
          done(err);
          return;
        }
        done();
      });
    });
  });

  runSpecTests(new Client(sonicEndpoint, { maxPoolSize: 1, minPoolSize: 1, maxTries: 1 }), 'single connection');

  describe('Sonic ws with authentication', () => {
    const authenticated = new Client(sonicEndpoint);

    before((done) => {
      util.doAuthenticate(authenticated, (err, t) => {
        if (err) {
          done(err);
          return;
        }
        token = t;
        done();
      });
    });

    after((done) => {
      authenticated.close();
      done();
    });

    // client is authenticated
    runSpecTests(authenticated, 'authenticated');

    it('should allow an authenticated and authorized user to run a query on a secure source', (done) => {
      const query = {
        query: '5',
        auth: token,
        config: {
          class: 'SyntheticSource',
          security: 1
        }
      };

      util.testHappyPath(authenticated, query, 5, done);
    });

    it('should return error if an authenticated user but unauthorized user tries to run a query on a secured source', (done) => {
      const query = {
        query: '5',
        auth: token,
        config: {
          class: 'SyntheticSource',
          security: 2000
        }
      };

      util.expectError(authenticated, query, done);
    });

    it('should return error if an authenticated and authorized user from not a whitelisted IP tries to run a query on a secured source', (done) => {
      util.doAuthenticate(authenticated, (err, token) => {
        if (err) {
          done(err);
          return;
        }

        const query = {
          query: '5',
          auth: token,
          config: {
            class: 'SyntheticSource',
            security: 1
          }
        };
        util.expectError(authenticated, query, done);
      }, 'only_from_ip'); // check server's reference.conf
    });
  });
});
