'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'public/app.html'), 'utf8');
const routeStart = serverSource.indexOf("app.get(['/app', '/app.html'],");
const staticStart = serverSource.indexOf("app.use(express.static(path.join(__dirname, 'public'),");

// Execute the real route registration without starting databases, sockets or
// network listeners. This checks both public entry paths and the real HTML.
function loadRoutes(defaultWorkspace) {
  assert.ok(routeStart >= 0, 'the dynamic app entry route exists');
  assert.ok(staticStart > routeStart, 'the dynamic route precedes public static file serving');
  const routes = new Map();
  const reads = [];
  vm.runInNewContext(serverSource.slice(routeStart, staticStart), {
    app: { get(paths, handler) { for (const url of paths) routes.set(url, handler); } },
    fs: { readFileSync(file, encoding) { reads.push({ file, encoding }); return appHtml; } },
    path,
    __dirname: root,
    process: { env: defaultWorkspace === undefined ? {} : { DEFAULT_WORKSPACE: defaultWorkspace } },
    require(name) {
      assert.equal(name, './package.json');
      return { version: '9.9.9-test' };
    },
  }, { filename: 'workspace-default-route.js' });
  function render(url) {
    const headers = new Map();
    const result = { headers };
    const res = {
      setHeader(name, value) { headers.set(name, value); },
      type(value) { result.type = value; return res; },
      send(value) { result.html = value; return res; },
    };
    const handler = routes.get(url);
    assert.equal(typeof handler, 'function', `${url} has a dynamic entry handler`);
    handler({ path: url, query: { workspace: 'original' } }, res);
    return result;
  }
  return { routes, reads, render };
}

test('both app entry URLs inject the IDE default before static serving and revalidate HTML', () => {
  const { routes, reads, render } = loadRoutes('ide');
  assert.deepEqual([...routes.keys()], ['/app', '/app.html']);
  for (const url of routes.keys()) {
    const result = render(url);
    assert.equal(result.headers.get('Cache-Control'), 'no-cache');
    assert.equal(result.type, 'html');
    assert.match(result.html, /<html\b[^>]*data-haven-default-workspace="ide"/);
    assert.equal((result.html.match(/data-haven-default-workspace=/g) || []).length, 1);
    assert.match(result.html, /data-haven-theme-api="1"/);
    assert.match(result.html, /\/js\/ide-workspace-entry\.js\?v=9\.9\.9-test/);
    assert.match(result.html, /\/css\/ide-workspace\.css\?v=9\.9\.9-test/);
  }
  assert.deepEqual(reads, [
    { file: path.join(root, 'public', 'app.html'), encoding: 'utf8' },
    { file: path.join(root, 'public', 'app.html'), encoding: 'utf8' },
  ]);
});

test('absent and unsupported workspace configuration cannot inject an HTML attribute', () => {
  for (const value of [undefined, '', 'original', 'IDE', 'true', 'ide" onload="alert(1)', '<script>unsafe</script>']) {
    const { render } = loadRoutes(value);
    for (const url of ['/app', '/app.html']) {
      const result = render(url);
      assert.doesNotMatch(result.html, /data-haven-default-workspace=/, `invalid default ${JSON.stringify(value)} on ${url}`);
      assert.doesNotMatch(result.html, /onload="alert\(1\)|<script>unsafe<\/script>/);
      assert.equal(result.headers.get('Cache-Control'), 'no-cache');
      assert.match(result.html, /\/js\/ide-workspace-entry\.js\?v=9\.9\.9-test/);
    }
  }
});
