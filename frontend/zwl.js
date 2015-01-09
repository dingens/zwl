ZWL = {};

ZWL.Display = function (element, graphinfo, timezoom) {
    this.svg = SVG(element).translate(0.5, 0.5);
                            /* put lines in the middle of pixels -> sharper*/

    this.timezoom = defaultval(timezoom, .25); // pixels per second
    this.epoch = 13042800; // the time that corresponds to y=0
    this.now = 13092300;
    this.starttime = this.now - 600;
    this.endtime = null;
    
    this.timeaxis = new ZWL.TimeAxis(this);
    // TODO: parse this
    this.graphs = [
        new ZWL.Graph(this, 'ring-xde', {})
    ];

    this.sizechange($(document).width()-25, 700);
};

ZWL.Display.prototype = {
    sizechange: function (width,height) {
        this.width = width;
        this.height = height;
        this.svg.size(width,height);
        this.endtime = this.starttime + this.height/this.timezoom;

        //TODO calculate useful arrangement
        this.graphs[0].sizechange(60,30,width-200,height-60);
        this.timeaxis.sizechange(width-80,30, 75,height-60);
    },
    timechange: function () {
        // code to be executed whenever `starttime` changes
        // this runs lots of times while the user moves the time axis, so keep it short!

        this.graphs[0].timechange();
        this.timeaxis.timechange();
        this.endtime = this.starttime + this.height/this.timezoom;

    },
    redraw: function () {
        this.graphs[0].redraw();
        this.timeaxis.redraw();
    },
    time2y: function (time) {
        return this.timezoom * (time - this.epoch);
    },
    y2time: function (y) {
        return y / this.timezoom + this.epoch;
    },
};


ZWL.Graph = function (display, strecke, viewcfg) {
    this.display = display;
    //TODO: fetch real strecke detail
    this.strecke = ringxde;
    this.xstart = defaultval(viewcfg.xstart, 0);
    this.xend = defaultval(viewcfg.xend, 1);
    this.trains = {};
    this.svg = this.display.svg.group();

    this.trainboxframe = this.svg.rect(0,0).addClass('trainboxframe');
    this.traincliprect = this.svg.rect(0,0);
    this.trainclip = this.svg.clip().add(this.traincliprect);
    this.trainbox = this.svg.group().addClass('trainbox');

    this.nowmarker = this.trainbox.line(-1,-1,-1,-1).addClass('nowmarker');

    this.pastblur = {};
    this.pastblur.group = this.trainbox.group().addClass('pastblur');
    this.pastblur.past = this.pastblur.group.rect(0,0).addClass('pastblur-past');
    this.pastblur.future = this.pastblur.group.rect(0,0)
        .addClass('pastblur-future');
    this.pastblur.mask = this.svg.mask().add(this.pastblur.group);

    this.locaxis = {};
    this.locaxis.g = this.svg.group().addClass('locaxis');
    this.locaxis.bottom = this.svg.use(this.locaxis.g);

    for ( var i in this.strecke.elements ) {
        var loc = this.strecke.elements[i];
        if ( 'code' in loc ) {
            this.locaxis[loc.id] = this.locaxis.g.plain(loc.code)
                .attr('title', loc.name).move(-100,-100); // don't display yet
        }
    }
};

