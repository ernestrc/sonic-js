const assert = require('chai').assert;

module.exports.testHappyPathSingle = (client, query, n, done) => {
  client.run(query, (err, data) => {
    if (err) {
      done(err);
      return;
    }
    if (data.length !== n) {
      done(new Error(`data was not ${n}`));
      return;
    }
    done();
  });
};

module.exports.testHappyPath = (client, query, n, _done) => {
  let count = 0;
  let ran, streamed, doned = false;
  let traceId;
  if (!_done) {
    throw new Error('needs _done to hook with test driver');
  }

  const debugTimer = setTimeout(() => {
    console.log(`count=${count}; run=${ran}; stream=${streamed}; doned=${doned}`);
  }, 3000);

  const done = (e) => {
    // guard against multiple calls to done() with err
    if (!doned) {
      doned = true;
      clearTimeout(debugTimer);
      _done(e);
    }
  };

  client.run(query, (err, data) => {
    ran = true;
    if (err) {
      done(err);
      return;
    }
    assert(data.length === n, `data was not${n}`);
    if (count === 1) {
      done();
    } else {
      count += 1;
    }
  });

  const stream = client.stream(query);

  stream.on('started', (id) => {
    traceId = id;
  });

  stream.on('error', (err) => {
    if (err) {
      done(err);
    } else {
      done(new Error('error emitted but no error returned!'));
    }
  });

  stream.on('done', (err) => {
    streamed = true;
    assert(typeof traceId !== 'undefined', 'traceId is undefined in stream done callback on `testHappyPath` test');
    if (err) {
      done(err);
    } else if (count === 1) {
      done();
    } else {
      count += 1;
    }
  });
};

module.exports.expectError = (client, query, _done) => {
  let count = 0;
  let ran, streamed, doned = false;

  if (!_done) {
    throw new Error('needs _done to hook with test driver');
  }

  const debugTimer = setTimeout(() => {
    console.log(`count=${count}; run=${ran}; stream=${streamed}; doned=${doned}`);
  }, 2000);

  const done = (e) => {
    // guard against multiple calls to done() with err
    if (!doned) {
      doned = true;
      clearTimeout(debugTimer);
      _done(e);
    }
  };

  client.run(query, (err) => {
    ran = true;
    if (err) {
      if (count === 1) {
        done();
      } else {
        count += 1;
      }
    } else {
      done(new Error('expected error but no error returned'));
    }
  });

  const stream = client.stream(query);

  stream.on('done', () => {
    done(new Error('stream emitted `done` but `error` expected'));
  });

  stream.on('error', (err) => {
    if (err) {
      streamed = true;
      if (count === 1) {
        done();
      } else {
        count += 1;
      }
    } else {
      done(new Error('expected error but no error returned'));
    }
  });
};

module.exports.doAuthenticate = (client, done, apiKeyMaybe) => {
  const apiKey = apiKeyMaybe || '1234';
  client.authenticate('spec_tests', apiKey, (err, token) => {
    if (err) {
      done(new Error('failed to authenticate'));
      return;
    }

    if (token) {
      done(null, token);
    } else {
      done(new Error('protocol error: no token received from server'));
    }
  });
};
