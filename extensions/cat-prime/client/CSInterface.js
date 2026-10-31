/**
 * CSInterface - Adobe CEP Extension Bridge (v11.0.0 Compatible)
 */
function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.evalScript(script, callback || function() {});
  } else {
    console.warn('[CSInterface Mock] evalScript called in browser:', script);
    if (callback) callback('{"status":"mock_success"}');
  }
};

CSInterface.prototype.getHostEnvironment = function() {
  if (window.__adobe_cep__) {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
  }
  return {
    appName: "PPRO",
    appVersion: "26.0.0",
    appLocale: "en_US"
  };
};

CSInterface.prototype.closeExtension = function() {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.closeExtension();
  }
};

if (typeof module !== 'undefined') {
  module.exports = CSInterface;
}