ZWL.Graph.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        // position and dimensions of visible area
        this.x = x;
        this.y = y;
        this.viswidth = width;
        this.visheight = height;
        this.redraw();
    },
    timechange: function () {
        this.trainbox.translate(this.x, this.y - this.display.time2y(this.display.starttime));

        this.traincliprect
            .size(this.viswidth,this.visheight)
            .move(0,this.display.time2y(this.display.starttime));
    },
    redraw: function () {
        // size of internal drawing (covering the whole strecke)
        this.drawwidth = this.viswidth / (this.xend-this.xstart)
        this.trainboxframe
            .size(this.viswidth, this.visheight)
            .move(this.x, this.y)
            .back();

        this.timechange();

        this.locaxis.g.translate(this.x, this.y-this.measures.locaxisoverbox);
        this.locaxis.bottom.translate(0, this.visheight
            + this.measures.locaxisoverbox + this.measures.locaxisunderbox);
        for ( var i in this.strecke.elements ) {
            var loc = this.strecke.elements[i];
            if ( 'code' in loc )
                this.locaxis[loc.id].move(this.pos2x(loc.id), 0);
        }

        this.pastblur.past
            .size(this.drawwidth, this.display.time2y(this.display.now))
            .move(this.pos2x(0), 0);
        this.pastblur.future
            .size(this.drawwidth, 999999)
            .move(this.pos2x(0), this.display.time2y(this.display.now));

        this.nowmarker.plot(this.pos2x(0),this.display.time2y(this.display.now),
                            this.pos2x(0)+this.drawwidth,this.display.time2y(this.display.now));

        this.fetch_trains();
        for ( var tid in this.trains ) {
            var train = this.trains[tid];
            if ( train.status == 'deleted' ) {
                train.drawing.remove();
            } else if ( train.status == 'new') {
                train.drawing = new ZWL.TrainDrawing(this, train);
            } else if ( train.status == 'updated') {
                train.drawing.redraw();
            }
        }
    },
    _fetch_trains_called: false,
    fetch_trains: function () {
        if ( !this._fetch_trains_called ) {
            this.trains = {
                406: {'info':ice406, 'status': 'new'},
                2342: {'info':ire2342, 'status': 'new'},
                12345: {'info':rb12345, 'status': 'new'},
            }
        } else {
            for ( var tid in this.trains ) {
                this.trains[tid].status = 'updated';
            }
        }
        this._fetch_trains_called = true;
    },
    pos2x: function (id) {
        // allow values like xstart and xend as input
        if ( typeof(id) == 'number')
            return (id-this.xstart)*this.drawwidth;

        var elm = this.strecke.getElement(id);
        return (elm.pos-this.xstart) * this.drawwidth;
    },
    measures: {
        locaxisoverbox: 30,
        locaxisunderbox: 15,
        trainlabelxmargin: 5,
        trainlabelymargin: 2,
    }
};

ZWL.TimeAxis = function ( display ) {
    this.display = display;

    this.mask = this.display.svg.rect();
    this.svg = this.display.svg.group().clipWith(this.mask)
                                       .addClass('timeaxis');
    this.axis = this.svg.group().draggable(this.draggableconstraints)
                                .addClass('axis');
    this.bg = this.axis.rect().addClass('timeaxis-bg');

    this.zoombuttons = {}
    this.zoombuttons.g = this.svg.group().addClass('zoombuttons');
    this.zoombuttons.bg = this.zoombuttons.g.rect(55,30).addClass('bg');
    this.zoombuttons.plus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10 M 10,3 L 10,17'))
        .click(function() { display.timezoom *= Math.SQRT2; display.redraw(); });
    this.zoombuttons.minus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10'))
        .click(function() { display.timezoom /= Math.SQRT2; display.redraw(); });

    var timeaxis = this; // `this` is overridden in dragging functions
    this.axis.dragstart = function (delta, event) {
        this.addClass('grabbing');
    }
    this.axis.dragmove = function (delta, event) {
        var old = timeaxis.display.starttime;
        timeaxis.display.starttime = timeaxis.display.y2time((-this.transform().y));
        timeaxis.display.timechange();
    };
    this.axis.dragend = function (delta, event) {
        this.removeClass('grabbing');
        timeaxis.display.redraw();
    };

    this.times = {}
}

