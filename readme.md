backbone 源码解读

##### 写在前面

backbone是我两年多前入门前端的时候接触到的第一个框架，当初被backbone的强大功能所吸引(当然的确比裸写js要好得多)，虽然现在backbone并不算最主流的前端框架了，但是，它里面大量设计模式的灵活运用，以及令人赞叹的处理技巧，还是非常值得学习。个人认为，读懂老牌框架的源代码比会用流行框架的API要有用的多。

另外，backbone的源代码最近也改了许多，所以有些老旧的分析，可能会和现在的源代码有些出入。

所以我写这一篇分析backbone的文章，供自己和大家一起学习，本文适合使用过backbone的朋友，笔者水平有限，难免会出差错，欢迎大家在<a href="" target="_blank">GitHub</a>上指正

接下来，我们将通过一篇文章解析backbone，我们是按照源码的顺序来讲解的，这有利于大家边看源代码边解读，另外，**我给源代码加了全部的中文注释和批注**，请见<a href="" target="_blank">这里</a>，强烈建议大家边看源码边看解析，并且遇到我给出外链的地方，最好把外链的内容也看看(如果能够给大家帮助，欢迎给star鼓励)

当然，这篇文章很长。

### backbone宏观解读

backbone是很早期将MVC的思想带入前端的框架，关于前端MVC，我在自己的<a href="http://aircloud.10000h.top/29" target="_blank">这篇文章</a>中结合阮一峰老师的图示简单分析过，简单来讲就是Model层控制数据，View层通过发布订阅(在backbone中)来处理和用户的交互，Controller是控制器，在这里主要是指backbone的路由功能。这样的设计非常直接清晰，有利于前端工程化。

backbone中主要实现了Model、Collection、View、Router、History几大功能，前四种我们用的比较多，另外backbone基于发布-订阅模式自己实现了一套对象的事件系统Events，简单来说Events可以让对象拥有事件能力，其定义了比较丰富的API，并且如果你引入了backbone，这套事件系统还可以集成到自己的对象上，这是一个非常好的设计。

另外，源代码中所有的以`_`开头的方法，可以认为是私有方法，是没有必要直接使用的，也不建议用户覆盖。

### backbone模块化处理、防止冲突和underscore混入

代码首先进行了区分使用环境(self或者是global,前者代表浏览器环境(self和window等价)，后者代表node环境)和模块化处理操作，之后处理了在AMD和CommonJS加载规范下的引入方式，并且明确声明了对jQuery(或者Zepto)和underscore的依赖。

很遗憾的是，虽然backbone这样做了，但是backbone并不适合在node端直接使用，也不适合服务端渲染，另外还和ES6相处的不是很融洽，这个我们后面还会陆续提到原因。

#### backbone noConflict

backbone也向jQuery致敬，学习了它的处理冲突的方式:

```
var previousBackbone = root.Backbone;
//...
Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
};
```
这段代码的逻辑非常简单，我们可以通过以下方式使用:

``` 
var localBackbone = Backbone.noConflict();   
var model = localBackbone.Model.extend(...);
```

#### 混入underscore的方法

backbone通过addUnderscoreMethods将一些underscore的实用方法混入到自己定义的几个类中(注:确切地说是可供构造调用的函数,我们下文也会用类这个简单明了的说法代替)。

这里面值得一提的是关于underscore的方法(underscore的源码解读请移步<a href="https://github.com/aircloud/underscore-analysis" target="_blank">这里</a>,fork from韩子迟)，underscore的所有方法的参数序列都是固定的，也就是说第一个参数代表什么第二个参数代表什么，所有函数都是一致的，第一个参数一定代表目标对象，第二个参数一定代表作用函数(有的函数可能只有一个参数),在有三个参数的情况下，第三个参数代表上下文this，另外如果有第四个参数，第三个参数代表初始值或者默认值，第四个参数代表上下文。所以addMethod就是根据以上规定来使用的。

另外关于javascript中的this，我曾经写过博客<a href="http://aircloud.10000h.top/38" target="_blank">在这里</a>,有兴趣的可以看

混入方法的实现逻辑:

```
var addMethod = function(length, method, attribute) {
  //... 
};
var addUnderscoreMethods = function(Class, methods, attribute) {
    _.each(methods, function(length, method) {
      if (_[method]) Class.prototype[method] = addMethod(length, method, attribute);
    });
};
//之后使用：
var modelMethods = {keys: 1, values: 1, pairs: 1, invert: 1, pick: 0,
      omit: 0, chain: 1, isEmpty: 1};
//混入一些underscore中常用的方法
addUnderscoreMethods(Model, modelMethods, 'attributes');
```

### backbone Events

