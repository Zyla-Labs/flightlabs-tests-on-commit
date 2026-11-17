const fs = require('fs');
const path = require('path');

const pending = [];
let specStartedAt = 0;

const samePath = (left, right) =>
  String(left || '').replace(/\\/g, '/').toLowerCase() ===
  String(right || '').replace(/\\/g, '/').toLowerCase();

const walk = (suite, file, payloads) => {
  const suiteFile = suite.file || file;

  (suite.tests || []).forEach((test) => {
    if (test.state !== 'failed') return;

    const index = payloads.findIndex(
      (payload) => samePath(payload.spec, suiteFile) && payload.fullTitle === test.fullTitle
    );
    if (index === -1) return;

    const match = payloads.splice(index, 1)[0];
    test.context = JSON.stringify(
      match.requests.map((line) => ({ title: 'request', value: line })),
      null,
      2
    );
  });

  (suite.suites || []).forEach((child) => walk(child, suiteFile, payloads));
};

const applyPayloads = (report, payloads) => {
  const remaining = payloads.slice();
  (report.results || []).forEach((root) => walk(root, root.file, remaining));
  return remaining.length !== payloads.length;
};

const htmlEscape = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const writeReport = (file, report) => {
  fs.writeFileSync(file, JSON.stringify(report));

  const htmlFile = file.replace(/\.json$/, '.html');
  if (!fs.existsSync(htmlFile)) return;

  const html = fs.readFileSync(htmlFile, 'utf8');
  if (!html.includes('data-raw="')) return;

  const next = html.replace(/data-raw="[^"]*"/, `data-raw="${htmlEscape(JSON.stringify(report))}"`);
  fs.writeFileSync(htmlFile, next);
};

const mentionsSpec = (report, spec) => {
  let found = false;

  const visit = (suite, file) => {
    const suiteFile = suite.file || file;
    if (samePath(suiteFile, spec)) found = true;
    (suite.suites || []).forEach((child) => visit(child, suiteFile));
  };

  (report.results || []).forEach((root) => visit(root, root.file));
  return found;
};

const patchReports = async (reportDir, spec, payloads) => {
  const dir = path.resolve(reportDir);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!fs.existsSync(dir)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    const candidates = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const file = path.join(dir, name);
        return { file, mtime: fs.statSync(file).mtimeMs };
      })
      .filter((entry) => entry.mtime >= specStartedAt - 1000)
      .sort((left, right) => right.mtime - left.mtime);

    const match = candidates.find((entry) => {
      const report = JSON.parse(fs.readFileSync(entry.file, 'utf8'));
      entry.report = report;
      return mentionsSpec(report, spec);
    });

    if (match && applyPayloads(match.report, payloads)) {
      writeReport(match.file, match.report);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

const registerFailedRequestReport = (on, config) => {
  on('task', {
    recordFailedRequests(payload) {
      pending.push(payload);
      return null;
    }
  });

  on('before:spec', () => {
    specStartedAt = Date.now();
  });

  on('after:spec', async (spec) => {
    const reportDir = config.reporterOptions && config.reporterOptions.reportDir;
    if (!reportDir) return;

    const mine = pending.filter((payload) => samePath(payload.spec, spec.relative));
    if (!mine.length) return;

    await patchReports(reportDir, spec.relative, mine);
    mine.forEach((payload) => {
      const index = pending.indexOf(payload);
      if (index !== -1) pending.splice(index, 1);
    });
  });
};

module.exports = { registerFailedRequestReport };