ZWL.TimeAxis.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.redraw();
    },
    timechange: function () {
        this.axis.translate(0, -this.display.time2y(this.display.starttime));
    },
    redraw: function () {
        this.timechange();
        this.svg.translate(this.x,this.y);
        this.mask.size(this.width,this.height).move(0,0);

        // we draw everything about one extra screen height to the top and
        // bottom (for scrolling)
        this.bg.size(this.width*2,this.height*3)
               .move(-this.width/2, this.display.time2y(this.display.starttime) - this.height);
        for ( var time in this.times ) {
            this.times[time].remember('unused', true);
        }
        var onescreen = this.height / this.display.timezoom;
        var time = Math.floor((this.display.starttime - onescreen) / 60) * 60
        var end = time + 3*onescreen + 120;
        var t, text, line;
        for ( ; time < end; time += 60 ) {
            if ( !(time in this.times )) {
                t = this.times[time] = this.axis.group();
                if ( (time % 600) == 0 ) {
                    text = t.plain(timeformat(time, 'hm'));
                    text.move(20, -text.bbox().height / 2);
                    t.remember('text', text);
                }
                if ( (time % 300) == 0)
                    line = t.line(5,0, 15,0);
                else
                    line = t.line(10,0, 15,0);
                t.remember('line', line.attr('title', timeformat(time, 'hm')));
            }
            this.times[time].translate(0, this.display.time2y(time))
                            .remember('unused', null);
        }

        for ( time in this.times )
            if (this.times[time].remember('unused')) {
                this.times[time].remove();
                delete this.times[time];
            }

        this.zoombuttons.plus.translate(this.width-50,this.height-25);
        this.zoombuttons.minus.translate(this.width-25,this.height-25);
        this.zoombuttons.bg.translate(this.width-55,this.height-30);
    },

    draggableconstraints: function (x, y) {
        return {x: x == 0, y: true}; //TODO use end of timetable
    },
}

ZWL.TrainInfo = function (gattung, nr, timetable, comment) {
    this.gattung = gattung;
    this.nr = nr;
    this.timetable = timetable;
    this.comment = comment;
    this.name = this.gattung + ' ' + this.nr.toString();
}

ZWL.TrainDrawing = function (graph, train) {
    this.graph = graph;
    this.display = graph.display;
    this.train = train;
    this.points = null;
    this.svg = this.graph.trainbox.group()
        .addClass('trainlineg').addClass('train' + train.info.nr)
        .attr('title', train.info.name)
        .mouseover(function(){ console.log('mouseover',this);this.front(); this.addClass('selected')})
        .mouseout(function(){ this.removeClass('selected')});

    this.trainline = this.svg.polyline([[-1,-1]]).addClass('trainline')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);
    // bg = invisible, thicker line to allow easier pointing
    this.trainlinebg = this.svg.polyline([[-1,-1]]).addClass('trainlinebg')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);

    this.label = {}
    this.label.g = this.svg.group().addClass('trainlabel');
    this.label.nr = this.label.g.plain(this.train.info.nr)
        .move(this.graph.measures.trainlabelxmargin,
              this.graph.measures.trainlabelymargin);
    var bb = this.label.nr.bbox();
    this.label.box = this.label.g.rect(
        bb.width+this.graph.measures.trainlabelxmargin*2,
        bb.height+this.graph.measures.trainlabelymargin*2).back();
    this.label.entry = this.svg.use(this.label.g);
    this.label.exit = this.svg.use(this.label.g);
    this.redraw();
}

ZWL.TrainDrawing.prototype = {
    redraw: function () {
        var tt = this.train.info.timetable;
        this.points = [];
        for ( var elm in tt ) {
            if ( tt[elm]['loc'] ) {
                if ( tt[elm]['arr_real'] != undefined )
                    this.points.push([tt[elm]['loc'],
                                      tt[elm]['arr_real']]);
                if ( tt[elm]['dep_real'] != undefined &&
                     tt[elm]['dep_real'] != tt[elm]['arr_real'] )
                    this.points.push([tt[elm]['loc'],
                                      tt[elm]['dep_real']]);

                laststop = tt[elm];
            }
        }

        var coordinates = this.points.map(function (p) {
            return [this.graph.pos2x(p[0]), this.display.time2y(p[1])];
        }, this);
        this.trainline.plot(coordinates);
        this.trainlinebg.plot(coordinates);

        this.reposition_label('entry', this.label.entry);
        this.reposition_label('exit', this.label.exit);
    },
    reposition_label: function (mode, label) {
        // names of variables within this function always refer to the
        // mode=entry case but apply to the mode=exit case as well

        if ( mode != 'entry' && mode != 'exit' )
            return console.error('no such mode: ' + mode);

        var tt = this.train.info.timetable;

        var firststop, firststop_time, secondstop, secondstop_time;
        if ( mode == 'entry') {
            firststop = tt[0];
            firststop_time = firststop.dep_real;
            secondstop = tt[2]; // tt[1] is strecke
            secondstop_time = secondstop.arr_real;
        } else if ( mode == 'exit') {
            firststop = tt[tt.length-1];
            firststop_time = firststop.arr_real;
            secondstop = tt[tt.length-3];
            secondstop_time = secondstop.dep_real;
        }

        var x, y, orientation;
        // simple case: train start/stops within graph
        var firststop_pos = this.graph.strecke.getElement(firststop.loc).pos;
        var secondstop_pos = this.graph.strecke.getElement(secondstop.loc).pos;
        if ( firststop_time.within(this.display.starttime, this.display.endtime)
             && firststop_pos.within(this.graph.xstart, this.graph.xend) ) {
            x = this.graph.pos2x(firststop_pos);
            y = this.display.time2y(firststop_time);
            orientation = (firststop_pos < secondstop_pos) ? 'left' : 'right';
        }

        if ( x == null || y == null || orientation == null ) {
            console.log('no position for ' + this.train.info.nr + ' ' + mode
                        + ' label defined, removing');
            label.translate(-100, -100);
        }

        // avoid lines "between pixels"
        x = Math.floor(x); y = Math.floor(y);
        var bb = label.bbox();
        if ( orientation == 'left') {
            label.translate(x-bb.width-5,y-bb.height/2);
        } else if ( orientation == 'right') {
            label.translate(x+5,y-bb.height/2);
        }
    },

    remove: function () {
        this.svg.remove();
    },
}

