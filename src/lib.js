'use strict';

var BrowserWebSocket = global.MozWebSocket || global.WebSocket;
var WebSocket =  BrowserWebSocket || require('ws');
var EventEmitter = require('events');
var util = require('util');
var utils = require('./util');
var noop = function() {};

// this is an ugly hack to prevent browseryfied `ws` module to throw errors at runtime
// because the EventEmitter API used in Node.js is not available with the WebSocket browser API
if (BrowserWebSocket) {
  WebSocket.prototype.on = function(event, callback) {
    this['on' + event] = callback;
  };
}

function cancel(ws, _cb) {
  var cb = typeof _cb === 'function' ? _cb : noop;
  function doSend() {
    if (BrowserWebSocket) {
      try {
        ws.send(JSON.stringify({ e: 'C' }));
        cb();
      } catch (e) {
        cb(e);
      }
    } else {
      ws.send(JSON.stringify({ e: 'C' }), cb);
    }
  }
  if (ws.readyState === WebSocket.OPEN) {
    doSend();
  } else {
    ws.on('open', doSend);
  }
}

function Client(sonicAddress) {
  this.url = sonicAddress;
  this.ws = [];
}

function SonicEmitter() {
  EventEmitter.call(this);
}

util.inherits(SonicEmitter, EventEmitter);

Client.prototype.send = function(doneCb, outputCb, progressCb, metadataCb, startedCb) {
  var output = outputCb || (function() {});
  var progress = progressCb || (function() {});
  var metadata = metadataCb || (function() {});
  var isDone = false;
  var isError = false;
  var self = this;

  return function(message, ws) {

    ws.send(message);

    function done(err, id) {
      var idx;

      ws.close(1000, 'completed');

      if ((idx = self.ws.indexOf(ws)) < 0) {
        throw new Error('ws not found');
      }

      self.ws.splice(idx, 1);

      doneCb(err, id);
    }

    function closedUnexp() {
      done(new Error('connection closed unexpectedly'));
    }

    ws.on('close', function(ev) {
      // browser
      if (BrowserWebSocket) {
        if (isError) {
          done(new Error('WebSocket close code: ' + ev.code + '; reason: ' + ev.reason));
        } else if (ev.code !== 1000 && !isDone) {
          closedUnexp();
        }

        // ws
      } else if (!isDone && ev !== 1000) {
        closedUnexp();
      }
    });

    ws.on('error', function(ev) {
      // ev is defined with `ws`, but not with the
      // browser's WebSocket API
      if (BrowserWebSocket) {
        isError = true;
      } else {
        isDone = true;
        done(ev);
      }
    });

    ws.on('message', function(message) {
      var msg = BrowserWebSocket ? JSON.parse(message.data) : JSON.parse(message.toString('utf-8'));
      function checkMsg() {
        if (msg.v) {
          done(new Error('Query with trace_id `' + msg.p.trace_id + '` failed: ' + msg.v));
        } else {
          done(null);
        }
      }

      switch (msg.e) {
        case 'P':
          progress(utils.toProgress(msg.p));
          break;

        case 'D':
          isDone = true;
          if (BrowserWebSocket) {
            ws.send(JSON.stringify({ e: 'A' }));
            checkMsg();
          } else {
            ws.send(JSON.stringify({ e: 'A' }), checkMsg);
          }
          break;

        case 'T':
          metadata(msg.p.map(function(elem) {
            return [elem[0], typeof elem[1]];
          }));
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
};

Client.prototype.exec = function(message, doneCb, outputCb, progressCb, metadataCb, startedCb) {

  var ws = new WebSocket(this.url);
  var doExec = this.send(doneCb, outputCb, progressCb, metadataCb, startedCb);

  ws.on('open', function() {
    doExec(JSON.stringify(message), ws);
  });

  this.ws.push(ws);

  return ws;
};

Client.prototype.stream = function(query) {
  var emitter = new SonicEmitter();
  var queryMsg = utils.toMsg(query);
  var ws;

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

  ws = this.exec(queryMsg, done, output, progress, metadata, started);

  emitter.cancel = function(cb) {
    cancel(ws, cb);
  };

  return emitter;
};

Client.prototype.run = function(query, doneCb) {

  var data = [];
  var queryMsg = utils.toMsg(query);
  var ws;

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

  ws = this.exec(queryMsg, done, output);

  return {
    cancel: function(cb) {
      cancel(ws, cb);
    }
  };
};

Client.prototype.authenticate = function(user, apiKey, doneCb, traceId) {
  var token;
  var authMsg = {
    e: 'H',
    p: {
      user: user,
      trace_id: traceId
    },
    v: apiKey
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

  this.exec(authMsg, done, output);
};

Client.prototype.close = function() {
  this.ws.forEach(cancel);
};

module.exports.Client = Client;
