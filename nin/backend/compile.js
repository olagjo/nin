const chalk = require('chalk');
const glob = require('glob');
const closureCompiler = require('google-closure-compiler-js');
const compress = require('./compress').compress;
const fs = require('fs');
const mkdirp = require('mkdirp');
const OptiPng = require('optipng');
const p = require('path');
const projectSettings = require('./projectSettings');
const rmdir = require('rimraf');
const shaderGen = require('./shadergen').shaderGen;
const stream = require('stream');
const utils = require('./utils');
const walk = require('walk');


function moveCursorToColumn(col) {
  return '\x1B[' + col + 'G';
}

function renderOK() {
  console.log(moveCursorToColumn(72) +
    chalk.grey('[') + chalk.green('✔️ OK') + chalk.grey(']'));
}

function renderWarn() {
  console.log(moveCursorToColumn(70) +
    chalk.grey('[') + chalk.yellow('⚠️ WARN') + chalk.grey(']'));
}

function renderError() {
  console.log(moveCursorToColumn(69) +
    chalk.grey('[') + chalk.red('❌ ERROR') + chalk.grey(']'));
}

function res(projectPath, options, callback) {
  const walker = walk.walk(projectPath + '/res/' , {followLinks: false});
  const files = [];
  console.log(chalk.yellow('\nCollecting files from res/'));
  walker.on('file', function(root, stat, next) {

    /* hacks to ensure slashes in path are correct.
     * TODO: is there a bug in walker that causes
     * these things to happen?  */
    root += '/';
    root = root.replace(/\/\//g, '/');

    const file = fs.readFileSync(root + stat.name);
    process.stdout.write('- Assimilating ' + chalk.grey(root.slice(projectPath.length + 1)) + chalk.magenta(stat.name));
    function pushFinishedFile(file) {
      files.push('FILES[\'' + root.slice(projectPath.length + 1) + stat.name + '\']=\'' +
        file.toString('base64') + '\'');
      renderOK();
      next();
    }
    if(options.optimizePngAssets && stat.name.slice(-4).toLowerCase() == '.png') {
      const chunks = [];
      const s = new stream.Readable();
      s.push(file);
      s.push(null);

      const pngOptimizer = new OptiPng(['-o7']);
      s.pipe(pngOptimizer).on('data', data => {
        chunks.push(data);
      }).on('end', () => {
        const newFile = Buffer.concat(chunks);
        const percentage = (((file.length / newFile.length - 1) * 10000) | 0) / 100;
        process.stdout.write(
            `\n    OptiPng: saved ` +
            chalk.cyan(`${(file.length - newFile.length) / 1024 | 0}KB`) + 
            ' (' +
            chalk.green(`${percentage}%`) + ' reduction)');
        pushFinishedFile(newFile);
      });
    } else {
      pushFinishedFile(file);
    }
  });
  walker.on('end', function(){
    process.stdout.write(chalk.yellow('\nMerging assimilated files'));
    callback('FILES={};' + files.join(';') + ';');
    renderOK();
  });
}

const compile = function(projectPath, options) {
  function collect(data) {
    function writeDemoToFile(data, filename) {
      const binPath = p.join(projectPath, '/bin/');
      mkdirp(binPath, function() {
        fs.writeFileSync(projectPath + '/bin/' + filename, data);
      });
    }

    const {
      projectSettings,
      projectVersion,
      projectOrigin,
    } = utils.getProjectMetadata(projectPath);

    const ninMeta = utils.getNinMetadata();

    const metadata = {
      'Title': projectSettings.title,
      'Author': projectSettings.authors.join(', '),
      'Description': projectSettings.description,
      'Creation time': '' + new Date(),
      'Software': `${projectVersion} @ ${projectOrigin}\n${ninMeta.name}@${ninMeta.version} from ${ninMeta.origin}`,
      previewImage: projectSettings.previewImage
    };

    const metadataAsHTMLComments = Object.keys(metadata)
      .map(key => `<!-- ${key}: ${metadata[key]} -->`)
      .join('\n');

    const ogTags =
      `<meta property="og:title" content="${utils.unsafeHTMLEscape(metadata.Title)}" />
      <meta property="og:description" content="${utils.unsafeHTMLEscape(metadata.Description)}" />
      <meta property="og:image" content="${metadata.previewImage}" />
      <meta name="author" content="${utils.unsafeHTMLEscape(metadata.Author)}" />`;

    const htmlPreamble =
      fs.readFileSync(projectPath + '/index.html', {encoding: 'utf8'})
      .replace(
        'NIN_WILL_REPLACE_THIS_TAG_WITH_YOUR_ANALYTICS_ID',
        projectSettings.googleAnalyticsID)
      .replace(
        'NIN_WILL_REPLACE_THIS_TAG_WITH_AUTOGENERATED_COMMENT_TAGS',
        metadataAsHTMLComments)
      .replace(
        'NIN_WILL_REPLACE_THIS_TAG_WITH_AUTOGENERATED_META_TAGS',
        ogTags);

    process.stdout.write(chalk.yellow('\nCompressing demo to .png.html'));
    compress(projectPath, data, htmlPreamble, metadata, function(data) {
      renderOK();
      writeDemoToFile(data, 'demo.png.html');
      console.log(chalk.white('\n★ ---------------------------------------- ★'));
      console.log(chalk.white('| ') +
        chalk.green('Successfully compiled ') +
          chalk.grey('bin/') +
          chalk.green('demo.png.html!') +
          chalk.white(' |'));
      console.log(chalk.white('★ ---------------------------------------- ★\n'));
    });

    const html =
      htmlPreamble +
      '<script>' +
      'GU=1;' + /* hack to make sure GU exisits from the get-go */
      'BEAN=0;' +
      'BEAT=false;' +
      data +
      'var graph = JSON.parse(atob(FILES["res/graph.json"]));' +
      'demo=bootstrap({graph:graph, onprogress: ONPROGRESS, oncomplete: ONCOMPLETE});' +
      '</script>';
    writeDemoToFile(html, 'demo.html') +
      process.stdout.write('Successfully compiled demo.html!\n');
  }
  res(projectPath, options, function(data) {
    const genPath = p.join(projectPath, '/gen/');
    rmdir(genPath, function() {
      mkdirp(genPath, function() {
        fs.writeFileSync(projectPath + '/gen/files.js', new Buffer(data));
        projectSettings.generate(projectPath);
        shaderGen(projectPath, function() {
          process.stdout.write(chalk.yellow('\nRunning closure compiler'));
          const globPaths = [
            __dirname + '/../dasBoot/lib/*.js',
            __dirname + '/../dasBoot/*.js',
            projectPath + '/lib/*.js ',
            projectPath + '/gen/*.js ',
            projectPath + '/src/*.js',
          ];
          const jsCode = [].concat.apply(
            [], globPaths.map(globPath => glob.sync(globPath)))
            .map(path => ({
              src: fs.readFileSync(path, 'utf8'),
              path
            }));
          const out = closureCompiler.compile({
            jsCode: jsCode
          });
          if(out.errors.length) {
            renderError();
            out.errors.map(console.error);
            process.exit(1);
          } else if(out.warnings.length) {
            renderWarn();
            out.warnings.map(console.error);
          } else {
            renderOK();
          }
          collect(out.compiledCode);
        });
      });
    });
  });
};


module.exports = {compile: compile};
