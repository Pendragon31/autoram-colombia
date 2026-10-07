// Match the declaration, so a documentation/comment mention cannot consume it.
module.exports = function workerCode(template, assets, buildId) {
  return template.replace('__VERSION__', buildId).replace('const ASSETS = __ASSETS__;', `const ASSETS = ${JSON.stringify(assets)};`);
};
