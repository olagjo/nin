var fs = require('fs');
var walk = require('walk');


var shaderGen = function(cb) {

  function getShaderData(path, type) {
    var data = '';
    if(fs.existsSync(path)) {
      data = fs.readFileSync(path, 'utf8');
    } else {
      data = fs.readFileSync('dasBoot/shaders/default/' + type, 'utf8');
    }

    return data;
  }

  function traversePath(path, callback) {
    var walker = walk.walk(path, {followLinks: false});
    walker.on('directories', function(root, stat, next) {
      for(var i = 0; i < stat.length; i++) {
        directories.push(stat[i].name);
      }
      next();
    });

    walker.on('end', function() {
      var path = '';
      var tmpData = '';
      var type = '';
      for(var i = 0; i < directories.length; i++) {
        console.log('compiling shader', directories[i]);
        out += 'SHADERS.' + directories[i] + ' = {';

        type = '/uniforms.json';
        path = 'test-project/src/shaders/' + directories[i] + type;
        tmpData = getShaderData(path, type);
        out += 'uniforms: ' + tmpData + ',';

        type = '/vertex.glsl';
        path = 'test-project/src/shaders/' + directories[i] + type;
        tmpData = getShaderData(path, type);
        out += 'vertexShader: ' + JSON.stringify(tmpData) + ',';

        type = '/fragment.glsl';
        path = 'test-project/src/shaders/' + directories[i] + type;
        tmpData = getShaderData(path, type);
        out += 'fragmentShader: ' + JSON.stringify(tmpData) + '';

        out += '};\n';
      }
      directories = [];
      callback();
    });
  }

  var directories = [];
  var out = 'SHADERS={};';

  traversePath('test-project/src/shaders/', function() {
    traversePath('dasBoot/shaders/', function() {
      fs.writeFileSync('test-project/gen/shaders.js', out);
    });
  });
}

module.exports = { shaderGen: shaderGen };