backbone的Events是一个对象,其中的方法(on\listenTo\off\stopListening\once\listenToOnce\trigger)都是对象方法。

总体上，backbone的Events实现了监听/触发/解除对自己对象本身的事件，也可以让一个对象监听/解除监听另外一个对象的事件。

#### 绑定对象自身的监听事件on

关于对象自身事件的绑定，这个比较简单，除了最基本的绑定之外(一个事件一个回调)，backbone还支持以下两种方式的绑定：

```
//传统方式
model.on("change", common_callback);  

//传入一个名称，回调函数的对象
model.on({ 
     "change": on_change_callback,
     "remove": on_remove_callback
});  

//使用空格分割的多个事件名称绑定到同一个回调函数上
model.on("change remove", common_callback);  
```
这用到了它定义的一个中间函数eventsApi，这个函数比较实用，可以根据判断使用的是哪种方式(实际上这个判断也比较简单，根据传入的是对象判断属于上述第二种方式，根据正则表达式判断是上述的第三种方式，否则就是传统的方式)。然后再进行递归或者循环或者直接处理。

在对象中存储事件实际上大概是下述形式:

```
events:{
	change:[事件一,事件二]
	move:[事件一,事件二,事件三]
}
```

而其中的事件实际上是一个整理好的对象，是如下形式:

```
{callback: callback, context: context, ctx: context || ctx, listening: listening}
```

这样在触发的时候,一个个调用就是了。

#### 监听其他对象的事件listenTo

backbone还支持监听其他对象的事件，比如，B对象上面发生b事件的时候，通知A调用回调函数`A.listenTo(B, “b”, callback);`，而这也是backbone处理非常巧妙的地方，我们来看看它是怎么做的。

实际上，这和B监听自己的事件，并且在回调函数的时候把上下文变成A，是差不多的:`B.on(“b”, callback, A);`(on的第三个参数代表上下文)。

但是backbone还做了另外的事情，这里我们假设是A监听B的一个事件(比如change事件好了)。

首先A有一个`A._listeningTo`属性，这个属性是一个对象，存放着它监听的别的对象的信息`A._listeningTo[id] = {obj: obj, objId: id, id: thisId, listeningTo: listeningTo, count: 0}`,这个id并不是数字，是每一个对象都有的唯一字符串，是通过`_.uniqueId`这个underscore方法生成的，这里的obj是B，objId是B的_listenId,id是A的_listenId,count是一个计数功能,而这个`A._listeningTo[id]`会被直接引用赋值到上面事件对象的listening属性中。

#### 为什么要多listenTo？Inversion of Control

通过以上我们似乎有一个疑问，好像on就能把listenTo的功能搞定了，用一个listenTo纯属多余，并且许多其他的类库也是只有一个on方法。

首先，这里会引入一个概念:**控制反转**，所谓控制反转，就是原来这个是B对象来控制的事件我们现在交由A对象来控制，那现在假设A分别listenTo B、C、D三个对象,那么这个时候假设A不监听了，那么我们直接对A调用一个stopListening方法，则可以同时解除对B、C、D的监听(这里我讲的可能不是十分正确，这里另外推荐一个<a href="https://segmentfault.com/a/1190000002549651" target="_blank">文章</a>)。

另外，我们需要从backbone的设计初衷来看，backbone的重点是View、Model和Collection，实际上，backbone的View可以对应一个或者多个Collection，当然我们也可以让View直接对应Model，但问题是View也并不一定对应一个Model，可能对应多个Model，那么这个时候我们通过listenTo和stopListening可以非常方便的添加、解除监听。

```
//on的方式绑定
var view = {
    DoSomething :function(some){
       //...
    }
}
model.on('change:some',view.DoSomething,view);
model2.on('change:some',view.DoSomething,view);

//解绑,这个时候要做的事情比较多且乱
model.off('change:some',view.DoSomething,view);
model2.off('change:some',view.DoSomething,view);

//listenTo的方式绑定
view.listenTo(model,'change:some',view.DoSomething);
view.listenTo(model2,'change:some',view.DoSomething);

//解绑
view.stopListening();
```
另外，在实际使用中，listengTo的写法也的确更加符合用户的习惯.

以下是摘自backbone官方文档的一些解释，仅供参考:
>The advantage of using this form, instead of other.on(event, callback, object), is that listenTo allows the object to keep track of the events, and they can be removed all at once later on. The callback will always be called with object as context.

#### 解除绑定事件off、stopListening

与on不同，off的三个参数都是可选的   

* 如果没有任何参数，off相当于把对应的_events对象整体清空   
* 如果有name参数但是没有具体指定哪个callback的时候，则把这个name(事件)对应的回调队列全部清空   
* 如果还有进一步详细的callback和context，那么这个时候移除回调函数非常严格，必须要求上下文和原来函数完全一致   

