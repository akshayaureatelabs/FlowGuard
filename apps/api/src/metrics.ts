const startedAt = Date.now();
let requestsTotal = 0;
let runsStarted = 0;
let runsFinished = 0;

export function trackRequest() {
  requestsTotal += 1;
}

export function trackRunStarted() {
  runsStarted += 1;
}

export function trackRunFinished() {
  runsFinished += 1;
}

export function getMetrics() {
  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    requestsTotal,
    runsStarted,
    runsFinished,
  };
}