ZWL.LineConfiguration = function(name, elements) {
    this.name = name;
    this.elements = elements;
}

ZWL.LineConfiguration.prototype = {
    getElement: function ( id ) {
        //TODO: speed this up by caching this in an object
        for ( var i in this.elements )
            if ( this.elements[i].id == id )
                return this.elements[i];
        console.error('no such element', id);
        return undefined;
    },
}

// HELPERS

function defaultval(val, def) {
    return val === undefined ? def : val;
}

function coalesce() {
    for(var i in arguments)
        if (arguments[i] !== null && arguments[i] !== undefined)
            return arguments[i];
    return null;
}

function timeformat (time, format) {
    var d = new Date(time*1000);
    if ( format == 'hm')
        return d.getHours() + ':' + d.getMinutes();
    else
        console.error('invalid format given');
}

if (!Number.between) {
    Object.defineProperty(Number.prototype, 'between', {
        enumerable: false,
        value: function (a, b) {
            return this > a && this < b;
        },
    });
}

if (!Number.within) {
    Object.defineProperty(Number.prototype, 'within', {
        enumerable: false,
        value: function (a, b) {
            return this >= a && this <= b;
        },
    });
}

// some data for playing around (later to be fetched from the server)
ringxde = new ZWL.LineConfiguration('Ring (ab Derau)', [
    {'type':'bhf', 'id':'XDE#1', 'pos':0, code:'XDE', 'name':'Derau'},
    {'type':'str', 'id':'XDE#1_XCE#1', 'pos':.15, 'length':3000, 'tracks':2},
    {'type':'bhf', 'id':'XCE#1', 'pos':.3, code:'XCE', 'name':'Cella'},
    {'type':'str', 'id':'XCE#1_XLG#1', 'pos':.4, 'length':2000, 'tracks':2},
    {'type':'bhf', 'id':'XLG#1', 'pos':.5, code:'XLG', 'name':'Leopoldgrün'},
    {'type':'str', 'id':'XLG#1_XDE#2', 'pos':.75, 'length':5000, 'tracks':2},
    {'type':'bhf', 'id':'XDE#2', 'pos':1, code:'XDE', 'name':'Derau'},
]);
ice406 = new ZWL.TrainInfo('ICE', 406, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091820},
    {'str':'XDE#1_XCE#1'},
    {'loc':'XCE#1', 'arr_real':13092000, 'dep_real':13092060},
    {'str':'XCE#1_XLG#1'},
    {'loc':'XLG#1', 'arr_real':null, 'dep_real':13092300},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092600, 'dep_real':null},
]);
ire2342 = new ZWL.TrainInfo('IRE', 2342, [
    {'loc':'XDE#2', 'arr_real':null, 'dep_real':13092240},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XLG#1', 'arr_real':13092540, 'dep_real':13092540},
]);
rb12345 = new ZWL.TrainInfo('RB', 12345, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091800},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092260, 'dep_real':null},
]);