off的最终实现函数是offApi,这个函数算上注释有大概50行。

```
var offApi = function(events, name, callback, options) {
  //... 
}
```

这里面需要单独提一下，前面有这样的几行：

```
if (!name && !callback && !context) {
      var ids = _.keys(listeners);//所有监听它的对应的属性
      for (; i < ids.length; i++) {
        listening = listeners[ids[i]];
        delete listeners[listening.id];
        delete listening.listeningTo[listening.objId];
      }
      return;
}
```

这几行是做了一件什么事呢？  
删除了所有的多对象监听事件记录,之后删除自身的监听事件。我们假设A监听了B的一个事件，这个时候`A._listenTo`中就会多一个条目，存储这个监听事件的信息,而这个时候B的`B._listeners`也会多一个条目，存储监听事件的信息，*注意这两个条目都是按照id为键的键值对来存储，但是这个键是不一样的，值都指向同一个对象，这里删除对这个对象的引用，之后就可以被垃圾回收机制回收了*。如果这个时候调用`B.off()`，那么这个时候，以上的两个条目都被删除了。另外，注意最后的return,以及Events.off中的：

```
this._events = eventsApi(offApi, this._events, name, callback, {
      context: context,
      listeners: this._listeners
});
```
所以如果`B.off()`这样调用然后直接把 B._events 在之后也清空了，**太巧妙了**。

之后有一个对names(事件名)的循环(如果没有指定,那么默认就是所有names),这个循环内容理解起来比较简单，里面也顺便照顾了_listeners_listenTo这些变量。这里不过多解释了。

另外，stopListening实际上也是调用offApi，先处理了一下交给off函数，这也是设计模式运用典范(适配器模式)。

#### once和listenToOnce

这两个函数顾名思义，和on以及listenTo的区别不大，唯一的区别就是回调函数只供调用一次，多触发调用也没有用(实际上不会被触发了)。

两者都用到了onceMap这个函数，我们分析一下这个函数：

```
 var onceMap = function(map, name, callback, offer) {
    if (callback) {
      //_.once:创建一个只能调用一次的函数。重复调用改进的方法也没有效果，只会返回第一次执行时的结果。 作为初始化函数使用时非常有用, 不用再设一个boolean值来检查是否已经初始化完成.
      var once = map[name] = _.once(function() {
        offer(name, once);
        callback.apply(this, arguments);
      });
      //这个在解绑的时候有一个分辨效果
      once._callback = callback;
    }
    return map;
 };
```

backbone的设计思路是这样的:用`_.once()`创建一个只能被调用一次的函数，这个函数在第一次被触发调用的时候，进行解除绑定(offer实际上是一个已经绑定好this的解除绑定函数，这个可以参见once和listenToOnce的源代码)，然后再调用callback，这样既实现了调用一次的目的，也方便了垃圾回收。

其他和on以及listenTo的时候一样，这里就不过多介绍了。

#### trigger

