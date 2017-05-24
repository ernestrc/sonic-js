const BrowserWebSocket = global.MozWebSocket || global.WebSocket;
const WebSocket = BrowserWebSocket || require('ws'); // eslint-disable-line global-require
const EventEmitter = require('events');
const utils = require('./util');

const SonicMessage = utils.SonicMessage;
const noop = () => {};

// this is an ugly hack to prevent browseryfied `ws` module to throw errors at runtime
// because the EventEmitter API used in Node.js is not available with the WebSocket browser API
if (BrowserWebSocket) {
  WebSocket.prototype.on = function on(event, callback) {
    this[`on${event}`] = callback;
  };
}

function cancel(ws, _cb) {
  const cb = typeof _cb === 'function' ? _cb : noop;
  function doSend() {
    if (BrowserWebSocket) {
      try {
        ws.send(SonicMessage.CANCEL);
        cb();
      } catch (e) {
        cb(e);
      }
    } else {
      ws.send(SonicMessage.CANCEL, cb);
    }
  }
  if (ws.readyState === WebSocket.OPEN) {
    doSend();
  } else {
    ws.on('open', doSend);
  }
}

class SonicEmitter extends EventEmitter {}

class Client {
  constructor(sonicAddress) {
    this.url = sonicAddress;
    this.ws = [];
  }

  doSend(doneCb, outputCb, progressCb, metadataCb, startedCb) {
    const output = outputCb || noop;
    const progress = progressCb || noop;
    const metadata = metadataCb || noop;
    let isDone = false;
    let isError = false;

    return (message, ws) => {
      ws.send(message);

      const done = (err, id) => {
        let idx;

        ws.close(1000, 'completed');

        if ((idx = this.ws.indexOf(ws)) < 0) {
          throw new Error('ws not found');
        }

        this.ws.splice(idx, 1);

        doneCb(err, id);
      };

      const closedUnexp = () => {
        done(new Error('connection closed unexpectedly'));
      };

      ws.on('close', (ev) => {
      // browser
        if (BrowserWebSocket) {
          if (isError) {
            done(new Error(`WebSocket close code: ${ev.code}; reason: ${ev.reason}`));
          } else if (ev.code !== 1000 && !isDone) {
            closedUnexp();
          }

        // ws
        } else if (!isDone && ev !== 1000) {
          closedUnexp();
        }
      });

      ws.on('error', (ev) => {
      // ev is defined with `ws`, but not with the
      // browser's WebSocket API
        if (BrowserWebSocket) {
          isError = true;
        } else {
          isDone = true;
          done(ev);
        }
      });

      ws.on('message', (_message) => {
        const msg = BrowserWebSocket ? JSON.parse(_message.data) : JSON.parse(_message.toString('utf-8'));
        const checkMsg = () => {
          if (msg.v) {
            done(new Error(`Query with trace_id \`${msg.p.trace_id}\` failed: ${msg.v}`));
          } else {
            done(null);
          }
        };

        switch (msg.e) {
          case 'P':
            progress(utils.toProgress(msg.p));
            break;

          case 'D':
            isDone = true;
            if (BrowserWebSocket) {
              ws.send(SonicMessage.ACK);
              checkMsg();
            } else {
              ws.send(SonicMessage.ACK, checkMsg);
            }
            break;

          case 'T':
            metadata(msg.p.map(elem => [elem[0], typeof elem[1]]));
            break;

          case 'S':
            if (typeof startedCb !== 'undefined') {
              startedCb(msg.v);
            }
            break;

          case 'O':
            output(msg.p);
            break;

          default:
          // ignore to improve forwards compatibility
            break;
        }
      });
    };
  }

  send(message, doneCb, outputCb, progressCb, metadataCb, startedCb) {
    const ws = new WebSocket(this.url);
    const doExec = this.doSend(doneCb, outputCb, progressCb, metadataCb, startedCb);

    ws.on('open', () => {
      doExec(JSON.stringify(message), ws);
    });

    this.ws.push(ws);

    return ws;
  }

  stream(query) {
    const emitter = new SonicEmitter();
    const queryMsg = utils.toMsg(query);

    function done(err) {
      if (err) {
        emitter.emit('error', err);
        return;
      }

      emitter.emit('done');
    }

    function output(elems) {
      emitter.emit('data', elems);
    }

    function metadata(meta) {
      emitter.emit('metadata', meta);
    }

    function progress(prog) {
      emitter.emit('progress', prog);
    }

    function started(traceId) {
      emitter.emit('started', traceId);
    }

    const ws = this.send(queryMsg, done, output, progress, metadata, started);

    emitter.cancel = (cb) => {
      cancel(ws, cb);
    };

    return emitter;
  }

  run(query, doneCb) {
    const data = [];
    const queryMsg = utils.toMsg(query);

    function done(err) {
      if (err) {
        doneCb(err, null);
      } else {
        doneCb(null, data);
      }
    }

    function output(elems) {
      data.push(elems);
    }

    const ws = this.send(queryMsg, done, output);

    return {
      cancel(cb) {
        cancel(ws, cb);
      },
    };
  }

  authenticate(user, apiKey, doneCb, traceId) {
    let token;
    const authMsg = {
      e: 'H',
      p: {
        user,
        trace_id: traceId,
      },
      v: apiKey,
    };

    function done(err) {
      if (err) {
        doneCb(err, null);
      } else {
        doneCb(null, token);
      }
    }

    function output(elems) {
      token = elems[0];
    }

    this.send(authMsg, done, output);
  }

  close() {
    this.ws.map(cancel);
  }
}

module.exports.Client = Client;
