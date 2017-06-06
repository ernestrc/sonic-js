function toMsg(query) {
	var traceId = query.trace_id || query.traceId;
	var token = query.token || query.auth;
	return {
		e: 'Q',
		v: query.query,
		p: {
			auth: token,
			trace_id: traceId,
			config: query.config
		}
	};
}

function toProgress(payload) {
	var status;

	switch (payload.s) {
	case 0:
		status = 'Queued';
		break;

	case 1:
		status = 'Started';
		break;

	case 2:
		status = 'Running';
		break;

	case 3:
		status = 'Waiting';
		break;

	case 4:
		status = 'Finished';
		break;

	default:
		status = 'Unknown';
		break;
	}

	return {
		status: status,
		statusCode: payload.s,
		progress: payload.p,
		total: payload.t,
		units: payload.u
	};
}

function getCloseError(ev) {
	return new Error(`WebSocket close: code=${ev.code}; reason=${ev.reason}`);
}

module.exports = {
	getCloseError,
	toMsg,
	toProgress,
	SonicMessage: {
		ACK: JSON.stringify({ e: 'A' }),
		CANCEL: JSON.stringify({ e: 'C' })
	}
};