trigger函数是用于触发事件，支持多个参数，除了第一个参数以外，其他的参数会依次放入触发事件的回调函数的参数中(backbone默认对3个参数及以下的情况下进行call调用,这种处理方式原因之一是call调用比apply调用的效率更高从而优先使用(关于call和apply的性能对比：https://jsperf.com/call-apply-segu)，另外一方面源码中并没有超过三个参数的情况，所以支持到了三个参数)。

另外值得一提的是，Events支持all事件，即如果你监听了all事件，那么任何事件的触发都会调用all事件的回调函数列。

关于trigger部分的源代码比较简单，并且我也增加了一些评注，这里就不贴代码了。

### backbone Model

backbone的Model实际上是一个可供构造调用的函数，backbone采用污染原型的方式把定义好的属性都定义在了prototype上，这可能并不是一个非常妥当的做法，但是在backbone中这样做却是没有什么不可以的，这个我们在之后讲extend方法的时候会进行补充。

我们先看看这个函数在实例化的时候会做点什么：

```
 var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    //这个preinitialize函数实际上是为空的,可以给有兴趣的开发者重写这个函数，在初始化Model之前调用
    this.preinitialize.apply(this, arguments);
    //Model的唯一的id
    this.cid = _.uniqueId(this.cidPrefix);
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    //如果之后new的时候传入的是JSON,我们必须在options选项中声明parse为true
    if (options.parse) attrs = this.parse(attrs, options) || {};
    //_.result:如果指定的property的值是一个函数，那么将在object上下文内调用它;否则，返回它。如果提供默认值，并且属性不存在，那么默认值将被返回。如果设置defaultValue是一个函数，它的结果将被返回。
    //这里调用_.result相当于给出了余地，自己写defaults的时候可以直接写一个对象，也可以写一个函数，通过return一个对象的方式把属性包含进去
    var defaults = _.result(this, 'defaults');
    //defaults应该是在Backbone.Model.extends的时候由用户添加的，用defaults对象填充object 中的undefined属性。 并且返回这个object。一旦这个属性被填充，再使用defaults方法将不会有任何效果。
    attrs = _.defaults(_.extend({}, defaults, attrs), defaults);
    this.set(attrs, options);
    //存储历史变化记录
    this.changed = {};
    //这个initialize也是空的，给初始化之后调用
    this.initialize.apply(this, arguments);
};
```
我们可以看出，this.attributes是存储实际内容的。

另外，preinitialize和initialize不仅在Model中有,在之后的Collection、View和Router中也都出现了，一个是在初始化前调用，另外一个是在初始化之后调用。

关于preinitialize的问题，我们后文还要继续讨论，它的出现和ES6有关。

#### Model set

Model的set方法是一个重点的方法，这个方法的功能比较多，本身甚至还可以删除属性，因为unset内部和clear的内部等也调用了set方法。在用户手动赋值的时候，支持下面两种赋值方式：`"key", value` 和`{key: value}`两种赋值方式。

我们分析这个函数总共做了哪些事情：

* 对两种赋值方式的支持`"key", value`和`{key: value}`的预处理。
* 如果你写了validate验证函数没有通过验证，那么就不继续做了(需要显式声明使用validate)。
* 进行变量的更改或者删除，顺便把历史版本的问题解决掉。
* 如果不是静默set的，那么这个时候开始进行change事件的触发。

具体这一块注释笔者写的非常详细，所以在这里也不再赘述。

#### fetch、save、destroy

这几个功能是需要跟服务端交互的，所以我们放在一起来分析一下。

backbone通过封装好模型和服务器交互的函数，大大方便了开发者和服务端数据同步的工作，当然，这需要一个对应的后端，不仅需要支持POST、PUT、PATCH、DELETE、GET多种请求，甚至连url的格式都给定义好了，url的格式为：yourUrl/id，这个id肯定是需要我们传入的，并且要求跟服务器上的id对应(毕竟服务器要识别处理)

*注意：url并不一定非要按照backbone的来，我们完全可以调用这几个方法的时候再指定一个url`{url:myurl,success:successFunction}`,这个部分backbone 在sync函数中进行了一个判断处理，优先选择后指定的url,不过这样对我们来说是比较麻烦的，也并不符合backbone的设计初衷*

这三个函数最后都用到了sync函数，所以我们要先分析sync函数：

```
Backbone.sync = function(method, model, options) {
  //...
};
  
Backbone.ajax = function() {
  return Backbone.$.ajax.apply(Backbone.$, arguments);
};
```

sync函数在其中调用了ajax函数，而ajax函数就是jQuery的ajax，这个我们非常熟悉，它可以插入非常多的参数，我们可以<a href="http://api.jquery.com/jquery.ajax/">这里</a>查看文档。

另外，这个sync支持两个特殊情况：

* emulateHTTP:如果你想在不支持Backbone的默认REST/ HTTP方式的Web服务器上工作， 您可以选择开启Backbone.emulateHTTP。 设置该选项将通过 POST 方法伪造 PUT，PATCH 和 DELETE 请求 用真实的方法设定X-HTTP-Method-Override头信息。 如果支持emulateJSON，此时该请求会向服务器传入名为 _method 的参数。
* emulateJSON:如果你想在不支持发送 application/json 编码请求的Web服务器上工作，设置Backbone.emulateJSON = true;将导致JSON根据模型参数进行序列化， 并通过application/x-www-form-urlencoded MIME类型来发送一个伪造HTML表单请求

具体的这个sync方法，就是构造ajax参数的过程。

##### fetch

fetch可以传入一个回调函数，这个回调函数会在ajax的回调函数中被调用，另外ajax的回调函数是在fetch中定义的，这个回调函数做了这样几件事情：

```
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
```

##### save

save方法为向服务器提交保存数据的请求，如果是第一次保存，那么就是POST请求，如果不是第一次保存数据，那么就是PUT请求。

其中，传递的options中可以使用的字段以及意义为：

* wait: 可以指定是否等待服务端的返回结果再更新model。默认情况下不等待
* url: 可以覆盖掉backbone默认使用的url格式
* attrs: 可以指定保存到服务端的字段有哪些，配合options.patch可以产生PATCH对模型进行部分更新
* patch:boolean 指定使用部分更新的REST接口
* success: 自己定义一个回调函数
* data: 会被直接传递给jquery的ajax中的data，能够覆盖backbone所有的对上传的数据控制的行为
* 其他: options中的任何参数都将直接传递给jquery的ajax，作为其options


关于save函数具体的处理逻辑，我在源代码中添加了非常详细的注释，这里就不展开了。

##### destroy

销毁这个模型，我们可以分析，销毁模型要做以下几件事情：

* 停止对该对象所有的事件监听,本身都没有了,还监听什么事件
* 告知服务器自己要被销毁了(如果isNew()返回true,那么其实不用向服务器发送请求)
* 如果它属于某一个collection,那么要告知这个collection要把这个模型移除

其中，传递的options中可以使用的字段以及意义为：

* wait: 可以指定是否等待服务端的返回结果再销毁。默认情况下不等待
* success: 自己定义一个回调函数

#### Model的其他内容

另外值得一提的是，Model是要求传入的id唯一的，但是对这个id如果重复的情况下的错误处理做的不是很到位，所以有的时候你看控制台报错并不能及时发现问题。

### backbone Collection

Collection也是一个可供构造调用的函数，我们还是先看看这个Collection做了些什么：

```
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
```

实际上，我觉得backbone的Model、View、Collection里的逻辑还是比较清楚的，可读性也比较强，所以主要就是把注释写在代码里面。

#### Collection set

collection的一个核心方法,内容很长,我们可以把它理解为重置:给定一组新的模型,增加新的,去除不在这里面的(在添加模式下不去除),混合已经存在的。但是这个方法同时也很灵活,可以通过参数的设定来改变模式

set可能有如下几个调用场景：   

1. 重置模式，这个时候不在models里的model都会被清除掉。对应上文的：var setOptions = {add: true, remove: true, merge: true};
2. 添加模式，这个时候models里的内容会做添加用，如果有重复的(cid来判断)，会覆盖。对应上文的：var addOptions = {add: true, remove: false};

我们还是理一理里面做了哪些事情：
      
* 先规范化models和options两个参数
* 遍历models：
    * 如果是重置模式，那么遇到重复的就直接覆盖掉，并且也添加到set队列，遇到新的就先添加到set队列。之后还要删除掉models里没有而原来collection里面有的
    * 如果是添加模式，那么遇到重复的，就先添加到set队列，遇到新的也是添加到set队列
* 之后进行整理，整合到collection中(可能会触发排序操作)
* 如果不是静默处理，这个时候会触发各类事件

当然，我们在进行调用的时候，是不需要考虑这么复杂的，这个函数之所以做的这么复杂，是因为它也供许多内置的其他函数调用了，这样可以减少重复代码的冗余，符合函数式编程的思想。另外set函数虽然繁杂却不赘余，里面定义的函数内变量逻辑都有自己的作用。

#### sort

上文中提到了sort函数,sort所依据的是用户传入的comparator参数，这个参数可以是一个字符串表示的单个属性也可以是一个函数，另外也可以是一个多个属性组成的数组，如果是单个属性或者函数，就调用underscore的排序方法，如果是一个多个属性组成的数组，就调用原生的数组排序方法(原生方法支持按照多个属性分优先级进行排序)

#### fetch、create

这是Collection中涉及到和服务端交互的方法，这两个方法非常有区别。

fetch是直接从服务器拉取数据，并没有调用model的fetch方法，返回的数据格式应当是直接可以调用上文的set函数的数据格式，另外值得注意的是，想要调用这个方法，**一定要先指定url**

create是指将特定的model上传到服务器上去，并没有调用自己的方法而是最后调用了model自身的方法`model.save(null, options)`，这里第一个参数被赋值成null还是有意义的，我们通过分析save函数前几行代码就可以很明显地分析出原因。

#### CollectionIterator

这是一个基于ES6的新的内容，目的是创建一个遍历器，之后，我们可以在collection的一些方法中运用这个可遍历对象。

这个方面的知识可以看<a href="https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Iteration_protocols" target="_blank">这里</a>补充，三言两语也无法说清，简单地讲，就是如果正确地定义了一个next属性方法，这个对象就可以按照自己定义的方式来遍历了。

而backbone这里定义的这个遍历器更加强大，可以分别按照key、value、key和value三种方式遍历

我这里给出一个使用方式：

```
window.Test = Backbone.Model.extend({
    defaults: {content: ''
    }
});
// 创建集合模型类  
window.TestList = Backbone.Collection.extend({
    model: Test
});
// 向模型添加数据
var data = new TestList(
        [
            {
                id:100,
                content: 'hello,backbone!'
            },
            {
                id:101,
                content: 'hello,Xiaotao!'
            }
        ]
);
for(var ii of data.keys()){
    console.log(ii);
}
for( ii of data.values()){
    console.log(ii);
}
for( ii of data.entries()){
    console.log(ii);
}
```
具体这里是如何实现的，我相信大家看了上文链接给出的扩展知识之后，然后再结合我写了注释的源代码，应该都能看懂了。

#### Collection其他内容

另外，Collection还实现了非常多的小方法，也混入了很多underscore的方法，但核心都是操作`this.models`，`this.models`是一个正常的数组(所以，在js中本身实现了的方法也是可以在这里使用的)，可以直接访问。

另外值得一提的是，Collection中有一个_byId变量，这个变量通过cid和id来存取，起到一个方便直接存取的作用，在某些时候非常方便。

```
_addReference: function(model, options) {
      this._byId[model.cid] = model;
      var id = this.modelId(model.attributes);
      if (id != null) this._byId[id] = model;
      model.on('all', this._onModelEvent, this);
},
```

另外实际上，model除了作为Collection里面的元素，并且通过一个collection属性指向对应的Collection，实际上联系也并不是非常多，这也比较符合低耦合高内聚的策略。

### backbone View

接下来我们进入backbone的View部分，也就是和用户打交道的部分，我一开始用backbone的时候就是被View层可以通过定义events对象数组来方便地进行事件管理所吸引(虽然现在看来还有更方便的方案)

我们先来看一下View函数在用户新建View的时候做了些什么：

```
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
```
这里面值得一提的是`this._ensureElement()`这个函数，这个函数内部调用了很多函数，做了很多工作，我们首先看这个函数：

```
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
```


根据你是否传入一个dom元素(这个dom元素用来和View对应,也可以是jQuery元素)分成了两种情况执行,我们先看不传入的情况：

这个时候我们可以定义一些属性，这些属性都在接下来赋值到生成的dom对象上:

```
 _setAttributes: function(attributes) {
      this.$el.attr(attributes);
}
```

接下来看假设传入了了的情况：

```
 setElement: function(element) {
      this.undelegateEvents();
      this._setElement(element);
      this.delegateEvents();
      return this;
},
```

这里面又调用了三个函数，我们看一下这三个函数:

```
undelegateEvents: function() {
      if (this.$el) this.$el.off('.delegateEvents' + this.cid);
      return this;
},

_setElement: function(el) {
      this.$el = el instanceof Backbone.$ ? el : Backbone.$(el);
      this.el = this.$el[0];
},

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

delegate: function(eventName, selector, listener) {
      this.$el.on(eventName + '.delegateEvents' + this.cid, selector, listener);
      return this;
},
```

上面第四个函数为第三个函数所调用的，因此我们放在了一起。

第一个函数是解绑backbone所用的jQuery事件命名空间下的事件(.delegateEvents)，这个是方式这个事件被之前的其他View使用过，从而造成污染(实际上，这个一般情况下用的是不多的)。

第二个函数是初始化dom对象和jQuery对象，`$el`代表jQuery对象,el代表dom对象。

第三个函数是把我们写的监听事件进行重新绑定，我们写的事件满足下面的格式：

```
 //举个例子： 
 {
	 'mousedown .title':  'edit',
	 'click .button':     'save',
	 'click .open':       function(e) { ... }
 }
```


上面第三个函数就是一个解析函数，解析好后直接调用delegate函数进行事件的绑定，这里要注意你定义的事件的元素必须在提供的el内的，否则无法访问到。

#### render

另外，backbone中有一个render函数：

```
render: function() {
      return this;
},
```
这个render函数实际上有比较深远的意义，render函数默认是没有操作的，我们可以自己定义操作，然后可以在事件中`'change' 'render'`这样对应，这样每次变化就会重新调用render重绘，我们也可以自定义好render函数并且在初始化函数initialize中调用。另外，render函数默认的`return this;`隐含了backbone的一种期望：返回this从而支持链式调用。

render可以使用underscore的模版，并且这也是推荐做法，以下是一个非常简单的demo:

```
var Bookmark = Backbone.View.extend({
  template: _.template(...),
  render: function() {
    this.$el.html(this.template(this.model.attributes));
    return this;
  }
});
```

### backbone router、history

#### router

backbone相比于一些流行框架的好处就是自己实现了router部分，不用再引入其他插件，这点十分方便。

我们在使用router的时候，通常会采用如下写法:

```
var Workspace = Backbone.Router.extend({

  routes: {
    "help":                 "help",    // #help
    "search/:query":        "search",  // #search/kiwis
    "search/:query/p:page": "search"   // #search/kiwis/p7
  },

  help: function() {
    ...
  },

  search: function(query, page) {
    ...
  }

});
```

router的供构造调用的函数的主体部分也相当简单，没有做多余的事情:

```
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
```

这里我们展开_bindRoutes:

```
 _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
},
```

route函数是把路由处理成正则表达式形式，然后调用history.route函数进行绑定，history.route函数在网址每次变化的时候都会检查匹配，如果有匹配就执行回调函数，也就是下文`Backbone.history.route`传入的第二个参数，这样路由部分和history部分就联系在一起了。

```
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
```
上面的这段代码首先可能会调用`_routeToRegExp`这个函数进行正则处理，这个函数可能是backbone中最难懂的函数，不过不懂也并不影响我们继续分析(实际上，笔者也并没有完全懂这个函数，所以希望经验人士可以在这里给予帮助)。

```
 _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')//这个匹配的目的是将正则表达式字符进行转义
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional) {
                     return optional ? match : '([^/?]+)';
                   })
                   .replace(splatParam, '([^?]*?)');
      return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
},
```

另外调用了`_extractParameters`这个函数和`router.execute`这个函数，前者的作用就是将匹配成功的URL中蕴含的参数转化成一个数组返回，后者接受三个参数，分别是回调函数，参数列表和函数名(这里之前只有两个函数,后来backbone增加了第三个参数)。


```
 _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param, i) {
        // Don't decode the search params.
        if (i === params.length - 1) return param || null;
        return param ? decodeURIComponent(param) : null;
      });
}
execute: function(callback, args, name) {
      if (callback) callback.apply(this, args);
},
```

router的内容也就这些了，实现的比较简单清爽，代码也不多，关于处理历史记录浏览器兼容性的问题都放在了history部分，所以接下来我们来分析难啃的history部分。

#### history

这一块的内容比较重要，并且相比于之前的内容有些复杂，我尽量把自己的理解全都讲解出来。

我们先说明一下这个历史记录的作用：   
当你在浏览器访问的时候，可以通过左上角的前进后退进行切换，这就是因为产生了历史记录。

那么什么方式可以产生历史记录呢？

1. 页面跳转(肯定的,但是并不适用于SPA)
2. hash变化:形如`<a href="#123"></a>`这种点击后会触发历史记录)，但是不幸的是在IE7下并不能被写入历史记录
3. pushState，这种比较牛逼，可以默默的改变路由，比如把`article.html#article/54`改成`article.html#article/53`但是不触发页面的刷新，因为一般情况下这算是两个页面的，另外，这种情况需要服务端的支持，因此我在用backbone的时候较少采用这种做法(现在有一个概念叫做pjax，就是ajax+pushState，具体可以Google之)
4. iframe内url变化，变化iframe内的url也会触发历史记录，但是这个比较麻烦，另外，在IE中,无论iframe是一开始静态写在html中的还是后来用js动态创建的,都可以被写入浏览器的历史记录，其他浏览器一般只支持静态写在html中。所以，我们一般在2&3都不可用的情况下，才选用这种情况(IE7以下)

以上讲的基本就是backbone使用的方式，接下来我们再按照backbone使用逻辑和优先级进行一些讲解：

backbone默认是使用hash的，在不支持hash的浏览器中使用iframe，如果想要使用pushState，需要显式声明并且浏览器本身要支持(如果使用了pushState的话hash就不用了)。

所以backbone的history有一个非常大的start函数，这个函数从头到尾做了如下几件事情：

* 将页面的根部分保存在root中，默认是`/`
* 判断是否想用hashChange(默认为true)以及支持与否，判断是否想用pushState以及支持与否。
* 判断一下到底是用hash还是用push，并且做一些url处理
* 如果需要用到iframe，这个时候初始化一下iframe
* 初始化监听事件：用hash的话可以监听hashchange事件，用pushState的话可以监听popState事件，如果用了iframe，没办法，只能轮询了，这个主要是用来用户的前进后退。
* 最后最重要的：先处理以下当前页面的路由，也就是说，假设用户直接访问的并不是根页面，不能什么也不做呀，要调用相关路由对应的函数，所以这里要调用`loadUrl`

和start对应的stop函数，主要做了一些清理工作，如果能读懂start，那么stop函数应该是不难读懂的。

另外还有一个比较长的函数是navigate，这个函数的作用主要是存储/更新历史记录，主要和浏览器打交道，如果用hash的话，backbone自身是不会调用这个函数的(因为用不到)，但是可以供开发者调用：

开发者可以通过这个函数用js代码自动管理路由：

```
openPage: function(pageNumber) {
  this.document.pages.at(pageNumber).open();
  this.navigate("page/" + pageNumber);
}
```

另外，backbone在这一部分定义了一系列工具函数，用于处理url。

backbone的history这一部分写的非常的优秀，兼容性也非常的高，并且充分满足了高聚合低耦合的特点，如果自己也要实现history管理这一部分，那么backbone的这个history绝对是一个优秀的范例。

### extend

最后，backbone还定义了一个extend函数，这个函数我们再熟悉不过了，不过它的写法并没有我们想象的那么简单，

这个函数并没有直接将属性assign到parent上面(this),是因为这样会产生一个显著的问题:污染原型     
所以实际上backbone的做法是新建了一个子类,这个子对象承担着所有内容.

另外，这个extend函数也借鉴了ES6的一些写法，内容不多，理解起来也是简单的。

### ES6&backbone

backbone支持ES6的写法，关于这个写法问题，曾经GitHub上面有过激烈的争论，这里我稍作总结，先给出一个目前可行的写法：

```
class DocumentRow extends Backbone.View {

    preinitialize() {
        _.extend(this, {
          tagName:  "li",
          className: "document-row",
          events: {
            "click .icon":          "open",
            "click .button.edit":   "openEditDialog",
            "click .button.delete": "destroy"
          }
        });
    }

    initialize() {
        this.listenTo(this.model, "change", this.render);
    }

    render() {
        //...
    }
}
```

实际上，这个问题出现之前backbone的源代码中是没有preinitialize函数的，关于为什么最终是这样，我总结以下几点：

* ES6的class不能直接写属性(直接报错)，都要写成函数，因为如果有属性的话会出现共享属性的问题。
* ES6的class写法和ES5的不一样，也和backbone自己定义的extend是不一样的。是先要调用父类的构造方法，然后再有子类的this，在调用constructor之前是无法使用this的。所以下面这种写法就不行了：

```
class DocumentRow extends Backbone.View {

    constructor() {
        this.tagName =  "li";
        this.className = "document-row";
        this.events = {
            "click .icon":          "open",
            "click .button.edit":   "openEditDialog",
            "click .button.delete": "destroy"
        };
        super();
    }

    initialize() {
        this.listenTo(this.model, "change", this.render);
    }

    render() {
        //...
    }
}
```

但是如果把super提前，那么这个时候tagName什么的还没有赋值呢，element就已经建立好了。

另外，把属性强制写成函数的做法是被backbone支持的，但是我相信没有多少人愿意这样做吧：

```
class DocumentRow extends Backbone.View {

    tagName() { return "li"; }

    className() { return "document-row";}

    events() {
        return {
            "click .icon":          "open",
            "click .button.edit":   "openEditDialog",
            "click .button.delete": "destroy"
        };
    }

    initialize() {
        this.listenTo(this.model, "change", this.render);
    }

    render() {
        //...
    }
}
```

所以我们需要：及早把一些属性赋给父类覆盖掉父类默认属性，然后调用父类构造函数，然后再调用子类构造函数。所以加入一个preinitialize方法是一个比较好的选择。

如果还没有理解，不妨看看下面这个本质等价的小例子：

```
class A{
    constructor(){
        this.s=1;
        this.preinit();
        this.dosomething();
        this.init();
    }
    preinit(){}
    init(){}
    dosomething(){console.log("dosomething:",this.s)}//dosomething 2
}
class B extends A{
    preinit(){this.s=2;}
    init(){}
}
var b1 = new B();
console.log(b1.s);//2
```

### 总结

经过以上漫长的对backbone源代码分析的过程，我们了解了一个优秀的框架的源代码，我总结了backbone源码的几个特点如下：

* 充分发挥函数式编程的精神，符合函数式编程，之前有位前辈说对js的运用程度就取决于对js的函数式编程的认识程度，也是不无道理的。
* 高内聚低耦合可扩展，这一方面方便了我们使用backbone的一部分内容(比如只使用Events或者router)，另外一方面也方便了插件开发，以及能和其他的库比较好的兼容，我认为，这并不是一个强主张的库，你可以小规模地按照自己的方式使用，也可以大规模的完全按照backbone的期望使用。
* 在使用和兼容ES6的新特性上做了不少努力，在源代码中好几处都体现了ES6的内容，这让backbone作为一个老牌框架，在如今大规模使用做网页应用，依然十分可行。

--

参考资料   
backbone官方文档：http://backbonejs.org/   
backbone中文文档：http://www.css88.com/doc/backbone/   
Why Backbone.js and ES6 Classes Don't Mix：http://benmccormick.org/2015/04/07/es6-classes-and-backbone-js/   

关于backbone&ES6的讨论：  
https://github.com/jashkenas/backbone/issues/3560  
https://github.com/jashkenas/backbone/pull/3827  