/*
    Backbone.js 1.3.3

    (c) 2010-2017 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
    Backbone may be freely distributed under the MIT license.
    For all details and documentation:
    http://backbonejs.org

    将代码注释整理翻译并加入自己的一些评论
    作者：聂小涛 
    Github:https://github.com/aircloud
    邮箱：networknxt@gmail.com
    遵循署名•相同方式共享4.0国际协议

*/

(function(factory) {

  //这里的root是代表全局对象，self实际上指的是window，用于前端环境，global则是服务端nodejs的全局对象
  //根据查证，我们可以认为window和self是等价的，slef所占字节数比较少可能算是一个优势
  var root = (typeof self == 'object' && self.self === self && self) ||
            (typeof global == 'object' && global.global === global && global);

  //AMD的加载规范，我们可以看出backbone是依赖jquery和underscore的
  //笔者曾经fork过一个underscore的代码解析：https://github.com/aircloud/underscore-analysis
  if (typeof define === 'function' && define.amd) {
    define(['underscore', 'jquery', 'exports'], function(_, $, exports) {
      //AMD的具体写法，这里不过多讲述
      root.Backbone = factory(root, exports, _, $);
    });

  //nodejs或者CommonJS的加载规范，这里jQuery需要当作一个模块来加载
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore'), $;
    try { $ = require('jquery'); } catch (e) {}
    factory(root, exports, _, $);

  //普通的浏览器端加载方式
  } else {
    root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
  }

})(function(root, Backbone, _, $) {

  // 一些初始化操作
  // -------------

  // backbone的冲突处理会用到这个变量
  var previousBackbone = root.Backbone;

  // 简化以后对这个数组方法的引用
  var slice = Array.prototype.slice;

  // 版本号
  Backbone.VERSION = '1.3.3';

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = $;

  // 防止冲突变量的解决方案，模仿了jQuery的写法(实际上，如果你选用了backbone，这种情况不算经常出现)
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  /*
    如果你想在不支持Backbone的默认REST/ HTTP方式的Web服务器上工作， 您可以选择开启Backbone.emulateHTTP。 
    设置该选项将通过 POST 方法伪造 PUT，PATCH 和 DELETE 请求 用真实的方法设定X-HTTP-Method-Override头信
    息。 如果支持emulateJSON，此时该请求会向服务器传入名为 _method 的参数。
  */
  Backbone.emulateHTTP = false;

  /*
    如果你想在不支持发送 application/json 编码请求的Web服务器上工作，设置Backbone.emulateJSON = true;
    将导致JSON根据模型参数进行序列化， 并通过application/x-www-form-urlencoded MIME类型来发送一个伪造HTML表单请求
  */
  Backbone.emulateJSON = false;

  /*
    这个函数和下面的函数的作用是将underscore中的方法加入到具体的对象(实际上是类)中,后文中只有两次调用addUnderscoreMethods方法：
    一次是给model添加方法，一次是给collection添加方法
  */
  var addMethod = function(length, method, attribute) {
    //underscore中的一个比较好的设计是，在不同的方法中，如果参数个数相同，那么每一个参数代表的意义都是相同的
    //所以这里我们仅仅根据参数个数进行区分即可
    switch (length) {
      case 1: return function() {
        return _[method](this[attribute]);
      };
      case 2: return function(value) {
        return _[method](this[attribute], value);
      };
      case 3: return function(iteratee, context) {
        return _[method](this[attribute], cb(iteratee, this), context);
      };
      case 4: return function(iteratee, defaultVal, context) {
        return _[method](this[attribute], cb(iteratee, this), defaultVal, context);
      };
      default: return function() {
        var args = slice.call(arguments);
        args.unshift(this[attribute]);
        return _[method].apply(_, args);
      };
    }
  };
  var addUnderscoreMethods = function(Class, methods, attribute) {
    _.each(methods, function(length, method) {
      if (_[method]) Class.prototype[method] = addMethod(length, method, attribute);
    });
  };

  /*
    支持`collection.sortBy('attr')` 或者 `collection.findWhere({id: 1})` 这种调用方式.
    这个函数的作用是，由于underscore的迭代器要求都是函数，这里我们这样写处理掉了不是函数的情况
    笔者认为这里可以称作适配器模式的一个应用，这实际上产生了语法糖，给用户提供了方便。
  */ 
  var cb = function(iteratee, instance) {
    if (_.isFunction(iteratee)) return iteratee;
    if (_.isObject(iteratee) && !instance._isModel(iteratee)) return modelMatcher(iteratee);
    if (_.isString(iteratee)) return function(model) { return model.get(iteratee); };
    return iteratee;
  };
  var modelMatcher = function(attrs) {
    var matcher = _.matches(attrs);
    return function(model) {
      return matcher(model.attributes);
    };
  };

  //Backbone.Events
  //---------------
  //Backbone事件部分
  /*
    Backbone的Events实际上就是一个观察者模式(发布订阅模式)的实现，并且巧妙的是，还可以作为mixin混入到自己写的object中，
    当然，Backbone自身也用了，所以这个Events的实现是放在前面的。

  //     mixin example： 
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //

    另外需要注意的是，由于之后需要进行对象整合，所以这里的Events对象可以理解为会被变成被调用的对象上下文
  */
  //初始化Events,js中的对象是按引用传递的,因此这样写比较方便
  var Events = Backbone.Events = {};

  // Regular expression used to split event strings.
  //匹配一次或多次(至少一次)空白字符，包括空格、制表符、换页符和换行符
  var eventSplitter = /\s+/;

  /*
    eventsApi这个api起到一个分流的作用，设计的非常有趣，导致添加的时候以下写法都是合法的：

    1.传入一个名称，回调函数的对象
    model.on({ 
        "change": on_change_callback,
        "remove": on_remove_callback
    });  

    2.使用空格分割的多个事件名称绑定到同一个回调函数上
    model.on("change remove", common_callback);  

  */
  var eventsApi = function(iteratee, events, name, callback, opts) {
    var i = 0, names;
    if (name && typeof name === 'object') {
      //处理上面第一种写法
      //这里`void 0`代表undefined
      if (callback !== void 0 && 'context' in opts && opts.context === void 0) opts.context = callback;
      for (names = _.keys(name); i < names.length ; i++) {
        events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
      }
    } else if (name && eventSplitter.test(name)) {
      //处理上面第二种写法
      for (names = name.split(eventSplitter); i < names.length; i++) {
        events = iteratee(events, names[i], callback, opts);
      }
    } else {
      //最简单的写法
      events = iteratee(events, name, callback, opts);
    }
    return events;
  };

  //用于绑定事件的函数
  Events.on = function(name, callback, context) {
    return internalOn(this, name, callback, context);
  };

  // Guard the `listening` argument from the public API.
  var internalOn = function(obj, name, callback, context, listening) {
    obj._events = eventsApi(onApi, obj._events || {}, name, callback, {
      context: context,
      ctx: obj,
      listening: listening
    });

    //listening用于监听对象,结合下文注释看
    if (listening) {
      var listeners = obj._listeners || (obj._listeners = {});
      listeners[listening.id] = listening;
    }

    return obj;
  };

  /*
    用于一个对象监听另外一个对象的事件，比如，B对象上面发生b事件的时候，通知A调用回调函数
    A.listenTo(B, “b”, callback);
    当然，实际上这个用on来写也是可行的
    B.on(“b”, callback, A);
  */

  Events.listenTo = function(obj, name, callback) {
    if (!obj) return this;
    //_.uniqueId:为需要的客户端模型或DOM元素生成一个全局唯一的id,这个id以l开头，这个id在触发的时候会被用到
    var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
    //this._listeningTo存放当前对象的所有的监听对象事件,按照键值对存储
    var listeningTo = this._listeningTo || (this._listeningTo = {});
    var listening = listeningTo[id];

    // This object is not listening to any other events on `obj` yet.
    // Setup the necessary references to track the listening callbacks.
    if (!listening) {
      var thisId = this._listenId || (this._listenId = _.uniqueId('l'));
      listening = listeningTo[id] = {obj: obj, objId: id, id: thisId, listeningTo: listeningTo, count: 0};
    }

    // Bind callbacks on obj, and keep track of them on listening.
    internalOn(obj, name, callback, this, listening);
    return this;
  };

  /*
    这个api的作用是给具体的某一个事件的回调函数队列增加一个回调函数
    这个添加的回调函数实际上是不区分到底是on添加的还是listento添加的，都是通过上下文进行区分的
  */
  var onApi = function(events, name, callback, options) {
    if (callback) {
      var handlers = events[name] || (events[name] = []);
      var context = options.context, ctx = options.ctx, listening = options.listening;
      if (listening) listening.count++;

      handlers.push({callback: callback, context: context, ctx: context || ctx, listening: listening});
    }
    return events;
  };

  /*
    与on不同，off的三个参数都是可选的
    • 如果没有任何参数，off相当于把对应的_events对象整体清空 
    • 如果有name参数但是没有具体指定哪个callback的时候，则把这个name(事件)对应的回调队列全部清空
    • 如果还有进一步详细的callback和context，那么这个时候移除回调函数非常严格，必须要求上下文和原来函数完全一致
  */
  Events.off = function(name, callback, context) {
    if (!this._events) return this;
    this._events = eventsApi(offApi, this._events, name, callback, {
      context: context,
      listeners: this._listeners
    });
    return this;
  };

  //对应上文的listening，解绑对另外一个对象的事件监听,这里面的this上下文应该是监听者,而不是被监听者
  Events.stopListening = function(obj, name, callback) {
    var listeningTo = this._listeningTo;
    if (!listeningTo) return this;

    //如果没有指定obj,就解绑所有的对别的对象的事件监听，如果指定了obj,就解绑对应obj的
    var ids = obj ? [obj._listenId] : _.keys(listeningTo);

    for (var i = 0; i < ids.length; i++) {
      var listening = listeningTo[ids[i]];

      // 这里进行检查,如果压根就没有监听，实际上说明用这个函数是多此一举的，这里直接break就好(而不是continue)
      if (!listening) break;

      //这里直接用了off方法,并传递正确的this上下文(为监听者)
      listening.obj.off(name, callback, this);
    }
    return this;
  };

  // The reducing API that removes a callback from the `events` object.
  var offApi = function(events, name, callback, options) {
    if (!events) return;

    var i = 0, listening;
    var context = options.context, listeners = options.listeners;

    /*
      如果没有指定三者,实际上是删除监听对象之后清空_events
    */
    if (!name && !callback && !context) {
      var ids = _.keys(listeners);//所有监听它的对应的属性
      for (; i < ids.length; i++) {
        listening = listeners[ids[i]];
        delete listeners[listening.id];
        delete listening.listeningTo[listening.objId];
      }
      return;
    }

    var names = name ? [name] : _.keys(events);
    for (; i < names.length; i++) {
      name = names[i];
      var handlers = events[name];

      //如果没有回调函数，直接break
      if (!handlers) break;

      // Replace events if there are any remaining.  Otherwise, clean up.
      var remaining = [];
      for (var j = 0; j < handlers.length; j++) {
        var handler = handlers[j];
        //这里要严格对上下文进行判断,上下文不等不能删除
        if (
          callback && callback !== handler.callback &&
            callback !== handler.callback._callback ||
              context && context !== handler.context
        ) {
          remaining.push(handler);
        } else {
          listening = handler.listening;
          if (listening && --listening.count === 0) {
            delete listeners[listening.id];
            delete listening.listeningTo[listening.objId];
          }
        }
      }

      // Update tail event if the list has any events.  Otherwise, clean up.
      if (remaining.length) {
        events[name] = remaining;
      } else {
        delete events[name];
      }
    }
    return events;
  };

  /*
    绑定一个只能被调用一次的函数，这个函数在第一次被触发调用的时候，进行解除绑定
    如果同时对多个事件通过空格符分割的方式进行绑定，那么就一个一个来(实际上这句话不用讲)
  */
  Events.once = function(name, callback, context) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
    if (typeof name === 'string' && context == null) callback = void 0;
    return this.on(events, callback, context);
  };

  //once的反转控制版本
  Events.listenToOnce = function(obj, name, callback) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
    return this.listenTo(obj, events);
  };

  // Reduces the event callbacks into a map of `{event: onceWrapper}`.
  // `offer` unbinds the `onceWrapper` after it has been called.
  var onceMap = function(map, name, callback, offer) {
    if (callback) {
      //_.once:创建一个只能调用一次的函数。重复调用改进的方法也没有效果，只会返回第一次执行时的结果。 作为初始化函数使用时非常有用, 不用再设一个boolean值来检查是否已经初始化完成.
      //不得不说，用了underscore之后backbone的很多关键函数都可以省略了，体量减少了不少
      var once = map[name] = _.once(function() {
        offer(name, once);
        callback.apply(this, arguments);
      });
      //这个在解绑的时候有一个分辨效果
      once._callback = callback;
    }
    return map;
  };

  //trigger一个或者多个事件，并触发所有的回调函数，
  //并且可以传递参数，直接按顺序写在第二、第三...个参数的位置即可(依次传递给eventsApi、triggerApi、triggerEvents这几个函数并最终被使用)
  Events.trigger = function(name) {
    if (!this._events) return this;

    var length = Math.max(0, arguments.length - 1);
    var args = Array(length);
    for (var i = 0; i < length; i++) args[i] = arguments[i + 1];

    eventsApi(triggerApi, this._events, name, void 0, args);
    return this;
  };

  //对trigger进行进一步处理，比如区分是否监听了all事件 
  var triggerApi = function(objEvents, name, callback, args) {
    if (objEvents) {
      var events = objEvents[name];
      //处理对all事件进行监听的情况，假设A对象监听了B对象的all事件，那么所有的B对象的事件都会被触发,并且会把事件名作为第一个函数参数
      var allEvents = objEvents.all;
      if (events && allEvents) allEvents = allEvents.slice();
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, [name].concat(args));
    }
    return objEvents;
  };

  /*
    对事件进行触发,优先进行call调用，call调用比apply调用效率更高，所以优先进行call调用
    这里的events参数，实际上是回调函数列
  */
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      //因为call调用的时候是需要将参数展开的，而apply调用的时候传入一个数组即可
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
    }
  };

  //等价函数命名
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  //这样就可以让Backbone全局拥有事件能力
  _.extend(Backbone, Events);

  /*
    至此,Events部分结束,接下来是Model部分
    Backbone.Model
    每当一个模型建立，一个cid便会被自动创建
    实际上，Model函数内的语句顺序也是很重要的，这个不能随便打乱顺序(初始化过程)
  */
  var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    //这个preinitialize函数实际上是为空的,可以给有兴趣的开发者重写这个函数，在初始化Model之前调用，
    //主要是为ES6的class写法提供方便
    this.preinitialize.apply(this, arguments);
    //Model的唯一的id，这和自己传入的id并不一样，虽然我们也要保证id是唯一的
    this.cid = _.uniqueId(this.cidPrefix);
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    //如果之后new的时候传入的是JSON,我们必须在options选项中声明parse为true
    if (options.parse) attrs = this.parse(attrs, options) || {};
    /*
      _.result:如果指定的property的值是一个函数，那么将在object上下文内调用它;
      否则，返回它。如果提供默认值，并且属性不存在，那么默认值将被返回。如果设置defaultValue是一个函数，它的结果将被返回。
      这里调用_.result相当于给出了余地，自己写defaults的时候可以直接写一个对象，也可以写一个函数，通过return一个对象的方式把属性包含进去
    
      backbone这个方法的运用，对适配ES6的class写法有深远意义
    */
    var defaults = _.result(this, 'defaults');
    //defaults应该是在Backbone.Model.extends的时候由用户添加的，用defaults对象填充object中的undefined属性。 并且返回这个object。一旦这个属性被填充，再使用defaults方法将不会有任何效果。
    attrs = _.defaults(_.extend({}, defaults, attrs), defaults);
    this.set(attrs, options);
    //存储历史变化记录
    this.changed = {};
    //这个initialize也是空的，给初始化之后调用
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  //调用underscore的方法，对Model的原型属性进行扩充
  _.extend(Model.prototype, Events, {

    //存储变化的属性
    changed: null,

    //在验证的时候会被用到
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // 唯一标志符号的前缀，一般情况下这个我们不用动
    cidPrefix: 'c',

    // preinitialize is an empty function by default. You can override it with a function
    // or object.  preinitialize will run before any instantiation logic is run in the Model.
    preinitialize: function(){},

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    //复制一个浅拷贝对象
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    //调用backbone的sync函数和服务器交互，下文的fetch、save等方法都用到了
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    //转义html
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    //如果这个属性存在并且不是null或者undefined返回true,否则返回false
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Special-cased proxy to underscore's `_.matches` method.
    matches: function(attrs) {
      return !!_.iteratee(attrs, this)(this.attributes);
    },

    /*
      Model部分第一个出现的的重点函数
      由于它很长，我们需要分析这个函数总共做了哪些事情：
      • 对两种赋值方式的支持： `"key", value` and `{key: value}`
      • 如果你写了validate验证函数没有通过验证，那么就不继续做了(需要显式声明使用validate)。
      • 进行变量的更改或者删除，顺便把历史版本的问题解决掉
      • 如果不是静默set的，那么这个时候开始进行change事件的触发
    */
    set: function(key, val, options) {
      if (key == null) return this;

      //Handle both `"key", value` and `{key: value}` -style arguments.
      //支持两种赋值方式
      var attrs;
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      //验证机制
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      //这个变量标志着是删除而不是重新赋值,为下文直接调用set方法进行unset提供了方便
      var unset      = options.unset;
      //是否静默改变,如果不是静默改变就可以触发change函数
      var silent     = options.silent;
      //方便触发事件的时候使用
      var changes    = [];
      //适用于嵌套更改操作
      var changing   = this._changing;
      this._changing = true;

      //适用于嵌套更改操作
      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }

      var current = this.attributes;
      //changed用来存历史版本,因此backbone支持一个变量历史版本(但并不是时光机，而仅仅是一个历史版本)
      var changed = this.changed;
      //_previousAttributes存放着是历史版本变量，也就是这次set之前这个model中有哪些键值对
      var prev    = this._previousAttributes;

      // For each `set` attribute, update or delete the current value.
      for (var attr in attrs) {
        val = attrs[attr];
        //存储在changes里面，方便到时候触发change事件的时候传值作为参数
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        //changed只存储变化的变量，如果这次和上次相等，说明变量没有变化，就直接删除在changed中的键值对
        if (!_.isEqual(prev[attr], val)) {
          changed[attr] = val;
        } else {
          delete changed[attr];
        }
        //这一句堪称巧妙，简单判断了到底是删除还是更新
        unset ? delete current[attr] : current[attr] = val;
      }

      // 如果在set的时候传入了新的id,那么这个时候就可以更改id了
      if (this.idAttribute in attrs) this.id = this.get(this.idAttribute);

      //对每一个属性的更改都触发相应的事件,事件名采用 change:AttrName 格式
      if (!silent) {
        if (changes.length) this._pending = options;
        for (var i = 0; i < changes.length; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          options = this._pending;
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    //直接调用了set方法，并且在set方法中进行了相关逻辑的处理，堪称一个巧妙的设计
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      var changed = {};
      var hasChanged;
      for (var attr in diff) {
        var val = diff[attr];
        if (_.isEqual(old[attr], val)) continue;
        changed[attr] = val;
        hasChanged = true;
      }
      return hasChanged ? changed : false;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    /*
      从服务器中为模型拉取数据

      另外,和服务端交互的这些函数中有很多地方用了wrapError,这个是处理错误的一个包装函数,我们会在最后提到它
    */
    fetch: function(options) {
      options = _.extend({parse: true}, options);
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        //处理返回数据
        var serverAttrs = options.parse ? model.parse(resp, options) : resp;
        //根据服务器返回数据设置模型属性
        if (!model.set(serverAttrs, options)) return false;
        //触发自定义回调函数
        if (success) success.call(options.context, model, resp, options);
        //触发事件
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    /*
      Model的save方法，实际上是set并且同步到服务器

      其中，传递的options中可以使用的字段以及意义为：
      • wait: 可以指定是否等待服务端的返回结果再更新model。默认情况下不等待
      • url: 可以覆盖掉backbone默认使用的url格式
      • attrs: 可以指定保存到服务端的字段有哪些，配合options.patch可以产生PATCH对模型进行部分更新
      • patch:boolean 指定使用部分更新的REST接口
      • success: 自己定义一个回调函数
      • data: 会被直接传递给jquery的ajax中的data，能够覆盖backbone所有的对上传的数据控制的行为
      • 其他: options中的任何参数都将直接传递给jquery的ajax，作为其options
    */
    save: function(key, val, options) {
      //兼容性处理
      var attrs;
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options = _.extend({validate: true, parse: true}, options);
      //wait: 可以指定是否等待服务端的返回结果再更新model。默认情况下不等待
      var wait = options.wait;

      //如果我们不等待服务器返回结果就更新model,那就直接更新model,有错误返回,否则我们需要先验证一下,
      //如果没有通过验证,也是不会向服务器发送请求的
      if (attrs && !wait) {
        if (!this.set(attrs, options)) return false;
      } else if (!this._validate(attrs, options)) {
        return false;
      }

      //这里把model赋值成this,便于在回调函数中进行处理,防止被污染
      var model = this;
      //这个success是用户定义的回调函数,包裹在了options.success中调用执行
      var success = options.success;
      var attributes = this.attributes;

      /*
        save成功的回调函数，这个回调函数做了下面这几件事情:
        • 判断wait,理论上服务端应该是将model的内容原样返回，这个时候更新model,如果更新失败了,就此中断
        • 调用用户定义的回调函数success
        • 触发sync事件
      */
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = options.parse ? model.parse(resp, options) : resp;
        if (wait) serverAttrs = _.extend({}, attrs, serverAttrs);
        if (serverAttrs && !model.set(serverAttrs, options)) return false;
        if (success) success.call(options.context, model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      //先临时改变this.attributes,为下文调用this.isNew()做准备
      if (attrs && wait) this.attributes = _.extend({}, attributes, attrs);

      /*
        如果模型isNew， 保存将采用"create"（HTTP POST）， 
        如果模型在服务器上已经存在， 保存将采用"update"（HTTP PUT）。
        相反，如果你只想将改变属性发送到服务器， 调用model.save(attrs, {patch: true})。 
        你会得到一个HTTP PATCH请求将刚刚传入的属性发送到服务器。
      */
      var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch' && !options.attrs) options.attrs = attrs;
      var xhr = this.sync(method, this, options);

      //恢复刚才由于要判断isNew而临时改变的attributes
      this.attributes = attributes;

      return xhr;
    },

    /*
      销毁这个模型，我们可以分析，销毁模型要做以下几件事情：
      • 停止对该对象所有的事件监听,本身都没有了,还监听什么事件
      • 告知服务器自己要被销毁了(如果isNew()返回true,那么其实不用向服务器发送请求)
      • 如果它属于某一个collection,那么要告知这个collection要把这个模型移除

      其中，传递的options中可以使用的字段以及意义为：
      • wait: 可以指定是否等待服务端的返回结果再销毁。默认情况下不等待
      • success: 自己定义一个回调函数
    */

    destroy: function(options) {
      options = options ? _.clone(options) : {};
      //将this赋值给model,是为了回调时候方便调用
      var model = this;
      var success = options.success;
      var wait = options.wait;
     
      //停止事件监听
      var destroy = function() {
        model.stopListening();
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (wait) destroy();
        if (success) success.call(options.context, model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      var xhr = false;

      if (this.isNew()) {
        //_.defer:延迟调用function直到当前调用栈清空为止，类似使用延时为0的setTimeout方法。
        //如果是新的model,这个时候是不需要通知服务器的
        _.defer(options.success);
      } else {
        wrapError(this, options);
        xhr = this.sync('delete', this, options);
      }
      if (!wait) destroy();
      return xhr;
    },

    //backbone Model的url构造函数，我们可以指定一个urlRoot作为根路径，另外也可以继承来自collection的url
    //当然我们还可以覆盖这个url函数的写法(不推荐)
    url: function() {
      var base =
        _.result(this, 'urlRoot') ||
        _.result(this.collection, 'url') ||
        urlError();
      if (this.isNew()) return base;
      var id = this.get(this.idAttribute);
      //这个正则表达式是一个很巧妙的处理,它的作用是匹配url是不是以`/`结尾，是的话就不管，不是的话就加上`/`,其中$&表示最后一个匹配的字符
      return base.replace(/[^\/]$/, '$&/') + encodeURIComponent(id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    //新建一个相同的对象，这里并不是拷贝赋值
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    //判断是否从来没有被存储在服务器端
    isNew: function() {
      return !this.has(this.idAttribute);
    },

    //判断是否通过验证，在使用validate验证的时候可以调用
    isValid: function(options) {
      return this._validate({}, _.extend({}, options, {validate: true}));
    },

    /*

      这里面的this.validate:
      
      这种方法是未定义的， 如果您有任何可以在JavaScript中执行的代码 并且我们鼓励你用你自定义验证逻辑覆盖它 。 
      默认情况下validate在save之前调用， 但如果传递了 {validate:true}，也可以在set之前调用。 validate
      方法是通过模型的属性，  选项和set 和 save是一样的。 如果属性是有效的， validate不返回验证任何东西;  
      如果它们是无效的， 返回一个你选择的错误。 它可以是一个用来显示的简单的字符串错误信息， 或一个以编程方式
      描述错误的完整错误对象。 如果validate返回一个错误， save不会继续， 并且在服务器上该模型的属性将不被修
      改。 校验失败将触发"invalid"事件， 并用此方法返回的值设置模型上的validationError属性。

      这个内容通常用于表单验证等...
      验证的时候，注意要手动传递{validate: true}

    */
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
      return false;
    }

  });

  // 一些underscore的方法以及参数的个数
  var modelMethods = {keys: 1, values: 1, pairs: 1, invert: 1, pick: 0,
      omit: 0, chain: 1, isEmpty: 1};

  //混入一些underscore中常用的方法
  addUnderscoreMethods(Model, modelMethods, 'attributes');

  /*
    backbone的collection部分,collection是model的集合
  */

  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    this.preinitialize.apply(this, arguments);
    //实际上我们在创建集合类的时候大多数都会定义一个model, 而不是在初始化的时候从options中指定model
    if (options.model) this.model = options.model;
    //我们可以在options中指定一个comparator作为排序器
    if (options.comparator !== void 0) this.comparator = options.comparator;
    //_reset用于初始化
    this._reset();
    this.initialize.apply(this, arguments);
    //如果我们在new构造调用的时候声明了models,这个时候需要调用reset函数
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  //默认的set函数要用的option,可以覆写
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, remove: false};

  // Splices `insert` into `array` at index `at`.
  //我目前认为,这个splice方法和ES5中的splice方法无异
  var splice = function(array, insert, at) {
    at = Math.min(Math.max(at, 0), array.length);
    var tail = Array(array.length - at);
    var length = insert.length;
    var i;
    for (i = 0; i < tail.length; i++) tail[i] = array[i + at];
    for (i = 0; i < length; i++) array[i + at] = insert[i];
    for (i = 0; i < tail.length; i++) array[i + length + at] = tail[i];
  };

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    //应当被开发者覆盖
    model: Model,

    // preinitialize is an empty function by default. You can override it with a function
    // or object.  preinitialize will run before any instantiation logic is run in the Collection.
    preinitialize: function(){},

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model) { return model.toJSON(options); });
    },

    //调用backbone的sync函数和服务器交互，下文的fetch、save等方法都用到了
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    //增加一个或者一组模型，这个模型可以是backbone模型，也可以是用来生成backbone模型的js键值对象
    add: function(models, options) {
      return this.set(models, _.extend({merge: false}, options, addOptions));
    },

    //移除一个或者一组模型
    remove: function(models, options) {
      options = _.extend({}, options);
      var singular = !_.isArray(models);
      models = singular ? [models] : models.slice();
      var removed = this._removeModels(models, options);
      if (!options.silent && removed.length) {
        options.changes = {added: [], merged: [], removed: removed};
        this.trigger('update', this, options);
      }
      return singular ? removed[0] : removed;
    },

    /*
      collection的一个核心方法,内容很长,我们可以把它理解为重置:给定一组新的模型,增加新的,去除不在这里面的(在添加模式下不去除),混合已经存在的
      但是这个方法同时也很灵活,可以通过参数的设定,

      set可能有如下几个调用场景：
      1. 重置模式，这个时候不在models里的model都会被清除掉。对应上文的：var setOptions = {add: true, remove: true, merge: true};
      2. 添加模式，这个时候models里的内容会做添加用，如果有重复的(Cid来判断)，会覆盖。对应上文的：var addOptions = {add: true, remove: false};
      我们还是理一理里面做了哪些事情：
      
      * 先规范化models和options两个参数
      * 遍历models：
        * 如果是重置模式，那么遇到重复的就直接覆盖掉，并且也添加到set队列，遇到新的就先添加到set队列。之后还要删除掉models里没有而原来collection里面有的
        * 如果是添加模式，那么遇到重复的，就先添加到set队列，遇到新的也是添加到set队列
      * 之后进行整理，整合到collection中

    */
    set: function(models, options) {
      if (models == null) return;

      options = _.extend({}, setOptions, options);
      if (options.parse && !this._isModel(models)) {
        //现在这个版本的parse已经没什么用了
        models = this.parse(models, options) || [];
      }

      //判断是不是仅仅添加一个模型(或者说判断models是不是一个数组),如果不是数组先转化成数组方便以后处理
      var singular = !_.isArray(models);
      models = singular ? [models] : models.slice();

      //如果at为null,经过这几个条件的处理at仍然为null
      var at = options.at;
      //强制转化为数字
      if (at != null) at = +at;
      if (at > this.length) at = this.length;
      if (at < 0) at += this.length + 1;

      //set里面存放的是新的Collection的models
      var set = [];
      //toAdd存储将要增加的model
      var toAdd = [];
      var toMerge = [];
      var toRemove = [];
      //modelMap在删除变量的时候会被用到
      var modelMap = {};

      var add = options.add;
      var merge = options.merge;
      var remove = options.remove;

      var sort = false;
      //标志是否可以排序
      var sortable = this.comparator && at == null && options.sort !== false;

      var sortAttr = _.isString(this.comparator) ? this.comparator : null;

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      var model, i;
      for (i = 0; i < models.length; i++) {
        model = models[i];
        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        //判断是否有一个重复的model,这个判断是否重复是根据model的cid来判断的,而cid是model在初始化的时候系统调用underscore的方法建立的随机数,并不是用户建立的
        var existing = this.get(model);
        if (existing) {
          //如果有相同cid的model,但是model的内容却变化了
          if (merge && model !== existing) {
            //取出传入的model的属性
            var attrs = this._isModel(model) ? model.attributes : model;
            //进行JSON解析
            if (options.parse) attrs = existing.parse(attrs, options);
            //重新给model赋值
            existing.set(attrs, options);

            toMerge.push(existing);
            //排序标志属性是否有变化
            if (sortable && !sort) sort = existing.hasChanged(sortAttr);
          }

          //将存在的model放入set和modelMap
          if (!modelMap[existing.cid]) {
            modelMap[existing.cid] = true;
            set.push(existing);
          }

          //规范化models[i]
          models[i] = existing;

        // If this is a new, valid model, push it to the `toAdd` list.
        //允许增加 setOptions 和 addOptions中都是true
        } else if (add) {
          model = models[i] = this._prepareModel(model, options);
          if (model) {
            toAdd.push(model);
            //将model和collections建立联系
            this._addReference(model, options);
            modelMap[model.cid] = true;
            set.push(model);
          }
        }
      }

      // Remove stale models.
      //是否允许删除，如果是作为重置使用，肯定是要将没有在第一个参数中出现的删除的，如果仅仅是增加，那么就不需要删除
      if (remove) {
        for (i = 0; i < this.length; i++) {
          model = this.models[i];
          if (!modelMap[model.cid]) toRemove.push(model);
        }
        if (toRemove.length) this._removeModels(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      //顺序是否有变化
      var orderChanged = false;
      //如果是增加模式，remove是false
      var replace = !sortable && add && remove;
      if (set.length && replace) {
        orderChanged = this.length !== set.length || _.some(this.models, function(m, index) {
          return m !== set[index];
        });
        this.models.length = 0;
        splice(this.models, set, 0);
        this.length = this.models.length;
      } else if (toAdd.length) {
        if (sortable) sort = true;
        splice(this.models, toAdd, at == null ? this.length : at);
        this.length = this.models.length;
      }

      /*
        重新排序：我们总结一下什么时候会触发这个函数
        前提条件：当指定了排序规则(创建类或初始化时候指定)，并且没有规定具体插入在哪一个位置以及在传入的option的选项中sort为true
        在这个前提下,满足以下任意一个：
            1. 某一个model的排序标志位的内容发生了变化
            2. 有新加的model进来

        这里我们需要和orderChanged标志变量区别开来，orderChanged是变量是否变化的标志，不一定引发重排
      */
      if (sort) this.sort({silent: true});

      // Unless silenced, it's time to fire all appropriate add/sort/update events.
      if (!options.silent) {
        for (i = 0; i < toAdd.length; i++) {
          if (at != null) options.index = at + i;
          model = toAdd[i];
          model.trigger('add', model, this, options);
        }
        if (sort || orderChanged) this.trigger('sort', this, options);
        if (toAdd.length || toRemove.length || toMerge.length) {
          options.changes = {
            added: toAdd,
            removed: toRemove,
            merged: toMerge
          };
          this.trigger('update', this, options);
        }
      }

      // Return the added (or merged) model (or models).
      return singular ? models[0] : models;
    },

    //传入一组模型，重置collection
    reset: function(models, options) {
      options = options ? _.clone(options) : {};
      for (var i = 0; i < this.models.length; i++) {
        this._removeReference(this.models[i], options);
      }
      options.previousModels = this.models;
      this._reset();
      models = this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      return this.add(model, _.extend({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      return this.remove(model, options);
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      return this.add(model, _.extend({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      return this.remove(model, options);
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
      return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id, cid, model object with id or cid
    // properties, or an attributes object that is transformed through modelId.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj] ||
        this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
        obj.cid && this._byId[obj.cid];
    },

    // Returns `true` if the model is in the collection.
    has: function(obj) {
      return this.get(obj) != null;
    },

    // Get the model at the given index.
    at: function(index) {
      if (index < 0) index += this.length;
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      return this[first ? 'find' : 'filter'](attrs);
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    //给这个collection的模型按照自己传入额规则进行排序
    sort: function(options) {
      var comparator = this.comparator;
      if (!comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      var length = comparator.length;
      if (_.isFunction(comparator)) comparator = _.bind(comparator, this);

      // Run sort based on type of `comparator`.
      if (length === 1 || _.isString(comparator)) {
        //如果只有一个关键字或者排序的规则是函数，则调用underscore的排序方法
        this.models = this.sortBy(comparator);
      } else {
        //直接调用数组的sort方法,原生sort方法支持按照多个关键字进行排序
        this.models.sort(comparator);
      }
      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    //从集合的每个模型中提取属性
    pluck: function(attr) {
      return this.map(attr + '');
    },

    //向服务器中拉取模型数据，如果`reset: true`那么就会用拉取的数据重置collection，否则就调用set
    fetch: function(options) {
      options = _.extend({parse: true}, options);
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success.call(options.context, collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    /*
      方便的在集合中创建一个模型的新实例。 相当于使用属性哈希（键值对象）实例化一个模型，
      然后将该模型保存到服务器， 创建成功后将模型添加到集合中。 返回这个新模型。 
      如果wait为true就等服务端返回数据后更新
    */
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      var wait = options.wait;
      model = this._prepareModel(model, options);
      if (!model) return false;
      if (!wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(m, resp, callbackOpts) {
        if (wait) collection.add(m, callbackOpts);
        //调用自定义的回调函数
        if (success) success.call(callbackOpts.context, m, resp, callbackOpts);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    //新建一个相同的collection，而不是拷贝
    clone: function() {
      return new this.constructor(this.models, {
        model: this.model,
        comparator: this.comparator
      });
    },

    // Define how to uniquely identify models in the collection.
    modelId: function(attrs) {
      return attrs[this.model.prototype.idAttribute || 'id'];
    },

    // Get an iterator of all models in this collection.
    values: function() {
      return new CollectionIterator(this, ITERATOR_VALUES);
    },

    // Get an iterator of all model IDs in this collection.
    keys: function() {
      return new CollectionIterator(this, ITERATOR_KEYS);
    },

    // Get an iterator of all [ID, model] tuples in this collection.
    entries: function() {
      return new CollectionIterator(this, ITERATOR_KEYSVALUES);
    },

    //格式化函数
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // 对model进行准备工作,用于当你在给collection添加内容的时候,实际上写的形式肯定是普通对象的键值对形式,这个时候就会调用这个方法
    _prepareModel: function(attrs, options) {
      if (this._isModel(attrs)) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options = options ? _.clone(options) : {};
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model.validationError) return model;
      this.trigger('invalid', this, model.validationError, options);
      return false;
    },

    // Internal method called by both remove and set.
    //删除模型并且触发remove事件
    _removeModels: function(models, options) {
      var removed = [];
      for (var i = 0; i < models.length; i++) {
        var model = this.get(models[i]);
        if (!model) continue;

        var index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;

        // Remove references before triggering 'remove' event to prevent an
        // infinite loop. #3693
        delete this._byId[model.cid];
        var id = this.modelId(model.attributes);
        if (id != null) delete this._byId[id];

        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }

        removed.push(model);
        this._removeReference(model, options);
      }
      return removed;
    },

    // Method for checking whether an object should be considered a model for
    // the purposes of adding to the collection.
    _isModel: function(model) {
      return model instanceof Model;
    },

    // Internal method to create a model's ties to a collection.
    //这实际上是建立了一个model到collection的一个联系,在set函数中用到了这个方法
    _addReference: function(model, options) {
      this._byId[model.cid] = model;
      var id = this.modelId(model.attributes);
      if (id != null) this._byId[id] = model;
      model.on('all', this._onModelEvent, this);
    },

    // Internal method to sever a model's ties to a collection.
    //移除模型和collection的联系
    _removeReference: function(model, options) {
      delete this._byId[model.cid];
      var id = this.modelId(model.attributes);
      if (id != null) delete this._byId[id];
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if (model) {
        if ((event === 'add' || event === 'remove') && collection !== this) return;
        if (event === 'destroy') this.remove(model, options);
        if (event === 'change') {
          var prevId = this.modelId(model.previousAttributes());
          var id = this.modelId(model.attributes);
          if (prevId !== id) {
            if (prevId != null) delete this._byId[prevId];
            if (id != null) this._byId[id] = model;
          }
        }
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Defining an @@iterator method implements JavaScript's Iterable protocol.
  // In modern ES2015 browsers, this value is found at Symbol.iterator.
  /* global Symbol */
  /*
    自定义一个迭代器,这是ES6的新规范，自定义了遍历器之后可以被遍历
    我们可以参考这个链接：https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Iteration_protocols
  */
  var $$iterator = typeof Symbol === 'function' && Symbol.iterator;
  if ($$iterator) {
    Collection.prototype[$$iterator] = Collection.prototype.values;
  }
  /*
    CollectionIterator
    ------------------
    实现了js的迭代器规范，从此collection支持for..of..这样调用，并且这样也能和第三方库比较好的兼容
  */
  var CollectionIterator = function(collection, kind) {
    this._collection = collection;
    this._kind = kind;
    this._index = 0;
  };

  //三个标志变量,之后会作为kind传入上面的函数
  var ITERATOR_VALUES = 1;
  var ITERATOR_KEYS = 2;
  var ITERATOR_KEYSVALUES = 3;

  //我们这个迭代器的功能比较强大，可以根据不同的情况(参数)进行不同的迭代
  // All Iterators should themselves be Iterable.
  if ($$iterator) {
    CollectionIterator.prototype[$$iterator] = function() {
      return this;
    };
  }

  //这个函数的返回值是完全按照规范来的，并没有什么难懂的地方
  CollectionIterator.prototype.next = function() {
    if (this._collection) {

      // Only continue iterating if the iterated collection is long enough.
      if (this._index < this._collection.length) {
        var model = this._collection.at(this._index);
        this._index++;

        // Construct a value depending on what kind of values should be iterated.
        var value;
        if (this._kind === ITERATOR_VALUES) {
          value = model;
        } else {
          var id = this._collection.modelId(model.attributes);
          if (this._kind === ITERATOR_KEYS) {
            value = id;
          } else { // ITERATOR_KEYSVALUES
            value = [id, model];
          }
        }
        return {value: value, done: false};
      }

      // Once exhausted, remove the reference to the collection so future
      // calls to the next method always return done.
      this._collection = void 0;
    }

    return {value: void 0, done: true};
  };

  //混入了众多underscore方法
  var collectionMethods = {forEach: 3, each: 3, map: 3, collect: 3, reduce: 0,
      foldl: 0, inject: 0, reduceRight: 0, foldr: 0, find: 3, detect: 3, filter: 3,
      select: 3, reject: 3, every: 3, all: 3, some: 3, any: 3, include: 3, includes: 3,
      contains: 3, invoke: 0, max: 3, min: 3, toArray: 1, size: 1, first: 3,
      head: 3, take: 3, initial: 3, rest: 3, tail: 3, drop: 3, last: 3,
      without: 0, difference: 0, indexOf: 3, shuffle: 1, lastIndexOf: 3,
      isEmpty: 1, chain: 1, sample: 3, partition: 3, groupBy: 3, countBy: 3,
      sortBy: 3, indexBy: 3, findIndex: 3, findLastIndex: 3};

  // Mix in each Underscore method as a proxy to `Collection#models`.
  addUnderscoreMethods(Collection, collectionMethods, 'models');

  /*
    backbone的View部分,视图层
  */
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    this.preinitialize.apply(this, arguments);
    //_.pick(object, *keys):返回一个object副本，只过滤出keys(有效的键组成的数组)参数指定的属性值。或者接受一个判断函数，指定挑选哪个key。
    _.extend(this, _.pick(options, viewOptions));
    //初始化dom元素和jQuery元素工作
    this._ensureElement();
    //自定义初始化函数
    this.initialize.apply(this, arguments);
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be set as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    //保证了只允许在目标范围内进行搜索,虽然有的时候我并不认为这是一个好的设计
    $: function(selector) {
      return this.$el.find(selector);
    },

    // preinitialize is an empty function by default. You can override it with a function
    // or object.  preinitialize will run before any instantiation logic is run in the View
    preinitialize: function(){},

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    //render是一个需要被重写的核心函数,调用也是由自己来调用,用于重新渲染View或者什么(自己说了算),当然实际上你也可以选择不重写这个函数
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    //移除这个View
    remove: function() {
      this._removeElement();
      this.stopListening();
      return this;
    },

    // Remove this view's element from the document and all event listeners
    // attached to it. Exposed for subclasses using an alternative DOM
    // manipulation API.
    //用jQuery的API进行remove,从DOM树中移除这个节点
    _removeElement: function() {
      this.$el.remove();
    },

    // Change the view's element (`this.el` property) and re-delegate the
    // view's events on the new element.
    setElement: function(element) {
      this.undelegateEvents();
      this._setElement(element);
      this.delegateEvents();
      return this;
    },

    /*
      this.$el代表jQuery节点
      this.el代表DOM节点
    */
    _setElement: function(el) {
      this.$el = el instanceof Backbone.$ ? el : Backbone.$(el);
      this.el = this.$el[0];
    },

    /*
      设置回调函数,events大概是这样的一个形式：
    
    // *{"event selector": "callback"}*
    // 举个例子：
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function(e) { ... }
    //     }
    //
    // Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
      这个地方我一开始用backbone的时候觉得特别神奇,现在发现原来可以基于少量的代码进行巧妙的实现
    */
    delegateEvents: function(events) {
      events || (events = _.result(this, 'events'));
      if (!events) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[method];
        if (!method) continue;
        var match = key.match(delegateEventSplitter);
        this.delegate(match[1], match[2], _.bind(method, this));
      }
      return this;
    },

    /*
      Add a single event listener to the view's element (or a child element
      using `selector`). This only works for delegate-able events: not `focus`,
      `blur`, and not `change`, `submit`, and `reset` in Internet Explorer.
      这里直接用了jQuery的绑定方法,这里没有用backbone之前自己写的Events
      实际上这样做是有深远意义的,因为View层面的事件是由浏览器直接触发的,所以自然不能什么事件都进行绑定

      这个事件部分用了jQuery事件的
    */
    delegate: function(eventName, selector, listener) {
      this.$el.on(eventName + '.delegateEvents' + this.cid, selector, listener);
      return this;
    },

    //解绑backbone所用的命名空间下的事件(.delegateEvents)，这个是方式这个事件被之前的其他View使用过，从而造成污染
    undelegateEvents: function() {
      if (this.$el) this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    //调用jQuery的off函数对事件进行解绑
    undelegate: function(eventName, selector, listener) {
      this.$el.off(eventName + '.delegateEvents' + this.cid, selector, listener);
      return this;
    },

    //创建一个dom元素并且返回
    _createElement: function(tagName) {
      return document.createElement(tagName);
    },

    /*
      确保有一个节点对象可以被渲染
      这个方法在创建新的View的时候被调用，如果没有传入el，还可以创建一个元素并且把`id`, `className`等属性以及一些自定义属性传入。
    */
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        this.setElement(this._createElement(_.result(this, 'tagName')));
        this._setAttributes(attrs);
      } else {
        this.setElement(_.result(this, 'el'));
      }
    },

    // Set attributes from a hash on this view's element.  Exposed for
    // subclasses using an alternative DOM manipulation API.
    _setAttributes: function(attributes) {
      this.$el.attr(attributes);
    }

  });
  
  /*
    backbone同步服务器需要的函数
    Backbone.sync

    最终这个函数调用了jQuery的ajax方法,之前内容有点长,但是都是为了构造这个请求对象

    另外，这个sync支持两个特殊情况：

    * emulateHTTP:如果你想在不支持Backbone的默认REST/ HTTP方式的Web服务器上工作，
      您可以选择开启Backbone.emulateHTTP。 设置该选项将通过 POST 方法伪造 PUT，PATCH
      和 DELETE 请求 用真实的方法设定X-HTTP-Method-Override头信息。 如果支持emulateJSON，
      此时该请求会向服务器传入名为 _method 的参数。
    * emulateJSON:如果你想在不支持发送 application/json 编码请求的Web服务器上工作，
      设置Backbone.emulateJSON = true;将导致JSON根据模型参数进行序列化， 并通过
      application/x-www-form-urlencoded MIME类型来发送一个伪造HTML表单请求
  */
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    //如果没有指定url,就用backbone Model中自己定义的url格式
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    //如果不支持Backbone的默认REST/ HTTP方式,那么统一用post来实现、
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // Pass along `textStatus` and `errorThrown` from jQuery.
    var error = options.error;
    options.error = function(xhr, textStatus, errorThrown) {
      options.textStatus = textStatus;
      options.errorThrown = errorThrown;
      if (error) error.call(options.context, xhr, textStatus, errorThrown);
    };

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch': 'PATCH',
    'delete': 'DELETE',
    'read': 'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  /*
    Backbone的路由部分,这部分被认为是backbone的MVC结构中的被弱化的controller
  // Backbone.Router

    我们在使用的时候，通常会赋值一个这样的routes:
    routes:{
            "article/:id":"getArticleById",
            "article":"getlist"
    },
  */
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    this.preinitialize.apply(this, arguments);
    //注意这个地方,options的routes会直接this的routes,所以如果在建立类的时候指定routes,实例化的时候又扩展了routes,是会被覆盖的
    if (options.routes) this.routes = options.routes;
    //对自己定义的路由进行处理
    this._bindRoutes();
    //调用自定义初始化函数
    this.initialize.apply(this, arguments);
  };

  //匹配有内容的括号或🈳️括号
  var optionalParam = /\((.*?)\)/g;
  //匹配(?:或者:加一个单词
  var namedParam    = /(\(\?)?:\w+/g;
  //匹配*加上一个单词
  var splatParam    = /\*\w+/g;
  //匹配正则表达式中常用的这些字符
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    //前置初始化函数,可以由用户来重写
    preinitialize: function(){},

    //后置初始化函数,可以由用户来重写
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      //如果不是正则表达式,转换之
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        if (router.execute(callback, args, name) !== false) {
          router.trigger.apply(router, ['route:' + name].concat(args));
          router.trigger('route', name, args);
          Backbone.history.trigger('route', router, name, args);
        }
      });
      return this;
    },

    // Execute a route handler with the provided parameters.  This is an
    // excellent place to do pre-route setup or post-route cleanup.
    execute: function(callback, args, name) {
      if (callback) callback.apply(this, args);
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    //这是一个中间函数,整理我们的输入并且之后调用route进行进一步绑定
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      //一次处理一条内容
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')//这个匹配的目的是将正则表达式字符进行转义
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional) {
                     return optional ? match : '([^/?]+)';
                   })
                   .replace(splatParam, '([^?]*?)');
      return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    },

    //给一个匹配好的网址和一个对应的路由规则，将参数转化成数组返回
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param, i) {
        // Don't decode the search params.
        if (i === params.length - 1) return param || null;
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  /*
    Backbone的History部分
    Backbone.History
    ----------------

    Backbone的history是通过绑定hashchange事件的监听来监听网页url的变化,从而调用相关函数
    另外，在不支持hashchange事件的浏览器中,采用轮询的方式
  */
  var History = Backbone.History = function() {
    this.handlers = [];
    this.checkUrl = _.bind(this.checkUrl, this);

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  //修正作用，去除结尾的#或/以及多余的空白符(包括\n,\r,\f,\t,\v)
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  //匹配开头的一个或多个`/`以及结尾的一个或者多个`/`
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for stripping urls of hash.
  var pathStripper = /#.*$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    /*
      Are we at the app root?
      如果处于根节点那么this.location.pathname获取到的应该是`/`
      另外这里用到了getSearch来获取?后面的内容,如果能获取到自然说明并不是在根节点
    */
    atRoot: function() {
      var path = this.location.pathname.replace(/[^\/]$/, '$&/');
      return path === this.root && !this.getSearch();
    },

    // Does the pathname match the root?
    matchRoot: function() {
      var path = this.decodeFragment(this.location.pathname);
      var rootPath = path.slice(0, this.root.length - 1) + '/';
      return rootPath === this.root;
    },

    // Unicode characters in `location.pathname` are percent encoded so they're
    // decoded for comparison. `%25` should not be decoded since it may be part
    // of an encoded parameter.
    //这里值得注意的是，%被编码后恰好是%25,这里十分巧妙的解决了防止fragment两次编码的问题
    decodeFragment: function(fragment) {
      return decodeURI(fragment.replace(/%25/g, '%2525'));
    },

    // In IE6, the hash fragment and search params are incorrect if the
    // fragment contains `?`.
    //取得?以及其后面的内容
    getSearch: function() {
      var match = this.location.href.replace(/#.*/, '').match(/\?.+/);
      return match ? match[0] : '';
    },

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the pathname and search params, without the root.
    //返回除了哈希以外的所有内容
    getPath: function() {
      var path = this.decodeFragment(
        this.location.pathname + this.getSearch()
      ).slice(this.root.length - 1);
      return path.charAt(0) === '/' ? path.slice(1) : path;
    },

    // Get the cross-browser normalized URL fragment from the path or hash.
    //这个函数的目的就是根据需要获取路径片段
    getFragment: function(fragment) {
      if (fragment == null) {
        if (this._usePushState || !this._wantsHashChange) {
          fragment = this.getPath();
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error('Backbone.history has already been started');
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      //赋值默认的root
      this.options          = _.extend({root: '/'}, this.options, options);
      this.root             = this.options.root;
      //如果浏览器并不支持hashChange,必须显示地指出hashChange为false,否则,undefined是不等于false的
      this._wantsHashChange = this.options.hashChange !== false;
      //documentMode 属性返回浏览器渲染文档的模式,仅仅IE支持,这里要求>7或者是未定义,也就是说对IE7以下是不支持的
      this._hasHashChange   = 'onhashchange' in window && (document.documentMode === void 0 || document.documentMode > 7);
      this._useHashChange   = this._wantsHashChange && this._hasHashChange;
      //对html5的pushState提供支持,可以支持无刷新改变浏览器历史记录
      this._wantsPushState  = !!this.options.pushState;
      //判断是否拥有pushState的能力
      this._hasPushState    = !!(this.history && this.history.pushState);
      //显式声明了pushState为true并且拥有这个能力,才会使用
      this._usePushState    = this._wantsPushState && this._hasPushState;
      this.fragment         = this.getFragment();

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      // Transition from hashChange to pushState or vice versa if both are
      // requested.
      if (this._wantsHashChange && this._wantsPushState) {

        // If we've started off with a route from a `pushState`-enabled
        // browser, but we're currently in a browser that doesn't support it...
        //如果我们显式声明了pushState为true但是却在一个并不支持的浏览器,那么这个时候直接先替换location
        if (!this._hasPushState && !this.atRoot()) {
          var rootPath = this.root.slice(0, -1) || '/';
          this.location.replace(rootPath + '#' + this.getPath());
          // Return immediately as browser will do redirect to new url
          return true;

        // Or if we've started out with a hash-based route, but we're currently
        // in a browser where it could be `pushState`-based instead...
        } else if (this._hasPushState && this.atRoot()) {
          this.navigate(this.getHash(), {replace: true});
        }

      }

      // Proxy an iframe to handle location events if the browser doesn't
      // support the `hashchange` event, HTML5 history, or the user wants
      // `hashChange` but not `pushState`.
      //在IE中,无论iframe是一开始静态写在html中的还是后来用js动态创建的,都可以被写入浏览器的历史记录
      if (!this._hasHashChange && this._wantsHashChange && !this._usePushState) {
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'javascript:0';
        this.iframe.style.display = 'none';
        this.iframe.tabIndex = -1;
        var body = document.body;
        // Using `appendChild` will throw on IE < 9 if the document is not ready.
        var iWindow = body.insertBefore(this.iframe, body.firstChild).contentWindow;
        //document.open():打开一个新文档，即打开一个流，并擦除当前文档的内容。
        iWindow.document.open();
        //close()方法可关闭一个由open()方法打开的输出流，并显示选定的数据。
        iWindow.document.close();
        iWindow.location.hash = '#' + this.fragment;
      }

      // Add a cross-platform `addEventListener` shim for older browsers.
      var addEventListener = window.addEventListener || function(eventName, listener) {
        return attachEvent('on' + eventName, listener);
      };

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      //这里分情况处理pushState
      if (this._usePushState) {
        //当前活动历史项(history entry)改变会触发popstate事件，这个时候显然不用在监听hashchange事件了
        addEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        //onhashchange 事件在当前 URL 的锚部分(以 '#' 号为开始) 发生改变时触发,IE8以上支持,其他浏览器支持较好
        addEventListener('hashchange', this.checkUrl, false);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    //如果能理解start方法中做的事情,那么stop方法也是不难理解的
    stop: function() {
      // Add a cross-platform `removeEventListener` shim for older browsers.
      var removeEventListener = window.removeEventListener || function(eventName, listener) {
        return detachEvent('on' + eventName, listener);
      };

      // Remove window listeners.
      if (this._usePushState) {
        removeEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        removeEventListener('hashchange', this.checkUrl, false);
      }

      // Clean up the iframe if necessary.
      if (this.iframe) {
        document.body.removeChild(this.iframe);
        this.iframe = null;
      }

      // Some environments will throw when clearing an undefined interval.
      if (this._checkUrlInterval) clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      //在handlers数组头部插入元素
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    //判断当前url是否变化,如果变化了,调用loadUrl,后者中会有对路由回调函数的调用
    checkUrl: function(e) {
      var current = this.getFragment();

      // If the user pressed the back button, the iframe's hash will have
      // changed and we should use that for comparison.
      if (current === this.fragment && this.iframe) {
        current = this.getHash(this.iframe.contentWindow);
      }

      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl();
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    //在正确调用回调函数之前还要对url进行确认，root路径是不能改的
    loadUrl: function(fragment) {
      // If the root doesn't match, no routes can match either.
      if (!this.matchRoot()) return false;
      fragment = this.fragment = this.getFragment(fragment);
      return _.some(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.、
    /*
      这个函数的主要目的就是将历史记录存储起来，      
      这个函数可以由程序员在业务逻辑中调用
    */
    navigate: function(fragment, options) {
      if (!History.started) return false;

      //这个写法很讨巧，我们可以只传递一个true，来表明调用开发者定义的事件
      //也可以什么也不写，默认trigger为false(因为一般情况下不必在这里调用,除非是用户自己调用这个navigate函数)
      if (!options || options === true) options = {trigger: !!options};

      // Normalize the fragment.
      fragment = this.getFragment(fragment || '');

      // Don't include a trailing slash on the root.
      var rootPath = this.root;
      if (fragment === '' || fragment.charAt(0) === '?') {
        rootPath = rootPath.slice(0, -1) || '/';
      }
      var url = rootPath + fragment;

      /*
        去除#及以后的内容，注意这里的fragment并不是this.fragment，这里只是为了方便下文判断用，所以用了这么一个变量
        另外这里有两个非常值得注意的地方
          1.如果是在_usePushState情况下调用，那么这个时候哈希值实际上是不用的，所以这一步骤是没错的
          2.如果是在使用哈希值的情况下进行调用，fragment这个时候实际上已经是转换好的哈希值了，所以这一步骤并不会改变
          它什么，也不会把它变没。
      */ 
      fragment = fragment.replace(pathStripper, '');

      // Decode for matching.
      var decodedFragment = this.decodeFragment(fragment);

      //如果没有变化，则不进行下文操作
      if (this.fragment === decodedFragment) return;

      this.fragment = decodedFragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._usePushState) {

        //调用浏览器提供的history接口，可以压入或更新一条历史记录
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && fragment !== this.getHash(this.iframe.contentWindow)) {
          var iWindow = this.iframe.contentWindow;

          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          //在IE7及以下的情况通过这种方式写入历史记录
          if (!options.replace) {
            iWindow.document.open();
            iWindow.document.close();
          }

          this._updateHash(iWindow.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) return this.loadUrl(fragment);
    },

    //改变当前location的hash
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  /*
    这个extend是一个help函数,却是一个我们用的非常多的函数,这个函数其实其中有很多的学问在里面,也是backbone重中之重的函数

    这个函数并没有直接将属性assign到parent上面(this),是因为这样会产生一个显著的问题:污染原型
    所以实际上backbone的做法是新建了一个子对象,这个子对象承担着所有内容.
    而backbone的这种设计也注定了其和ES6的class并不能很好的共存
  */

  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    //这个constructor可以自己写，也可以继承原型的构造，这是典型的ES6的class的套路
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    //扩展原型
    child.prototype = _.create(parent.prototype, protoProps);
    child.prototype.constructor = child;

    //提供一个访问父类原型的方式
    child.__super__ = parent.prototype;

    return child;
  };

  //所有的上述定义类都用到了这个helper 函数
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  //未指定url错误，如果使用了和服务器交互的方法并且model或者collection都没有获取到url的时候会产生这个错误
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  //包装错误的函数,非常典型的设计模式中的装饰者模式,这里增加了一个触发
  var wrapError = function(model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error.call(options.context, model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

  return Backbone;
});
