/**
 * CSInterface - Adobe CEP Extension Bridge for After Effects
 */
function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.evalScript(script, callback || function() {});
  } else {
    console.warn('[CSInterface Mock AE] evalScript called in browser:', script);
    if (callback) callback('{"status":"mock_success","message":"Script executed in mock mode"}');
  }
};

CSInterface.prototype.getHostEnvironment = function() {
  if (window.__adobe_cep__) {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
  }
  return {
    appName: "AEFT",
    appVersion: "26.0.0",
    appLocale: "en_US"
  };
};

if (typeof module !== 'undefined') {
  module.exports = CSInterface;
}

