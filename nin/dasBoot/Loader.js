function Loader() {
  this.eventNames = {
    VIDEO: 'canplaythrough',
    AUDIO: 'canplaythrough',
    IMG: 'load'
  };
  this.itemsToAjax = [];
  this.itemsToLoad = [];
  this.id = Math.random();
};

Loader.rootPath = '';

Loader.setRootPath = function(path) {
      Loader.rootPath = path;
};

Loader.prototype.loadAjax = function(filepath, callback) {
  this.itemsToAjax.push({
    filepath: filepath,
    callback: callback
  });
};

Loader.prototype.loadTexture = function(filepath, callback) {
  var image = new Image();
  var texture = new THREE.Texture();
  texture.image = image;
  texture.sourceFile = filepath;
  this.load(filepath, image, function() {
    texture.needsUpdate = true;
    callback && callback();
  });
  return texture;
};

Loader.prototype.load = function(filepath, element, callback) {
  console.log(this.id, 'pushing onto load stack', filepath);
  this.itemsToLoad.push({
    filepath: filepath,
    element: element,
    callback: callback
  });
};

Loader.prototype.start = function(onprogress, oncomplete) {
  var maxWaitingCount = this.itemsToAjax.length + this.itemsToLoad.length;
  var waitingCount = maxWaitingCount;
  var that = this;
  function registerAsLoaded(item) {
    onprogress(100 - waitingCount / maxWaitingCount * 100);
    console.log(that.id, 'finished loading', item.filepath);
    if(!--waitingCount) {
      that.itemsToLoad.length = 0;
      that.itemsToAjax.length = 0;
      console.log(that.id, 'all loading finished for this run');
      oncomplete();  
    }
  }
  var that = this;
  this.itemsToLoad.forEach(function(item) {
    var eventName = that.eventNames[item.element.tagName];
    item.element.addEventListener(eventName, listener);
    function listener() {
      item.element.removeEventListener(eventName, listener);
      item.callback && item.callback(); 
      registerAsLoaded(item); 
    };

    if(window.FILES) {
      var prefix = {
        'jpg': 'data:image/jpg;base64,',
        'jpeg': 'data:image/jpg;base64,',
        'png': 'data:image/png;base64,',
        'mp3': 'data:audio/mp3;base64,',
        'mp4': 'data:video/mp4;base64,',
        'svg': 'data:image/svg+xml;base64,',
      }[item.filepath.slice(-3)];
      console.log(that.id, item.filepath, prefix + (FILES[item.filepath] && FILES[item.filepath].slice(0, 10)));
      item.element.src = prefix + FILES[item.filepath];
    } else {
      item.element.crossOrigin = 'Anonymous';
      item.element.src = Loader.rootPath + item.filepath + '?_=' + Math.random();
    }
  });

  this.itemsToAjax.forEach(function(item) {
    if(window.FILES) {
      console.log(that.id, item.filepath, FILES[item.filepath] && atob(FILES[item.filepath]).slice(0, 10));
      item.callback(atob(FILES[item.filepath]));
      registerAsLoaded(item); 
    } else {
      var response = null;
      var request = new XMLHttpRequest();
      request.open('GET', Loader.rootPath + item.filepath, 1);
      request.onload = function() {
        item.callback(request.responseText);
        registerAsLoaded(item);
      }
      request.send();
    }
  });
};

Loader.nextLoader = new Loader();

Loader.load = function(filepath, element, callback) {
  return Loader.nextLoader.load(filepath, element, callback);
};

Loader.loadAjax = function(filepath, callback) {
  return Loader.nextLoader.loadAjax(filepath, callback);
};

Loader.loadTexture = function(filepath, callback) {
  return Loader.nextLoader.loadTexture(filepath, callback);
};

Loader.start = function(onprogress, oncomplete) {
  Loader.nextLoader.start(onprogress, oncomplete); 
  Loader.nextLoader = new Loader();
};
